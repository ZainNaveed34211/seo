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

export async function runAudit(url: string): Promise<AuditResponse> {
  const res = await fetchJson('/audit', { url })
  const data = (await res.json().catch(() => null)) as AuditResponse | ApiError | null
  if (!res.ok || !data || 'error' in data) {
    const err = (data as ApiError | null)?.error ?? `Audit failed (HTTP ${res.status}).`
    const code = (data as ApiError | null)?.code ?? 'AUDIT_FAILED'
    throw new Error(`${err} [${code}]`)
  }
  // Validate the shape before anything is rendered: React escapes text by
  // default, but a malformed payload must never reach the UI as a report.
  const r = data as AuditResponse
  if (!Array.isArray(r.findings) || !r.score || typeof r.score.total !== 'number' || typeof r.score.max !== 'number' || typeof r.finalUrl !== 'string') {
    throw new Error('Unexpected response from the analysis service. [BAD_RESPONSE]')
  }
  return r
}

export async function runLaunchChecks(url: string): Promise<LaunchChecks> {
  const res = await fetchJson('/launch-checks', { url })
  const data = (await res.json().catch(() => null)) as LaunchChecks | ApiError | null
  if (!res.ok || !data || 'error' in data) {
    const err = (data as ApiError | null)?.error ?? `Launch check failed (HTTP ${res.status}).`
    const code = (data as ApiError | null)?.code ?? 'LAUNCH_FAILED'
    throw new Error(`${err} [${code}]`)
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
