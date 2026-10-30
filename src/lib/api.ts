import type { AuditResponse, ApiError, LaunchChecks } from './types'

// Worker URL is build-time public configuration, never a secret.
// Production: VITE_WORKER_URL = https://seo-api.kluzar.com (custom domain
// on the Cloudflare Worker named kluzar-seo-audit — never rename it).
// Local dev: leave empty, the Vite proxy forwards /api to localhost:8787.
//
// A build variable is NEVER trusted blindly: a value that points at the
// frontend itself, or has no https scheme, would make every scan POST to
// GitHub Pages, which rejects POST with HTTP 405. Such a value is
// discarded and the canonical Worker URL is used instead. An explicitly
// set, valid https Worker URL always wins; localhost http is allowed
// for local development only.
function validWorkerUrl(v: string | undefined): string | null {
  const cleaned = v?.trim().replace(/\/$/, '')
  if (!cleaned) return null
  try {
    const u = new URL(cleaned)
    if (typeof window !== 'undefined' && u.origin === window.location.origin) return null
    if (u.protocol === 'https:') return cleaned
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return cleaned
    return null
  } catch {
    return null
  }
}
export const WORKER_URL = validWorkerUrl(import.meta.env.VITE_WORKER_URL as string | undefined)
  ?? 'https://seo-api.kluzar.com'

export function apiBase(): string {
  return `${WORKER_URL}/api`
}

async function fetchJson(path: string, body: unknown, timeoutMs = 45000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Analysis timed out. The target site may be slow, blocking requests, or unreachable. Try again, or try a different page.')
    }
    throw new Error('Could not reach the analysis service. Check your connection and try again.')
  } finally {
    clearTimeout(timer)
  }
}

// User-facing errors are ALWAYS plain, friendly sentences. Server error
// text, HTTP statuses, and internal codes are never shown in the UI:
// they leak implementation detail and mean nothing to the reader.
// They stay out of the UI entirely (diagnostics only, via console).
function friendlyError(code: string | undefined, kind: 'audit' | 'launch'): string {
  switch (code) {
    case 'INVALID_URL':
      return 'That address could not be analyzed. Check the URL and try again.'
    case 'PRIVATE_TARGET':
      return 'Private and local addresses cannot be analyzed. Only public websites can be analyzed.'
    case 'UPSTREAM_STATUS':
      return 'This site could not be opened for analysis — it may block automated checks. Try a different public page.'
    case 'FETCH_FAILED':
      return 'The site could not be reached. Check the address and try again, or try a different page.'
    case 'TOO_MANY_REDIRECTS':
    case 'BAD_REDIRECT':
      return 'This site redirects too many times to be analyzed. Try a direct page URL on the site.'
    case 'TOO_LARGE':
      return 'This page is too large to analyze. Try a lighter page on the same site.'
    case 'NOT_HTML':
      return 'This address did not return a web page, so there is nothing to analyze.'
    case 'UPSTREAM_EMPTY':
    case 'UPSTREAM_READ_FAILED':
      return 'The site returned an empty or unreadable page. Try again, or try a different page.'
    case 'PREMIUM_NOT_ENABLED':
    case 'PREMIUM_NOT_IMPLEMENTED':
      return 'This feature is part of Premium and is not available yet.'
    default:
      return kind === 'audit'
        ? 'The analysis could not be completed. Please try again, or try a different page.'
        : 'The launch check could not be completed. Please try again.'
  }
}

export async function runAudit(url: string): Promise<AuditResponse> {
  const res = await fetchJson('/audit', { url })
  const data = (await res.json().catch(() => null)) as AuditResponse | ApiError | null
  if (!res.ok || !data || 'error' in data) {
    throw new Error(friendlyError((data as ApiError | null)?.code, 'audit'))
  }
  // Validate the shape before anything is rendered: React escapes text by
  // default, but a malformed payload must never reach the UI as a report.
  const r = data as AuditResponse
  if (!Array.isArray(r.findings) || !r.score || typeof r.score.total !== 'number' || typeof r.score.max !== 'number' || typeof r.finalUrl !== 'string') {
    throw new Error('The analysis service returned an unexpected response. Please try again.')
  }
  return r
}

export async function runLaunchChecks(url: string): Promise<LaunchChecks> {
  const res = await fetchJson('/launch-checks', { url })
  const data = (await res.json().catch(() => null)) as LaunchChecks | ApiError | null
  if (!res.ok || !data || 'error' in data) {
    throw new Error(friendlyError((data as ApiError | null)?.code, 'launch'))
  }
  return data as LaunchChecks
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function downloadJson(report: AuditResponse) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'kluzar-seo-audit.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

export function downloadHtmlReport(report: AuditResponse) {
  // Free report generated client-side from the audit response.
  // This is NOT a premium branded report — premium endpoints are
  // gated server-side and stay locked until entitlements are live.
  const rows = report.findings.map((f) => `
    <tr><td><strong>${escapeHtml(f.title)}</strong><br/><small>${escapeHtml(f.explanation)}</small></td>
    <td>${escapeHtml(f.status)}</td><td>${escapeHtml(f.severity)}</td><td>${f.points}/${f.maxPoints}</td>
    <td>${escapeHtml(f.recommendation)}</td></tr>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Kluzar SEO Audit — Free Report</title></head>
<body style="font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#111">
<h1>Kluzar SEO Audit — Free Report</h1>
<p><strong>Page:</strong> ${escapeHtml(report.finalUrl)}<br/><strong>Score:</strong> ${report.score.total}/${report.score.max} — ${escapeHtml(report.score.grade)}<br/><strong>Date:</strong> ${escapeHtml(report.fetchedAt)}</p>
<p>This is a free page-level audit. It does not claim search rankings, traffic, backlinks, or indexing status that were not checked.</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Finding</th><th>Status</th><th>Severity</th><th>Points</th><th>Next step</th></tr></thead><tbody>${rows}</tbody></table>
<p>Contact: info@kluzar.com · support@kluzar.com · Serving Worldwide</p></body></html>`
  const blob = new Blob([html], { type: 'text/html' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'kluzar-seo-audit.html'
  a.click()
  URL.revokeObjectURL(a.href)
}
