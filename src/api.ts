import type { AuditResponse, ApiError, LaunchChecks } from './types'
import { PACKS_URL } from './limits'
export { PACKS_URL }

// Worker URL is build-time public configuration, never a secret.
// - Local dev (vite dev): leave empty, the Vite proxy forwards /api to
//   a local Worker on http://localhost:8787.
// - GitHub Pages production: build with VITE_WORKER_URL set to the real
//   Worker URL, e.g. https://seo-api.kluzar.com
//   seo-api.kluzar.com is the canonical public URL: it is a custom domain
//   on the Cloudflare Worker named kluzar-seo-audit. The workers.dev
//   alias https://kluzar-seo-audit.kluzar-official.workers.dev points
//   to the same Worker. There is NO Worker named seo-api on workers.dev
//   (seo-api.kluzar-official.workers.dev returns 404). Do not rename
//   the Worker to seo-api — that would create a different Worker and
//   break the custom-domain binding.
//   (or the Worker's custom route, if one is configured later).
// If it is empty in production, the app does NOT fake an audit — it tells
// the user the Worker is not configured and offers the sample report.
export const WORKER_URL = (import.meta.env.VITE_WORKER_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export function apiBase(): string {
  return WORKER_URL ? `${WORKER_URL}/api` : '/api'
}

export function clientValidateUrl(raw: string): string | null {
  // Client-side validation is UX only. The Worker re-validates everything
  // server-side; a client pass never grants a server pass.
  const value = raw.trim()
  if (!value) return 'Enter a URL to audit.'
  if (value.length > 2048) return 'That URL is too long (max 2048 characters).'
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return 'That does not look like a valid URL. Include https://, for example https://example.com/'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'Only http:// and https:// URLs can be audited.'
  if (parsed.username || parsed.password) return 'URLs with a username or password cannot be audited.'
  const host = parsed.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) {
    return 'That looks like a private or local address. Only public websites can be audited.'
  }
  return null
}

export async function runAudit(url: string): Promise<AuditResponse> {
  const res = await fetch(`${apiBase()}/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = (await res.json().catch(() => null)) as AuditResponse | ApiError | null
  if (!res.ok || !data || 'error' in data) {
    const err = (data as ApiError | null)?.error ?? `Audit failed (HTTP ${res.status}).`
    const code = (data as ApiError | null)?.code ?? 'AUDIT_FAILED'
    throw new Error(`${err} [${code}]`)
  }
  return data as AuditResponse
}

export async function checkPremium(): Promise<{ available: boolean; reason: string }> {
  const res = await fetch(`${apiBase()}/premium-audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/' }),
  })
  const data = (await res.json().catch(() => null)) as { available?: boolean; reason?: string; error?: string; code?: string } | null
  if (!res.ok) {
    return { available: false, reason: data?.error ?? `Premium is not available (HTTP ${res.status}).` }
  }
  return { available: Boolean(data?.available), reason: data?.reason ?? '' }
}

export function downloadJson(report: AuditResponse) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'kluzar-seo-audit.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function downloadHtmlReport(report: AuditResponse) {
  // Free HTML report, generated client-side from the audit response.
  // This is NOT the premium branded report — that endpoint is gated
  // server-side and returns 403 until payment/entitlements are enabled.
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

export async function runLaunchChecks(url: string): Promise<LaunchChecks> {
  const res = await fetch(`${apiBase()}/launch-checks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = (await res.json().catch(() => null)) as LaunchChecks | ApiError | null
  if (!res.ok || !data || 'error' in data) {
    const err = (data as ApiError | null)?.error ?? `Launch check failed (HTTP ${res.status}).`
    const code = (data as ApiError | null)?.code ?? 'LAUNCH_FAILED'
    throw new Error(`${err} [${code}]`)
  }
  return data as LaunchChecks
}
