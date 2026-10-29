import { validateTargetUrl } from './security'

// Bounded broken-link checking. Starter limit is enforced by the caller
// (the frontend LIMITS config documents 5). Only links actually checked
// are ever labelled broken:
//   200-399 -> ok
//   400-499 except 403, 429 -> broken
//   500-599 -> broken
//   403, 429, 405, timeout, network error -> could NOT be verified (NOT broken)
// Every link is re-validated with the same SSRF rules as the audit itself,
// including port, private-host, and redirect rules (HEAD follows no
// redirects here: redirect: 'manual', so a redirect is "ok", not broken).

export type BrokenStatus = 'ok' | 'broken' | 'unknown'

export function classifyBrokenStatus(status: number): BrokenStatus {
  if (status >= 200 && status < 400) return 'ok'
  if (status === 403 || status === 429 || status === 405) return 'unknown'
  if (status >= 400 && status < 500) return 'broken'
  if (status >= 500 && status < 600) return 'broken'
  return 'unknown'
}

export interface BrokenLinkResult {
  url: string
  status: number | null
  reason: string
}

export interface BrokenLinksResult {
  checked: number
  broken: BrokenLinkResult[]
  couldNotVerify: BrokenLinkResult[]
  unchecked: number
  note: string
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>

export async function checkBrokenLinks(
  links: string[],
  limit: number,
  fetchFn: FetchFn = fetch,
): Promise<BrokenLinksResult> {
  const candidates = links.slice(0, limit)
  const unchecked = Math.max(0, links.length - candidates.length)
  const broken: BrokenLinkResult[] = []
  const couldNotVerify: BrokenLinkResult[] = []
  await Promise.all(candidates.map(async (link) => {
    const validated = validateTargetUrl(link)
    if (!validated.ok) {
      couldNotVerify.push({ url: link, status: null, reason: 'Failed safety validation, not fetched.' })
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    try {
      const res = await fetchFn(validated.url.toString(), {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'KluzarSEO-Audit/1.0 (+https://seo.kluzar.com/)' },
      })
      const kind = classifyBrokenStatus(res.status)
      if (kind === 'broken') broken.push({ url: link, status: res.status, reason: `Returned HTTP ${res.status}.` })
      else if (kind === 'unknown') couldNotVerify.push({ url: link, status: res.status, reason: `Returned HTTP ${res.status}; not treated as broken.` })
    } catch (err) {
      const reason = err instanceof Error && err.name === 'AbortError' ? 'Timed out (over 4 seconds).' : 'Network error.'
      couldNotVerify.push({ url: link, status: null, reason })
    } finally {
      clearTimeout(timer)
    }
  }))
  return {
    checked: candidates.length,
    broken,
    couldNotVerify,
    unchecked,
    note: 'Only the checked links were tested. Unchecked links are not claimed broken or working.',
  }
}
