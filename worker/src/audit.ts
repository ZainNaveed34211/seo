import { parse, type HTMLElement } from 'node-html-parser'

// AUDIT RULES — pure functions over parsed HTML + response metadata.
// No network, no Worker globals here, so these are unit-testable in Node.
// Scores are Kluzar audit scores, NOT Google rankings. Nothing here claims
// rankings, traffic, backlinks, indexing status, or performance measurements
// that were not actually checked.

export interface Finding {
  id: string
  title: string
  status: 'pass' | 'attention' | 'not_checked'
  severity: 'high' | 'medium' | 'low' | 'info'
  points: number
  maxPoints: number
  explanation: string
  whyItMatters: string
  evidence: string
  recommendation: string
}

export interface Evidence {
  title: string | null
  description: string | null
  h1Count: number
  headings: { level: number; text: string }[]
  canonical: string | null
  robotsMeta: string | null
  xRobotsTag: string | null
  imagesTotal: number
  imagesMissingAlt: number
  imagesMissingAltExamples: string[]
  internalLinks: number
  externalLinks: number
  /** Internal link URLs (deduped, capped at 20) for bounded broken-link checks. */
  internalLinkUrls: string[]
  /** External links with target=_blank and neither noopener nor noreferrer. */
  blankWithoutNoopener: number
  lang: string | null
  viewport: boolean
  charset: string | null
  ogTitle: string | null
  ogDescription: string | null
  // Premium-only evidence, computed from the same single HTML fetch.
  jsonLdCount: number
  jsonLdTypes: string[]
  hreflangCount: number
  genericAnchorCount: number
  emptyAnchorCount: number
  duplicateHeadings: string[]
  wordCount: number
}

function textOf(el: HTMLElement | null): string | null {
  if (!el) return null
  const t = el.text.trim().replace(/\s+/g, ' ')
  return t ? t : null
}

function metaContent(root: HTMLElement, name: string): string | null {
  const el = root.querySelector(`meta[name="${name}" i]`)
  return el?.getAttribute('content')?.trim() || null
}

function ogContent(root: HTMLElement, property: string): string | null {
  const el = root.querySelector(`meta[property="${property}" i]`)
  return el?.getAttribute('content')?.trim() || null
}

