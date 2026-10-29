import { extractEvidence, runFreeRules, runInformationalRules, scoreOf } from './audit'
import { checkBrokenLinks } from './links'
import { isPremiumEntitled, PREMIUM_NOT_ENABLED } from './entitlements'
import {
  FETCH_TIMEOUT_MS, MAX_BODY_BYTES, MAX_REDIRECTS,
  RateLimiter, resolveRedirect, validateTargetUrl,
} from './security'

// Kluzar SEO Worker — kluzar-seo-audit
// Endpoints:
//   GET  /api/health         — liveness, no audit, no fetch
//   POST /api/audit          — free page audit (public pages only) + bounded
//                              broken-link check (5 internal links, Starter)
//   POST /api/launch-checks  — robots.txt + sitemap availability for the
//                              audited origin only (no Analytics/Search
//                              Console connection, ever, in this release)
//   POST /api/premium-audit  — always 403 in v1 (premium not enabled)
//   OPTIONS *                — CORS preflight for the origins below
// API contract is v1 and additive: v2 adds fields, it never changes the
// /100 score (new findings are 0-point informational findings).
//
// CORS policy (no wildcard, ever):
//   - Allowed: https://seo.kluzar.com, plus localhost / 127.0.0.1
//     (any port) for local development ONLY.
//   - Everything else: no Access-Control-Allow-Origin header, so browsers
//     block the response.
//   - CORS is NOT the premium security boundary. Premium is gated by the
//     server-side entitlement check in entitlements.ts (403 in v1).

export interface Env {
  ALLOWED_ORIGINS?: string
  PREMIUM_ENABLED?: string
}

const limiter = new RateLimiter(10, 600_000)

function allowedOrigin(request: Request, _premium = false): string | null {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  let parsed: URL
  try { parsed = new URL(origin) } catch { return null }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (parsed.hostname === 'seo.kluzar.com' && parsed.protocol === 'https:') return origin
  // Localhost is allowed for local development on ALL endpoints, including
  // premium: CORS is not the premium security boundary — the entitlement
  // check in entitlements.ts is. In production the origin is seo.kluzar.com.
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return origin
  return null
}

function corsHeaders(request: Request, premium = false): Record<string, string> {
  const origin = allowedOrigin(request, premium)
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function json(request: Request, premium: boolean, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, premium),
      ...extra,
    },
  })
}

function safeError(request: Request, premium: boolean, error: string, code: string, status: number, extra: Record<string, string> = {}): Response {
  // Generic messages only — no stack traces, no internal URLs, no secrets.
  return json(request, premium, { error, code }, status, extra)
}

async function readBodyWithLimit(response: Response): Promise<{ ok: true; text: string } | { ok: false; error: string; code: string }> {
  if (!response.body) return { ok: false, error: 'Upstream returned no body.', code: 'UPSTREAM_EMPTY' }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => undefined)
          return { ok: false, error: 'Page is too large to audit (over 1.5 MB of HTML).', code: 'TOO_LARGE' }
        }
        chunks.push(value)
      }
    }
  } catch {
    return { ok: false, error: 'Failed while reading the page.', code: 'UPSTREAM_READ_FAILED' }
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength }
  return { ok: true, text: new TextDecoder('utf-8').decode(merged) }
}

async function fetchPublicPage(startUrl: URL): Promise<
  | { ok: true; finalUrl: string; status: number; html: string; headers: { server: string | null; contentType: string | null; xRobotsTag: string | null; strictTransportSecurity: string | null; xContentTypeOptions: string | null; xFrameOptions: string | null; referrerPolicy: string | null; hasContentSecurityPolicy: boolean }; redirectChain: { status: number; url: string }[] }
  | { ok: false; error: string; code: string; status: number }
