// SECURITY — URL validation, SSRF / private-network blocking, redirect
// validation, fetch limits. Every public-page fetch goes through here.
// This is hostname/IP-literal based blocking. It does NOT prove the DNS
// resolution of a hostname, because Cloudflare Workers fetch() resolves DNS
// internally and there is no Workers API to resolve-then-check before fetch.
// That residual DNS-rebinding risk is documented in WORKER_SETUP.md and in
// the final report — do not claim this file alone makes SSRF impossible.

export const MAX_REDIRECTS = 5
export const FETCH_TIMEOUT_MS = 10_000
export const MAX_BODY_BYTES = 1_500_000

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet']
const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal'])

export function isIpv4(host: string): boolean {
  return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(host)
}

function ipv4Octets(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  // Reject leading zeros (e.g. 0177.0.0.1) — they can mean octal elsewhere.
  if (m.slice(1).some((p) => p.length > 1 && p.startsWith('0'))) return null
  if (parts.some((n) => n < 0 || n > 255)) return null
  return parts
}

export function isPrivateIpv4(host: string): boolean {
  const o = ipv4Octets(host)
  if (!o) return false
  const [a, b] = o
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 169 && b === 254) return true // link-local
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 0) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking, not public
  if (a >= 224) return true // multicast + reserved
  return false
}

export function isPrivateIpv6(host: string): boolean {
  // URL parsers differ: some return IPv6 hostnames with brackets ([::1]),
  // some without (::1). Strip brackets first, or the checks below miss.
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h.includes('%')) return true // zone id, never a public page
  if (h === '::1' || h === '::') return true
  if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return true // fe80::/10 link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true // fc00::/7 unique-local
  if (h.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — check the embedded IPv4 address.
    const embedded = h.slice('::ffff:'.length)
    return isPrivateIpv4(embedded)
  }
  if (h.startsWith('2001:db8')) return true // documentation range
  if (h.startsWith('64:ff9b:')) return true // NAT64 well-known prefix
  return false
}

// URL NORMALIZATION POLICY (client and server share this policy; the
// frontend module src/url.ts mirrors it for UX, the Worker is authoritative).
//   - Trim surrounding whitespace.
//   - Empty input, plain text without a valid hostname, and malformed
//     hostnames are rejected — arbitrary text is never turned into a site.
//   - A bare domain (example.com, www.example.com, example.com/about) has
//     NO scheme, so https:// is prepended. Bare domains prefer HTTPS.
//   - An explicit http:// URL is allowed (policy allows it); an explicit
//     https:// URL is never downgraded to http://.
//   - Any other scheme (javascript:, file:, ftp:, data:, etc.) is rejected,
//     with or without "//".
//   - URLs with a username/password, a non-80/443 port, a localhost or
//     private/internal hostname, or a hostname without a dot (and not an IP
//     literal) are rejected.
//   - Internationalized domains are handled by the URL parser, which
//     converts them to punycode (münchen.de -> xn--mnchen-3ya.de).
//   - The fragment is stripped (it is never sent to the server). The path
//     and query are preserved.
export function normalizeTargetUrl(raw: unknown): { ok: true; url: URL } | { ok: false; error: string; code: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'URL must be a string.', code: 'INVALID_URL' }
  const value = raw.trim()
  if (!value) return { ok: false, error: 'Enter a URL to analyze.', code: 'INVALID_URL' }
  if (value.length > 2048) return { ok: false, error: 'URL is too long (max 2048 characters).', code: 'INVALID_URL' }
  if (/\s/.test(value)) return { ok: false, error: 'That does not look like a valid URL. Check for spaces and try again.', code: 'INVALID_URL' }
  const schemeMatch = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') {
      return { ok: false, error: 'Only http:// and https:// URLs can be analyzed.', code: 'INVALID_URL' }
    }
  }
  const withScheme = schemeMatch ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, error: 'That does not look like a valid URL. Try a domain like example.com or a full URL like https://example.com/about', code: 'INVALID_URL' }
  }
  return validateParsedUrl(url)
}

function validateParsedUrl(url: URL): { ok: true; url: URL } | { ok: false; error: string; code: string } {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// URLs can be analyzed.', code: 'INVALID_URL' }
  }
  if (url.username || url.password) {
    return { ok: false, error: 'URLs with a username or password cannot be analyzed.', code: 'INVALID_URL' }
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return { ok: false, error: 'URL has no hostname.', code: 'INVALID_URL' }
  if (BLOCKED_HOSTS.has(host) || host === 'localhost') {
    return { ok: false, error: 'Private and local addresses cannot be analyzed.', code: 'PRIVATE_TARGET' }
  }
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, error: 'Private and local addresses cannot be analyzed.', code: 'PRIVATE_TARGET' }
  }
  if (!host.includes('.') && !host.includes(':')) {
    return { ok: false, error: 'Only public websites with a domain name can be analyzed.', code: 'PRIVATE_TARGET' }
  }
  if (isIpv4(host) && isPrivateIpv4(host)) {
    return { ok: false, error: 'Private and local addresses cannot be analyzed.', code: 'PRIVATE_TARGET' }
  }
  if (host.includes(':') && isPrivateIpv6(host)) {
    return { ok: false, error: 'Private and local addresses cannot be analyzed.', code: 'PRIVATE_TARGET' }
  }
  // Port scanning defence: public pages live on 80/443. Non-standard ports
  // are blocked rather than probed.
  if (url.port && url.port !== '80' && url.port !== '443') {
    return { ok: false, error: 'Only standard web ports (80 and 443) can be analyzed.', code: 'INVALID_URL' }
  }
  // Strip any fragment — it is never sent to the server anyway.
  url.hash = ''
  return { ok: true, url }
}

export function validateTargetUrl(raw: unknown): { ok: true; url: URL } | { ok: false; error: string; code: string } {
  // validateTargetUrl now normalizes first (bare domain -> https), then
  // validates. Existing callers (audit, launch-checks, redirects) get the
  // new behaviour without any other change. Redirects are resolved with
  // new URL(location, current) first, so they always carry a scheme and
  // are validated by validateParsedUrl via this same path.
  return normalizeTargetUrl(raw)
}

export function resolveRedirect(current: URL, location: string): ReturnType<typeof validateTargetUrl> {
  let next: URL
  try {
    next = new URL(location, current)
  } catch {
    return { ok: false, error: 'Redirect target is not a valid URL.', code: 'BAD_REDIRECT' }
  }
  return validateTargetUrl(next.toString())
}

// In-memory, per-isolate rate limit. This is NOT a global limit: Cloudflare
// Workers isolates do not share memory, so a determined caller can spread
// requests across isolates. A global limit needs KV or Durable Objects, which
// are not configured in this release — see WORKER_SETUP.md. The dashboard
// rate-limiting rule recommended there is the global backstop.
export class RateLimiter {
  private map = new Map<string, { count: number; resetAt: number }>()
  constructor(private limit = 10, private windowMs = 600_000) {}
  check(key: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now()
    if (this.map.size > 5000) {
      for (const [k, v] of this.map) if (v.resetAt <= now) this.map.delete(k)
    }
    const entry = this.map.get(key)
    if (!entry || entry.resetAt <= now) {
      this.map.set(key, { count: 1, resetAt: now + this.windowMs })
      return { allowed: true, retryAfterSec: 0 }
    }
    if (entry.count >= this.limit) {
      return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) }
    }
    entry.count += 1
    return { allowed: true, retryAfterSec: 0 }
  }
}