export function extractEvidence(html: string, finalUrl: string, headers: { xRobotsTag: string | null; contentType: string | null }): Evidence {
  const root = parse(html, { lowerCaseTagName: true, comment: false })
  const title = textOf(root.querySelector('title'))
  const description = metaContent(root, 'description')
  const canonicalEl = root.querySelector('link[rel="canonical" i]')
  const canonical = canonicalEl?.getAttribute('href')?.trim() || null
  const robotsMeta = metaContent(root, 'robots')
  const headings: { level: number; text: string }[] = []
  for (let level = 1; level <= 6; level++) {
    for (const el of root.querySelectorAll(`h${level}`)) {
      const t = el.text.trim().replace(/\s+/g, ' ')
      if (t) headings.push({ level, text: t })
    }
  }
  // Headings in document order (querySelectorAll per level loses order, so
  // re-walk the tree for hierarchy checks only — the counts above are exact).
  const orderedLevels: number[] = []
  const walk = (node: HTMLElement) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 1) {
        const tag = (child as HTMLElement).tagName?.toLowerCase() ?? ''
        if (/^h[1-6]$/.test(tag)) orderedLevels.push(Number(tag[1]))
        walk(child as HTMLElement)
      }
    }
  }
  walk(root as unknown as HTMLElement)

  const images = root.querySelectorAll('img')
  const missing: string[] = []
  for (const img of images) {
    if (img.getAttribute('alt') === undefined) {
      const src = img.getAttribute('src') || '(no src)'
      if (missing.length < 5) missing.push(src.slice(0, 120))
    }
  }

  let internal = 0, external = 0, emptyAnchor = 0, genericAnchor = 0, blankWithoutNoopener = 0
  const base = new URL(finalUrl)
  const internalUrls: string[] = []
  const seenInternal = new Set<string>()
  const generic = new Set(['click here', 'here', 'read more', 'learn more', 'click', 'more', 'link'])
  for (const a of root.querySelectorAll('a')) {
    const href = a.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue
    try {
      const resolved = new URL(href, base)
      if (resolved.hostname === base.hostname) {
        internal++
        const clean = resolved.toString().split('#')[0]
        if (!seenInternal.has(clean) && internalUrls.length < 20) { seenInternal.add(clean); internalUrls.push(clean) }
      } else {
        external++
        const target = a.getAttribute('target')
        const rel = (a.getAttribute('rel') ?? '').toLowerCase()
        if (target === '_blank' && !rel.includes('noopener') && !rel.includes('noreferrer')) blankWithoutNoopener++
      }
    } catch {
      // Unparseable href — counted nowhere, not a crash.
    }
    const label = a.text.trim().replace(/\s+/g, ' ').toLowerCase()
    if (!label && !a.querySelector('img')) emptyAnchor++
    else if (generic.has(label)) genericAnchor++
  }

  const htmlEl = root.querySelector('html')
  const lang = htmlEl?.getAttribute('lang')?.trim() || null
  const viewport = root.querySelector('meta[name="viewport" i]') !== null
  let charset: string | null = root.querySelector('meta[charset]')?.getAttribute('charset')?.trim() || null
  if (!charset && headers.contentType) {
    const m = headers.contentType.match(/charset=([^;]+)/i)
    if (m) charset = m[1].trim()
  }

  const jsonLdTypes: string[] = []
  let jsonLdCount = 0
  for (const script of root.querySelectorAll('script[type="application/ld+json" i]')) {
    jsonLdCount++
    try {
      const data = JSON.parse(script.text)
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item && typeof item['@type'] === 'string') jsonLdTypes.push(item['@type'])
        if (item && Array.isArray(item['@graph'])) {
          for (const g of item['@graph']) if (g && typeof g['@type'] === 'string') jsonLdTypes.push(g['@type'])
        }
      }
    } catch {
      // Unparseable JSON-LD counts as present, not as a type — honest, not a crash.
    }
  }

  const hreflangCount = root.querySelectorAll('link[rel="alternate" i][hreflang]').length
  const seen = new Map<string, number>()
  const duplicates: string[] = []
  for (const h of headings) {
    const key = h.text.toLowerCase()
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    if (n === 2 && duplicates.length < 5) duplicates.push(h.text.slice(0, 80))
  }
  const bodyText = root.querySelector('body')?.text ?? root.text
  const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length

  return {
    title, description,
    h1Count: headings.filter((h) => h.level === 1).length,
    headings,
    canonical, robotsMeta, xRobotsTag: headers.xRobotsTag,
    imagesTotal: images.length, imagesMissingAlt: missing.length, imagesMissingAltExamples: missing,
    internalLinks: internal, externalLinks: external, internalLinkUrls: internalUrls, blankWithoutNoopener,
    lang, viewport, charset,
    ogTitle: ogContent(root, 'og:title'), ogDescription: ogContent(root, 'og:description'),
    jsonLdCount, jsonLdTypes: [...new Set(jsonLdTypes)].slice(0, 10),
    hreflangCount, genericAnchorCount: genericAnchor, emptyAnchorCount: emptyAnchor,
    duplicateHeadings: duplicates, wordCount,
    // Hierarchy jump detection uses document order, stored for the rule below
    // via a hidden field on the returned object (not part of the API shape).
    // We encode it in headings order by re-sorting: the rule recomputes from
    // headings as extracted (which are grouped by level, not order), so we
    // instead expose the jump flag through this internal property.
    ...( { __orderedLevels: orderedLevels } as unknown as Record<string, unknown> ),
  } as Evidence & { __orderedLevels: number[] } as unknown as Evidence
}

export function orderedLevelsOf(ev: Evidence): number[] {
  return (ev as unknown as { __orderedLevels?: number[] }).__orderedLevels ?? []
}

function f(partial: Omit<Finding, 'points'> & { points?: number }): Finding {
  return { points: 0, ...partial } as Finding
}

