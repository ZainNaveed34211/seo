import type { AuditResponse } from './types'

// SAMPLE REPORT — demonstration data only. This was not produced by a live
// audit of a real website, and it must never be presented as one.
// The sample site uses the reserved .example domain, so it is not a real client.
export const SAMPLE_REPORT: AuditResponse = {
  version: '1',
  auditedUrl: 'https://sample-business.example/',
  finalUrl: 'https://sample-business.example/',
  status: 200,
  fetchedAt: '2026-10-29T00:00:00.000Z',
  redirectChain: [],
  headers: { server: null, contentType: 'text/html; charset=utf-8', xRobotsTag: null },
  premium: { available: false, reason: 'Premium audit is not enabled yet. Payment is a separate future integration.' },
  sample: true,
  score: { total: 65, max: 100, grade: 'Needs work', gradeNote: 'Kluzar audit score, not a Google ranking. Fix the high-severity items first.' },
  findings: [
    { id: 'title-present', title: 'Page title', status: 'pass', severity: 'info', points: 10, maxPoints: 10, explanation: 'A title was found.', whyItMatters: 'The title is the main text shown in search results and browser tabs.', evidence: 'Title: “Sample Business — Plumbers in Sample Town” (38 characters)', recommendation: 'No change needed for this check. Keep titles unique per page.' },
    { id: 'title-length', title: 'Title length', status: 'pass', severity: 'info', points: 5, maxPoints: 5, explanation: 'Title length is in the recommended range (30–60 characters).', whyItMatters: 'Very long titles can be cut off in search results.', evidence: '38 characters', recommendation: 'No change needed.' },
    { id: 'description-present', title: 'Meta description', status: 'attention', severity: 'medium', points: 0, maxPoints: 10, explanation: 'No meta description was found.', whyItMatters: 'The description often becomes the snippet under your title in search results. Without it, search engines choose the text for you.', evidence: 'No <meta name="description"> tag found in the page head.', recommendation: 'Add a meta description of 50–160 characters that describes the page and what the visitor should do next.' },
    { id: 'description-length', title: 'Meta description length', status: 'not_checked', severity: 'info', points: 0, maxPoints: 5, explanation: 'Not checked because no meta description was found.', whyItMatters: 'Length only matters once a description exists.', evidence: 'No meta description to measure.', recommendation: 'Add a description first, then keep it between 50 and 160 characters.' },
    { id: 'h1', title: 'Main heading (H1)', status: 'attention', severity: 'high', points: 0, maxPoints: 15, explanation: 'No H1 heading was found.', whyItMatters: 'The H1 tells visitors and search engines what the page is about. A page should normally have exactly one.', evidence: '0 H1 headings found.', recommendation: 'Add one clear H1 near the top of the page that matches the page topic.' },
    { id: 'heading-hierarchy', title: 'Heading order', status: 'pass', severity: 'info', points: 5, maxPoints: 5, explanation: 'No heading level jumps by more than one level were found.', whyItMatters: 'A clean H1 → H2 → H3 order helps readers and screen readers follow the page.', evidence: 'Headings found: H2 × 4, H3 × 2.', recommendation: 'No change needed for this check.' },
    { id: 'canonical', title: 'Canonical URL', status: 'attention', severity: 'medium', points: 0, maxPoints: 10, explanation: 'No canonical link was found.', whyItMatters: 'A canonical URL tells search engines which version of a page is the main one, so duplicate pages do not compete with each other.', evidence: 'No <link rel="canonical"> tag found.', recommendation: 'Add a canonical link pointing to the full, preferred URL of this page.' },
    { id: 'robots', title: 'Robots / indexing', status: 'pass', severity: 'info', points: 10, maxPoints: 10, explanation: 'No blocking robots directive was found. The page is indexable by default.', whyItMatters: 'A noindex directive would keep the page out of search results entirely.', evidence: 'No meta robots tag and no X-Robots-Tag header found.', recommendation: 'No change needed, unless you intentionally want this page hidden from search.' },
    { id: 'images-alt', title: 'Image alt text', status: 'attention', severity: 'medium', points: 5, maxPoints: 10, explanation: 'Some images are missing alt text.', whyItMatters: 'Alt text describes images for screen readers and for search engines that cannot see the image.', evidence: '6 images total, 3 missing alt text. Examples: /images/hero.jpg, /images/team.jpg', recommendation: 'Add short, descriptive alt text to every informative image. Leave purely decorative images with an empty alt="" if you choose.' },
    { id: 'links', title: 'Links', status: 'pass', severity: 'info', points: 5, maxPoints: 5, explanation: 'The page contains internal links.', whyItMatters: 'Internal links help visitors and search engines move between your pages.', evidence: '12 internal links, 3 external links.', recommendation: 'No change needed for this check.' },
    { id: 'technical-basics', title: 'Language, viewport and charset', status: 'pass', severity: 'info', points: 10, maxPoints: 10, explanation: 'Language, viewport and charset are all present.', whyItMatters: 'Language helps screen readers and search, viewport makes the page work on phones, and charset prevents broken characters.', evidence: 'lang="en", viewport present, charset=utf-8', recommendation: 'No change needed for this check.' },
    { id: 'open-graph', title: 'Social sharing (Open Graph)', status: 'attention', severity: 'low', points: 0, maxPoints: 5, explanation: 'Open Graph title or description is missing.', whyItMatters: 'Open Graph tags control how the page looks when shared on social media. They do not directly change search rankings.', evidence: 'og:title: missing, og:description: missing', recommendation: 'Add og:title, og:description and og:image if you want nicer social shares.' },
  ],
}