> {
  let current = startUrl
  const chain: { status: number; url: string }[] = []
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'KluzarSEO-Audit/1.0 (+https://seo.kluzar.com/)',
          Accept: 'text/html,application/xhtml+xml',
        },
      })
    } catch (err) {
      clearTimeout(timer)
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'Page took too long to respond (over 10 seconds).'
        : 'Could not fetch the page. Check the URL and try again.'
      return { ok: false, error: msg, code: 'FETCH_FAILED', status: 502 }
    } finally {
      clearTimeout(timer)
    }
    const status = response.status
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.get('Location')
      await response.body?.cancel().catch(() => undefined)
      if (!location) return { ok: false, error: 'Page redirected without a destination.', code: 'BAD_REDIRECT', status: 502 }
      if (hop === MAX_REDIRECTS) return { ok: false, error: 'Too many redirects (over 5).', code: 'TOO_MANY_REDIRECTS', status: 502 }
      const next = resolveRedirect(current, location)
      if (!next.ok) return { ok: false, error: next.error, code: next.code, status: 400 }
      chain.push({ status, url: current.toString() })
      current = next.url
      continue
    }
    const contentType = response.headers.get('Content-Type')
    if (!contentType || !contentType.toLowerCase().includes('text/html')) {
      await response.body?.cancel().catch(() => undefined)
      return { ok: false, error: 'That URL did not return an HTML page, so it cannot be audited as a web page.', code: 'NOT_HTML', status: 502 }
    }
    if (status !== 200) {
      await response.body?.cancel().catch(() => undefined)
      return { ok: false, error: `Page returned HTTP ${status}, so a full audit was not run.`, code: 'UPSTREAM_STATUS', status: 502 }
    }
    const body = await readBodyWithLimit(response)
    if (!body.ok) return { ok: false, error: body.error, code: body.code, status: 502 }
    return {
      ok: true,
      finalUrl: current.toString(),
      status,
      html: body.text,
      headers: {
        server: response.headers.get('Server'),
        contentType,
        xRobotsTag: response.headers.get('X-Robots-Tag'),
        strictTransportSecurity: response.headers.get('Strict-Transport-Security'),
        xContentTypeOptions: response.headers.get('X-Content-Type-Options'),
        xFrameOptions: response.headers.get('X-Frame-Options'),
        referrerPolicy: response.headers.get('Referrer-Policy'),
        hasContentSecurityPolicy: response.headers.get('Content-Security-Policy') !== null,
      },
      redirectChain: chain,
    }
  }
  return { ok: false, error: 'Too many redirects (over 5).', code: 'TOO_MANY_REDIRECTS', status: 502 }
}


async function fetchTextLimited(startUrl: URL): Promise<
  | { ok: true; status: number; text: string }
  | { ok: false; status: number | null }