export function runFreeRules(ev: Evidence): Finding[] {
  const findings: Finding[] = []
  const titleLen = ev.title ? [...ev.title].length : 0
  findings.push(f({
    id: 'title-present', title: 'Page title', status: ev.title ? 'pass' : 'attention', severity: ev.title ? 'info' : 'high', maxPoints: 10, points: ev.title ? 10 : 0,
    explanation: ev.title ? 'A title was found.' : 'No page title was found.',
    whyItMatters: 'The title is the main text shown in search results and browser tabs.',
    evidence: ev.title ? `Title: “${ev.title.slice(0, 200)}” (${titleLen} characters)` : 'No <title> tag with text found in the page head.',
    recommendation: ev.title ? 'No change needed for this check. Keep titles unique per page.' : 'Add a unique, descriptive <title> in the page head.',
  }))
  findings.push(f({
    id: 'title-length', title: 'Title length', status: !ev.title ? 'not_checked' : titleLen >= 30 && titleLen <= 60 ? 'pass' : 'attention', severity: 'low', maxPoints: 5, points: !ev.title ? 0 : titleLen >= 30 && titleLen <= 60 ? 5 : 0,
    explanation: !ev.title ? 'Not checked because no title was found.' : titleLen >= 30 && titleLen <= 60 ? 'Title length is in the recommended range (30–60 characters).' : `Title is ${titleLen} characters, outside the recommended 30–60 range.`,
    whyItMatters: 'Very long titles can be cut off in search results; very short titles say too little.',
    evidence: ev.title ? `${titleLen} characters` : 'No title to measure.',
    recommendation: !ev.title ? 'Add a title first.' : titleLen < 30 ? 'Expand the title to describe the page more clearly, aiming for 30–60 characters.' : 'Shorten the title to around 60 characters so the full title is likely to show.',
  }))
  const descLen = ev.description ? [...ev.description].length : 0
  findings.push(f({
    id: 'description-present', title: 'Meta description', status: ev.description ? 'pass' : 'attention', severity: ev.description ? 'info' : 'medium', maxPoints: 10, points: ev.description ? 10 : 0,
    explanation: ev.description ? 'A meta description was found.' : 'No meta description was found.',
    whyItMatters: 'The description often becomes the snippet under your title in search results. Without it, search engines choose the text for you.',
    evidence: ev.description ? `Description: “${ev.description.slice(0, 300)}” (${descLen} characters)` : 'No <meta name="description"> tag found in the page head.',
    recommendation: ev.description ? 'No change needed for this check.' : 'Add a meta description of 50–160 characters that describes the page and what the visitor should do next.',
  }))
  findings.push(f({
    id: 'description-length', title: 'Meta description length', status: !ev.description ? 'not_checked' : descLen >= 50 && descLen <= 160 ? 'pass' : 'attention', severity: 'low', maxPoints: 5, points: !ev.description ? 0 : descLen >= 50 && descLen <= 160 ? 5 : 0,
    explanation: !ev.description ? 'Not checked because no meta description was found.' : descLen >= 50 && descLen <= 160 ? 'Description length is in the recommended range (50–160 characters).' : `Description is ${descLen} characters, outside the recommended 50–160 range.`,
    whyItMatters: 'Very long descriptions can be cut off in search results.',
    evidence: ev.description ? `${descLen} characters` : 'No description to measure.',
    recommendation: !ev.description ? 'Add a description first.' : descLen < 50 ? 'Expand the description to 50–160 characters.' : 'Shorten the description to around 160 characters.',
  }))
  findings.push(f({
    id: 'h1', title: 'Main heading (H1)', status: ev.h1Count === 1 ? 'pass' : 'attention', severity: ev.h1Count === 0 ? 'high' : 'medium', maxPoints: 15, points: ev.h1Count === 1 ? 15 : 0,
    explanation: ev.h1Count === 1 ? 'Exactly one H1 heading was found.' : ev.h1Count === 0 ? 'No H1 heading was found.' : `${ev.h1Count} H1 headings were found. A page should normally have exactly one.`,
    whyItMatters: 'The H1 tells visitors and search engines what the page is about.',
    evidence: `${ev.h1Count} H1 heading(s) found.`,
    recommendation: ev.h1Count === 0 ? 'Add one clear H1 near the top of the page that matches the page topic.' : ev.h1Count === 1 ? 'No change needed for this check.' : 'Keep one H1 as the main topic and change the others to H2 or lower.',
  }))
  const levels = orderedLevelsOf(ev)
  let jump = false
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) { jump = true; break }
  findings.push(f({
    id: 'heading-hierarchy', title: 'Heading order', status: jump ? 'attention' : 'pass', severity: jump ? 'low' : 'info', maxPoints: 5, points: jump ? 0 : 5,
    explanation: jump ? 'A heading level jumps by more than one level (for example H1 straight to H3).' : 'No heading level jumps by more than one level were found.',
    whyItMatters: 'A clean H1 → H2 → H3 order helps readers and screen readers follow the page.',
    evidence: levels.length ? `Heading levels in order: ${levels.join(', ')}` : 'No headings found.',
    recommendation: jump ? 'Fill in the missing heading levels so the order steps down one level at a time.' : 'No change needed for this check.',
  }))
  findings.push(f({
    id: 'canonical', title: 'Canonical URL', status: ev.canonical ? 'pass' : 'attention', severity: 'medium', maxPoints: 10, points: ev.canonical ? 10 : 0,
    explanation: ev.canonical ? 'A canonical link was found.' : 'No canonical link was found.',
    whyItMatters: 'A canonical URL tells search engines which version of a page is the main one, so duplicate pages do not compete with each other.',
    evidence: ev.canonical ? `Canonical: ${ev.canonical.slice(0, 300)}` : 'No <link rel="canonical"> tag found.',
    recommendation: ev.canonical ? 'No change needed for this check, unless the canonical points to a different page than intended.' : 'Add a canonical link pointing to the full, preferred URL of this page.',
  }))
  const blocked = /noindex|none/i.test(ev.robotsMeta ?? '') || /noindex|none/i.test(ev.xRobotsTag ?? '')
  findings.push(f({
    id: 'robots', title: 'Robots / indexing', status: blocked ? 'attention' : 'pass', severity: blocked ? 'high' : 'info', maxPoints: 10, points: blocked ? 0 : 10,
    explanation: blocked ? 'A blocking robots directive (noindex) was found — this page is telling search engines not to index it.' : 'No blocking robots directive was found. The page is indexable by default.',
    whyItMatters: 'A noindex directive keeps the page out of search results entirely. That is correct for private pages, and a serious problem for a public page that should be found.',
    evidence: `Meta robots: ${ev.robotsMeta ?? 'not present'} · X-Robots-Tag header: ${ev.xRobotsTag ?? 'not present'}`,
    recommendation: blocked ? 'If this page should be found in search, remove the noindex directive. If it should stay private, leave it as it is.' : 'No change needed, unless you intentionally want this page hidden from search.',
  }))
  findings.push(f({
    id: 'images-alt', title: 'Image alt text', status: ev.imagesTotal === 0 ? 'pass' : ev.imagesMissingAlt === 0 ? 'pass' : 'attention', severity: ev.imagesMissingAlt === 0 ? 'info' : 'medium', maxPoints: 10, points: ev.imagesTotal === 0 || ev.imagesMissingAlt === 0 ? 10 : 5,
    explanation: ev.imagesTotal === 0 ? 'No images were found, so there is no alt text to check.' : ev.imagesMissingAlt === 0 ? 'Every image has alt text.' : `${ev.imagesMissingAlt} of ${ev.imagesTotal} image(s) are missing alt text.`,
    whyItMatters: 'Alt text describes images for screen readers and for search engines that cannot see the image.',
    evidence: ev.imagesTotal === 0 ? '0 images found.' : `${ev.imagesTotal} images total, ${ev.imagesMissingAlt} missing alt text.` + (ev.imagesMissingAltExamples.length ? ` Examples: ${ev.imagesMissingAltExamples.join(', ')}` : ''),
    recommendation: ev.imagesMissingAlt === 0 ? 'No change needed for this check.' : 'Add short, descriptive alt text to every informative image. Purely decorative images can use an empty alt="" if you choose.',
  }))
  findings.push(f({
    id: 'links', title: 'Links', status: ev.internalLinks > 0 ? 'pass' : 'attention', severity: 'low', maxPoints: 5, points: ev.internalLinks > 0 ? 5 : 0,
    explanation: ev.internalLinks > 0 ? 'The page contains internal links.' : 'No internal links were found.',
    whyItMatters: 'Internal links help visitors and search engines move between your pages.',
    evidence: `${ev.internalLinks} internal link(s), ${ev.externalLinks} external link(s).`,
    recommendation: ev.internalLinks > 0 ? 'No change needed for this check.' : 'Add links to your other relevant pages where they help the visitor.',
  }))
  const techParts: string[] = []
  let techPoints = 0
  if (ev.lang) { techPoints += 4; techParts.push(`lang="${ev.lang}"`) } else techParts.push('lang: missing')
  if (ev.viewport) { techPoints += 3; techParts.push('viewport present') } else techParts.push('viewport: missing')
  if (ev.charset) { techPoints += 3; techParts.push(`charset=${ev.charset}`) } else techParts.push('charset: missing')
  findings.push(f({
    id: 'technical-basics', title: 'Language, viewport and charset', status: techPoints === 10 ? 'pass' : 'attention', severity: techPoints === 10 ? 'info' : 'medium', maxPoints: 10, points: techPoints,
    explanation: techPoints === 10 ? 'Language, viewport and charset are all present.' : 'One or more of language, viewport or charset is missing.',
    whyItMatters: 'Language helps screen readers and search, viewport makes the page work on phones, and charset prevents broken characters.',
    evidence: techParts.join(', '),
    recommendation: techPoints === 10 ? 'No change needed for this check.' : 'Add the missing items: <html lang="…">, <meta name="viewport" content="width=device-width, initial-scale=1">, and a charset declaration.',
  }))
  findings.push(f({
    id: 'open-graph', title: 'Social sharing (Open Graph)', status: ev.ogTitle && ev.ogDescription ? 'pass' : 'attention', severity: 'low', maxPoints: 5, points: ev.ogTitle && ev.ogDescription ? 5 : 0,
    explanation: ev.ogTitle && ev.ogDescription ? 'Open Graph title and description are present.' : 'Open Graph title or description is missing.',
    whyItMatters: 'Open Graph tags control how the page looks when shared on social media. They do not directly change search rankings.',
    evidence: `og:title: ${ev.ogTitle ?? 'missing'}, og:description: ${ev.ogDescription ?? 'missing'}`,
    recommendation: ev.ogTitle && ev.ogDescription ? 'No change needed for this check.' : 'Add og:title, og:description and og:image if you want nicer social shares.',
  }))
  return findings
}

