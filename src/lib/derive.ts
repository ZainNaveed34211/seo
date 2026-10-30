import type { AuditResponse, Finding, LaunchChecks } from './types'

export interface Category {
  id: string
  label: string
  findings: Finding[]
}

const CATEGORY_ORDER: { id: string; label: string; ids: string[] }[] = [
  { id: 'metadata', label: 'Metadata', ids: ['title-present', 'title-length', 'description-present', 'description-length'] },
  { id: 'headings', label: 'Headings', ids: ['h1', 'heading-hierarchy', 'premium-duplicate-headings'] },
  { id: 'links', label: 'Links', ids: ['links', 'link-blank-noopener', 'premium-anchor-text'] },
  { id: 'images', label: 'Images', ids: ['images-alt'] },
  { id: 'indexing', label: 'Indexing', ids: ['robots', 'canonical'] },
  { id: 'technical', label: 'Technical', ids: ['technical-basics', 'https', 'security-headers'] },
  { id: 'social', label: 'Social sharing', ids: ['open-graph'] },
  { id: 'content', label: 'Content', ids: ['premium-word-count'] },
  { id: 'structured', label: 'Structured data', ids: ['premium-structured-data', 'premium-hreflang'] },
  { id: 'sitemap', label: 'Sitemap', ids: ['premium-sitemap'] },
]

export function groupFindings(report: AuditResponse): Category[] {
  const byId = new Map(report.findings.map((f) => [f.id, f]))
  const used = new Set<string>()
  const groups: Category[] = CATEGORY_ORDER.map((c) => {
    const findings = c.ids.filter((id) => byId.has(id)).map((id) => {
      used.add(id)
      return byId.get(id) as Finding
    })
    return { id: c.id, label: c.label, findings }
  }).filter((g) => g.findings.length > 0)
  const rest = report.findings.filter((f) => !used.has(f.id))
  if (rest.length > 0) groups.push({ id: 'other', label: 'Other checks', findings: rest })
  return groups
}

export function categoryScore(findings: Finding[]): { pct: number; earned: number; max: number } {
  const earned = findings.reduce((s, f) => s + f.points, 0)
  const max = findings.reduce((s, f) => s + f.maxPoints, 0)
  return { pct: max > 0 ? Math.round((earned / max) * 100) : 0, earned, max }
}

export function scorePct(report: AuditResponse): number {
  return report.score.max > 0 ? Math.round((report.score.total / report.score.max) * 100) : 0
}

export function severityRank(f: Finding): number {
  if (f.status === 'pass') return 4
  if (f.severity === 'high') return 0
  if (f.severity === 'medium') return 1
  if (f.severity === 'low') return 2
  return 3
}

export function findById(report: AuditResponse, id: string): Finding | undefined {
  return report.findings.find((f) => f.id === id)
}

// ---- Search & Social preview: real values parsed from finding evidence.
// Nothing is invented: a missing value is shown as missing. ----
function quotedValue(evidence: string, label: string): string | null {
  const m = evidence.match(new RegExp(`${label}: [“"](.+)[”"] \\(\\d+`))
  return m ? m[1] : null
}

export interface PreviewData {
  title: string | null
  description: string | null
  ogTitle: string | null
  ogDescription: string | null
  canonical: string | null
  url: string
}

export function previewData(report: AuditResponse): PreviewData {
  const titleF = findById(report, 'title-present')
  const descF = findById(report, 'description-present')
  const ogF = findById(report, 'open-graph')
  const canF = findById(report, 'canonical')
  let ogTitle: string | null = null
  let ogDescription: string | null = null
  if (ogF) {
    const idx = ogF.evidence.lastIndexOf(', og:description: ')
    if (idx >= 0) {
      const t = ogF.evidence.slice('og:title: '.length, idx)
      const d = ogF.evidence.slice(idx + ', og:description: '.length)
      ogTitle = t === 'missing' ? null : t
      ogDescription = d === 'missing' ? null : d
    }
  }
  let canonical: string | null = null
  if (canF && canF.evidence.startsWith('Canonical: ')) {
    canonical = canF.evidence.slice('Canonical: '.length)
  }
  return {
    title: titleF ? quotedValue(titleF.evidence, 'Title') : null,
    description: descF ? quotedValue(descF.evidence, 'Description') : null,
    ogTitle,
    ogDescription,
    canonical,
    url: report.finalUrl,
  }
}

// ---- Launch checks: API results + audit-derived checks + manual items. ----
export interface LaunchItem {
  label: string
  detail: string
  state: 'pass' | 'attention' | 'manual'
}