> {
  let current = startUrl
  for (let hop = 0; hop <= 3; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    let response: Response
    try {
      response = await fetch(current.toString(), { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'KluzarSEO-Audit/1.0 (+https://seo.kluzar.com/)', Accept: '*/*' } })
    } catch {
      clearTimeout(timer)
      return { ok: false, status: null }
    } finally { clearTimeout(timer) }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location')
      await response.body?.cancel().catch(() => undefined)
      if (!location || hop === 3) return { ok: false, status: response.status }
      const next = resolveRedirect(current, location)
      if (!next.ok) return { ok: false, status: null }
      current = next.url
      continue
    }
    const body = await readBodyWithLimit(response)
    // readBodyWithLimit caps at 1.5 MB; for robots/sitemap this is generous.
    if (!body.ok) return { ok: false, status: response.status }
    return { ok: true, status: response.status, text: body.text.slice(0, 100000) }
  }
  return { ok: false, status: null }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS preflight — only for allowed origins, and premium paths are
    // stricter (seo.kluzar.com only).
    if (request.method === 'OPTIONS') {
      const origin = allowedOrigin(request)
      if (!origin) return new Response(null, { status: 403 })
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      })
    }

    if (request.method === 'GET' && path === '/api/health') {
      return json(request, false, { ok: true, service: 'kluzar-seo-audit', version: '1' })
    }

    if (request.method === 'POST' && path === '/api/premium-audit') {
      // Premium is gated here, before any fetch or data is produced.
      // isPremiumEntitled() is false for every caller in v1 by design.
      if (!isPremiumEntitled(request, env)) {
        return json(request, true, PREMIUM_NOT_ENABLED, 403)
      }
      return json(request, true, { error: 'Premium audit is not implemented in this release.', code: 'PREMIUM_NOT_IMPLEMENTED' }, 501)
    }

    if (request.method === 'POST' && path === '/api/audit') {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      const rate = limiter.check(ip)
      if (!rate.allowed) {
        return safeError(request, false, 'Too many audits from this address. Please wait a few minutes and try again.', 'RATE_LIMITED', 429, { 'Retry-After': String(rate.retryAfterSec) })
      }
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return safeError(request, false, 'Request body must be JSON with a url field.', 'INVALID_REQUEST', 400)
      }
      const rawUrl = (body as { url?: unknown } | null)?.url
      const validated = validateTargetUrl(rawUrl)
      if (!validated.ok) {
        return safeError(request, false, validated.error, validated.code, 400)
      }
      const fetched = await fetchPublicPage(validated.url)
      if (!fetched.ok) {
        return safeError(request, false, fetched.error, fetched.code, fetched.status)
      }
      let evidence
      try {
        evidence = extractEvidence(fetched.html, fetched.finalUrl, fetched.headers)
      } catch {
        return safeError(request, false, 'Page HTML could not be analysed.', 'PARSE_FAILED', 502)
      }
      const findings = [...runFreeRules(evidence), ...runInformationalRules(evidence, fetched.finalUrl, fetched.headers)]
      const brokenLinks = await checkBrokenLinks(evidence.internalLinkUrls, 5)
      return json(request, false, {
        version: '1',
        auditedUrl: validated.url.toString(),
        finalUrl: fetched.finalUrl,
        status: fetched.status,
        fetchedAt: new Date().toISOString(),
        redirectChain: fetched.redirectChain,
        headers: fetched.headers,
        findings,
        score: scoreOf(findings),
        brokenLinks,
        internalLinkCount: evidence.internalLinks,
        blankWithoutNoopener: evidence.blankWithoutNoopener,
        premium: { available: false, reason: 'Premium audit is not enabled yet. Payment is a separate future integration.' },
        sample: false,
      })
    }


    if (request.method === 'POST' && path === '/api/launch-checks') {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      const rate = limiter.check(ip)
      if (!rate.allowed) {
        return safeError(request, false, 'Too many checks from this address. Please wait a few minutes and try again.', 'RATE_LIMITED', 429, { 'Retry-After': String(rate.retryAfterSec) })
      }
      let body: unknown
      try { body = await request.json() } catch {
        return safeError(request, false, 'Request body must be JSON with a url field.', 'INVALID_REQUEST', 400)
      }
      const rawUrl = (body as { url?: unknown } | null)?.url
      const validated = validateTargetUrl(rawUrl)
      if (!validated.ok) return safeError(request, false, validated.error, validated.code, 400)
      const origin = validated.url.origin
      // robots.txt: same origin only, never a user-supplied second URL.
      const robots = await fetchTextLimited(new URL(`${origin}/robots.txt`))
      let robotsFound = false
      const sitemapUrls: string[] = []
      if (robots.ok && robots.status === 200 && !robots.text.trimStart().startsWith('<')) {
        robotsFound = true
        for (const line of robots.text.split(/\r?\n/)) {
          const m = line.match(/^\s*Sitemap:\s*(\S+)/i)
          if (m) sitemapUrls.push(m[1])
        }
      }
      // Sitemap: first same-origin Sitemap: line from robots.txt, else /sitemap.xml.
      let sitemapUrl: string | null = null
      for (const candidate of sitemapUrls) {
        try {
          const u = new URL(candidate, origin)
          if (u.origin === origin) { sitemapUrl = u.toString(); break }
        } catch { /* ignore */ }
      }
      if (!sitemapUrl) sitemapUrl = `${origin}/sitemap.xml`
      const sitemap = await fetchTextLimited(new URL(sitemapUrl))
      const sitemapFound = sitemap.ok && sitemap.status === 200 && (sitemap.text.includes('<urlset') || sitemap.text.includes('<sitemapindex'))
      return json(request, false, {
        version: '1',
        auditedUrl: validated.url.toString(),
        origin,
        https: validated.url.protocol === 'https:',
        robotsTxt: { found: robotsFound, status: robots.ok ? robots.status : null, sitemapUrls: sitemapUrls.filter((u) => { try { return new URL(u, origin).origin === origin } catch { return false } }) },
        sitemap: { found: sitemapFound, url: sitemapFound ? sitemapUrl : null, status: sitemap.ok ? sitemap.status : null },
        checkedAt: new Date().toISOString(),
        note: 'Availability only. Analytics and Search Console are manual reminders, not checked here.',
      })
    }

    return safeError(request, false, 'Not found.', 'NOT_FOUND', 404)
  },
}