export function scoreOf(findings: Finding[]): { total: number; max: number; grade: string; gradeNote: string } {
  const total = findings.reduce((s, f) => s + f.points, 0)
  const max = findings.reduce((s, f) => s + f.maxPoints, 0)
  const grade = total >= 90 ? 'Excellent' : total >= 75 ? 'Good' : total >= 50 ? 'Needs work' : 'Critical'
  return {
    total, max, grade,
    gradeNote: 'Kluzar audit score, not a Google ranking. Fix the high-severity items first.',
  }
}

// Informational findings (v2, maxPoints 0 — they NEVER change the /100 score).
// They report real evidence only: HTTPS of the final URL, presence of
// security response headers (presence is not a security test), and
// new-tab links missing noopener/noreferrer. A missing header is
// "attention" with severity info, not a failed score item.
export interface SecurityHeaders {
  strictTransportSecurity: string | null
  xContentTypeOptions: string | null
  xFrameOptions: string | null
  referrerPolicy: string | null
  hasContentSecurityPolicy: boolean
}

export function runInformationalRules(ev: Evidence, finalUrl: string, headers: SecurityHeaders): Finding[] {
  const out: Finding[] = []
  const https = finalUrl.startsWith('https://')
  out.push({
    id: 'https', title: 'HTTPS', status: https ? 'pass' : 'attention', severity: https ? 'info' : 'high', points: 0, maxPoints: 0,
    explanation: https ? 'The final URL uses HTTPS.' : 'The final URL does not use HTTPS.',
    whyItMatters: 'HTTPS encrypts traffic between visitors and the site. Browsers warn on plain HTTP pages.',
    evidence: `Final URL: ${finalUrl.slice(0, 300)}`,
    recommendation: https ? 'No change needed for this check.' : 'Serve the site over HTTPS with a valid certificate and redirect HTTP to HTTPS.',
  })
  const present = [
    headers.strictTransportSecurity ? 'HSTS: present' : 'HSTS: missing',
    headers.xContentTypeOptions ? 'X-Content-Type-Options: present' : 'X-Content-Type-Options: missing',
    headers.xFrameOptions ? 'X-Frame-Options: present' : 'X-Frame-Options: missing',
    headers.hasContentSecurityPolicy ? 'Content-Security-Policy: present' : 'Content-Security-Policy: missing',
    headers.referrerPolicy ? 'Referrer-Policy: present' : 'Referrer-Policy: missing',
  ]
  const missingCount = present.filter((s) => s.includes('missing')).length
  out.push({
    id: 'security-headers', title: 'Security response headers (presence only)', status: missingCount === 0 ? 'pass' : 'attention', severity: 'info', points: 0, maxPoints: 0,
    explanation: missingCount === 0 ? 'All five checked security headers are present.' : `${missingCount} of 5 checked security headers are missing.`,
    whyItMatters: 'These headers are a defence-in-depth signal. Their presence does not prove a site is secure, and their absence does not prove it is exploitable.',
    evidence: present.join(' · '),
    recommendation: missingCount === 0 ? 'No change needed for this check.' : 'Consider adding the missing headers at the server/CDN level, and test each one — a wrong header can break a site.',
  })
  out.push({
    id: 'link-blank-noopener', title: 'New-tab links without noopener', status: ev.blankWithoutNoopener === 0 ? 'pass' : 'attention', severity: 'low', points: 0, maxPoints: 0,
    explanation: ev.blankWithoutNoopener === 0 ? 'No external new-tab link is missing noopener/noreferrer.' : `${ev.blankWithoutNoopener} external link(s) open in a new tab without rel="noopener" or rel="noreferrer".`,
    whyItMatters: 'Without noopener, a new-tab page can access the opener page. This is a static HTML signal, not a confirmed exploit.',
    evidence: `${ev.blankWithoutNoopener} such link(s) found.`,
    recommendation: ev.blankWithoutNoopener === 0 ? 'No change needed for this check.' : 'Add rel="noopener" to external links that use target="_blank".',
  })
  return out
}