export function launchItems(report: AuditResponse, launch: LaunchChecks | null): LaunchItem[] {
  const items: LaunchItem[] = []
  const titleOk = findById(report, 'title-present')?.status === 'pass'
  const descOk = findById(report, 'description-present')?.status === 'pass'
  const canOk = findById(report, 'canonical')?.status === 'pass'
  const httpsOk = launch ? launch.https : findById(report, 'https')?.status === 'pass'
  items.push({
    label: 'HTTPS',
    detail: httpsOk ? 'The page loads over HTTPS.' : 'The page does not load over HTTPS.',
    state: httpsOk ? 'pass' : 'attention',
  })
  items.push({
    label: 'Page title',
    detail: titleOk ? 'A page title is present.' : 'No page title was found.',
    state: titleOk ? 'pass' : 'attention',
  })
  items.push({
    label: 'Meta description',
    detail: descOk ? 'A meta description is present.' : 'No meta description was found.',
    state: descOk ? 'pass' : 'attention',
  })
  items.push({
    label: 'Canonical URL',
    detail: canOk ? 'A canonical URL is present.' : 'No canonical URL was found.',
    state: canOk ? 'pass' : 'attention',
  })
  if (launch) {
    items.push({
      label: 'robots.txt',
      detail: launch.robotsTxt.found ? `Found (HTTP ${launch.robotsTxt.status ?? '?'})${launch.robotsTxt.sitemapUrls.length ? `, lists ${launch.robotsTxt.sitemapUrls.length} sitemap URL(s).` : '.'}` : 'No robots.txt was found at the site root.',
      state: launch.robotsTxt.found ? 'pass' : 'attention',
    })
    items.push({
      label: 'Sitemap',
      detail: launch.sitemap.found ? `Found${launch.sitemap.url ? ` at ${launch.sitemap.url}` : ''}.` : 'No sitemap was found from robots.txt or the usual location.',
      state: launch.sitemap.found ? 'pass' : 'attention',
    })
  }
  if (report.brokenLinks) {
    items.push({
      label: 'Broken links (bounded check)',
      detail: `${report.brokenLinks.checked} internal link(s) checked, ${report.brokenLinks.broken.length} broken, ${report.brokenLinks.couldNotVerify.length} could not be verified, ${report.brokenLinks.unchecked} not checked on the free scan.`,
      state: report.brokenLinks.broken.length > 0 ? 'attention' : 'pass',
    })
  }
  return items
}

export const MANUAL_LAUNCH_ITEMS = [
  'Home page and main navigation work on desktop and mobile.',
  'Important pages exist: About / Services and Contact.',
  'Privacy and Terms pages exist and are linked.',
  'Contact details are correct and reachable.',
  'Content has been proofread — no placeholder text left.',
  'Forms (contact, signup) have been tested end to end.',
]

// ---- Quality: derived ONLY from the same scan. No speed score is claimed,
// because this scan does not measure load speed. ----
export interface QualityItem {
  label: string
  detail: string
  state: 'pass' | 'attention' | 'not_checked'
}

export function qualityItems(report: AuditResponse): QualityItem[] {
  const alt = findById(report, 'images-alt')
  const h1 = findById(report, 'h1')
  const tech = findById(report, 'technical-basics')
  const https = findById(report, 'https')
  const headers = findById(report, 'security-headers')
  const viewportOk = tech ? /viewport/i.test(tech.evidence) : false
  const items: QualityItem[] = [
    {
      label: 'Image accessibility',
      detail: alt ? alt.evidence : 'Not checked.',
      state: alt ? alt.status : 'not_checked',
    },
    {
      label: 'Heading structure',
      detail: h1 ? h1.evidence : 'Not checked.',
      state: h1 ? h1.status : 'not_checked',
    },
    {
      label: 'Mobile readiness (viewport)',
      detail: tech ? (viewportOk ? 'A viewport tag is present, so the page can scale on mobile.' : 'No viewport tag was found in the page evidence.') : 'Not checked.',
      state: tech ? (viewportOk ? 'pass' : 'attention') : 'not_checked',
    },
    {
      label: 'Connection security',
      detail: https ? https.evidence : 'Not checked.',
      state: https ? https.status : 'not_checked',
    },
    {
      label: 'Security response headers',
      detail: headers ? headers.evidence : 'Not checked.',
      state: headers ? headers.status : 'not_checked',
    },
  ]
  if (report.brokenLinks) {
    items.push({
      label: 'Broken links',
      detail: `${report.brokenLinks.checked} checked, ${report.brokenLinks.broken.length} broken, ${report.brokenLinks.unchecked} not checked on the free scan. A full multi-page scan is a Premium feature and is not available yet.`,
      state: report.brokenLinks.broken.length > 0 ? 'attention' : 'pass',
    })
  }
  return items
}