// Premium-only findings, computed from the same HTML. These are NEVER
// included in a free response — the handler strips them unless the caller
// is entitled (which, in this release, no caller is).
export function runPremiumRules(ev: Evidence, sitemapFound: boolean | null): Finding[] {
  const out: Finding[] = []
  out.push({
    id: 'premium-structured-data', title: 'Structured data (JSON-LD)', status: ev.jsonLdCount > 0 ? 'pass' : 'attention', severity: 'low', points: 0, maxPoints: 0,
    explanation: ev.jsonLdCount > 0 ? `${ev.jsonLdCount} JSON-LD block(s) found.` : 'No JSON-LD structured data was found.',
    whyItMatters: 'Structured data can help search engines understand what a page is (for example, a business, article, or product). It does not guarantee rich results.',
    evidence: ev.jsonLdCount > 0 ? `Types found: ${ev.jsonLdTypes.join(', ') || 'unparseable'}` : 'No <script type="application/ld+json"> blocks found.',
    recommendation: ev.jsonLdCount > 0 ? 'Keep structured data accurate and matching the visible page content.' : 'Consider adding JSON-LD for your business or content type, matching only what the page actually shows.',
  })
  out.push({
    id: 'premium-hreflang', title: 'Hreflang (language versions)', status: ev.hreflangCount > 0 ? 'pass' : 'not_checked', severity: 'info', points: 0, maxPoints: 0,
    explanation: ev.hreflangCount > 0 ? `${ev.hreflangCount} hreflang link(s) found.` : 'No hreflang links found. This only matters if the same content exists in multiple languages or regions.',
    whyItMatters: 'Hreflang helps search engines show the right language version. It is not needed for a single-language site.',
    evidence: `${ev.hreflangCount} hreflang link(s).`,
    recommendation: ev.hreflangCount > 0 ? 'No change needed for this check.' : 'No action needed for a single-language site.',
  })
  const badAnchors = ev.genericAnchorCount + ev.emptyAnchorCount
  out.push({
    id: 'premium-anchor-text', title: 'Link text quality', status: badAnchors === 0 ? 'pass' : 'attention', severity: 'low', points: 0, maxPoints: 0,
    explanation: badAnchors === 0 ? 'No empty or generic link text was found.' : `${badAnchors} link(s) have empty or generic text (for example “click here”).`,
    whyItMatters: 'Descriptive link text helps visitors and screen readers know where a link goes before they click it.',
    evidence: `${ev.emptyAnchorCount} empty link(s), ${ev.genericAnchorCount} generic link(s).`,
    recommendation: badAnchors === 0 ? 'No change needed for this check.' : 'Replace generic link text with text that describes the destination page.',
  })
  out.push({
    id: 'premium-duplicate-headings', title: 'Duplicate headings', status: ev.duplicateHeadings.length === 0 ? 'pass' : 'attention', severity: 'low', points: 0, maxPoints: 0,
    explanation: ev.duplicateHeadings.length === 0 ? 'No duplicate heading text was found.' : 'Some heading text is repeated on the page.',
    whyItMatters: 'Repeated headings can make a page feel templated and harder to scan.',
    evidence: ev.duplicateHeadings.length ? `Repeated: ${ev.duplicateHeadings.join(' · ')}` : 'No duplicates found.',
    recommendation: ev.duplicateHeadings.length === 0 ? 'No change needed for this check.' : 'Make repeated headings specific to their section.',
  })
  out.push({
    id: 'premium-word-count', title: 'Content length (words)', status: ev.wordCount >= 300 ? 'pass' : 'attention', severity: 'low', points: 0, maxPoints: 0,
    explanation: `Approximately ${ev.wordCount} words of visible text were found.`,
    whyItMatters: 'Word count alone does not mean quality, but a very short page rarely answers a visitor’s question fully.',
    evidence: `~${ev.wordCount} words.`,
    recommendation: ev.wordCount >= 300 ? 'No change needed for this check.' : 'Consider whether the page fully answers what a visitor came for, and expand it if it does not.',
  })
  out.push({
    id: 'premium-sitemap', title: 'Sitemap reference in robots.txt', status: sitemapFound === null ? 'not_checked' : sitemapFound ? 'pass' : 'attention', severity: 'low', points: 0, maxPoints: 0,
    explanation: sitemapFound === null ? 'Robots.txt could not be checked safely in this run.' : sitemapFound ? 'A Sitemap: line was found in robots.txt.' : 'No Sitemap: line was found in robots.txt.',
    whyItMatters: 'A sitemap reference helps search engines discover your sitemap. It is not required if the sitemap is submitted elsewhere.',
    evidence: sitemapFound === null ? 'Robots.txt not checked.' : sitemapFound ? 'Sitemap line present in robots.txt.' : 'No Sitemap line in robots.txt.',
    recommendation: sitemapFound ? 'No change needed for this check.' : 'Add a Sitemap: line to robots.txt pointing to your sitemap, or submit the sitemap in Search Console.',
  })
  return out
}

export function premiumActionPlan(freeFindings: Finding[]): string[] {
  // Prioritised, step-by-step fixes derived ONLY from the free findings.
  const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 }
  return [...freeFindings]
    .filter((f) => f.status === 'attention')
    .sort((a, b) => order[a.severity] - order[b.severity])
    .map((f, i) => `${i + 1}. ${f.title} (${f.severity} severity): ${f.recommendation}`)
}
