import { useEffect, useMemo, useState } from 'react'
import { LIMITS, PREMIUM_DESTINATION_URL } from '../limits'
import type { AuditResponse, Finding, LaunchChecks } from '../types'

// ---- Shared: honestly-described local storage ---------------------------
// Progress is saved in this browser's localStorage ONLY. It is not
// cloud-synced, not account-saved, and it disappears if this browser's
// storage is cleared or a different device is used. The UI says exactly that.
function useLocalChecklist(key: string, initial: string[]): [string[], (id: string) => void, () => void] {
  const [done, setDone] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(done)) } catch { /* storage unavailable — progress just won't persist */ }
  }, [done, key])
  const toggle = (id: string) => setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))
  const reset = () => setDone([])
  void initial
  return [done, toggle, reset]
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="progress-block" role="status" aria-label={`${done} of ${total} complete`}>
      <div className="progress-bar"><span style={{ width: `${pct}%` }} /></div>
      <p>{done} of {total} complete ({pct}%)</p>
    </div>
  )
}

export function LockedNote({ feature }: { feature: string }) {
  return (
    <div className="locked">
      <strong>LOCKED — Premium</strong>
      <p>{feature} is a planned Premium feature. It is not operational in this release, and no payment is taken here.</p>
      {PREMIUM_DESTINATION_URL ? (
        <p><a href={PREMIUM_DESTINATION_URL}>Go Premium →</a></p>
      ) : (
        <p>Premium is not live yet — the premium destination has not been configured, so no payment link is shown here.</p>
      )}
    </div>
  )
}

export function GoPremium() {
  return (
    <div className="go-premium">
      <strong>Go Premium</strong>
      <p>Unlock full broken-link scans, premium audit findings, branded reports, and multi-page quality scans when premium entitlements launch. No payment is taken on this page.</p>
      {PREMIUM_DESTINATION_URL ? (
        <a className="go-premium-link" href={PREMIUM_DESTINATION_URL}>Go Premium →</a>
      ) : (
        <p>Premium destination is not configured yet, so no link is shown here. This button does not charge anything and does not create an account.</p>
      )}
    </div>
  )
}

function priorityOf(f: Finding): string {
  if (f.id === 'robots' && f.status === 'attention') return 'Critical'
  if (f.severity === 'high') return 'High'
  if (f.severity === 'medium') return 'Medium'
  return 'Low'
}

function categoryOf(f: Finding): string {
  if (f.id.startsWith('title') || f.id.startsWith('description')) return 'Metadata'
  if (f.id === 'h1' || f.id === 'heading-hierarchy') return 'Headings'
  if (f.id === 'canonical' || f.id === 'robots') return 'Indexing'
  if (f.id === 'images-alt') return 'Images'
  if (f.id === 'links') return 'Links'
  if (f.id === 'technical-basics') return 'Technical'
  if (f.id === 'open-graph') return 'Social'
  if (f.id === 'https' || f.id.startsWith('security-')) return 'Security headers'
  return 'General'
}

// ---- B. SEO Action Checklist ---------------------------------------------
export function ActionChecklist({ report }: { report: AuditResponse | null }) {
  const tasks = useMemo(() => {
    if (!report) return []
    return report.findings
      .filter((f) => f.status === 'attention')
      .map((f) => ({ id: f.id, title: f.title, priority: priorityOf(f), category: categoryOf(f), instruction: f.recommendation, evidence: f.evidence }))
  }, [report])
  const [done, toggle, reset] = useLocalChecklist('kluzar-seo-action-checklist', tasks.map((t) => t.id))
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Done' | 'Todo'>('All')
  const shown = tasks.filter((t) => (priorityFilter === 'All' || t.priority === priorityFilter) && (statusFilter === 'All' || (statusFilter === 'Done') === done.includes(t.id)))

  if (!report) {
    return (
      <div className="tool">
        <p className="tool-kicker">TOOL 2 · <span className="tier free">FREE</span></p>
        <h2>SEO Action Checklist</h2>
        <div className="empty"><p>No audit yet.</p><p>Run a Basic Audit first. Every finding that needs attention will appear here as a task you can tick off.</p></div>
      </div>
    )
  }
  if (tasks.length === 0) {
    return (
      <div className="tool">
        <p className="tool-kicker">TOOL 2 · <span className="tier free">FREE</span></p>
        <h2>SEO Action Checklist</h2>
        <div className="empty"><p>Nothing to fix from the latest audit.</p><p>All scored checks passed. This does not mean the page is perfect — it means the checks in this audit found nothing needing attention.</p></div>
      </div>
    )
  }
  return (
    <div className="tool">
      <p className="tool-kicker">TOOL 2 · <span className="tier free">FREE</span></p>
      <h2>SEO Action Checklist</h2>
      <p className="tool-intro">Tasks converted from the latest audit ({report.finalUrl}). Progress is saved only in this browser — it is not cloud-synced and not tied to an account.</p>
      <Progress done={tasks.filter((t) => done.includes(t.id)).length} total={tasks.length} />
      <div className="filters" role="group" aria-label="Filter tasks">
        <label>Priority
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            {['All', 'Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label>Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'All' | 'Done' | 'Todo')}>
            {['All', 'Done', 'Todo'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <button type="button" onClick={reset}>Reset progress</button>
      </div>
      <ul className="task-list">
        {shown.map((t) => (
          <li key={t.id} className={done.includes(t.id) ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={done.includes(t.id)} onChange={() => toggle(t.id)} />
              <span><strong>{t.title}</strong> — {t.priority} · {t.category}<br />{t.instruction}<br /><small>Evidence: {t.evidence}</small></span>
            </label>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p>No tasks match these filters.</p>}
    </div>
  )
}

// ---- D. Website Launch Checklist -----------------------------------------
interface LaunchTask { id: string; title: string; kind: 'Automatic' | 'Manual'; detail: string }
const LAUNCH_MANUAL: LaunchTask[] = [
  { id: 'launch-analytics', title: 'Analytics installed', kind: 'Manual', detail: 'Confirm your analytics tool is installed on every page and receiving data. This tool does not connect to analytics — tick this only after you have checked it yourself.' },
  { id: 'launch-search-console', title: 'Search Console verified', kind: 'Manual', detail: 'Confirm the site is verified in Google Search Console and a sitemap has been submitted there. This tool does not connect to Search Console.' },
  { id: 'launch-final-review', title: 'Final content review', kind: 'Manual', detail: 'Read the homepage and key pages once as a visitor: no placeholder text, no broken images, contact details correct, forms working.' },
  { id: 'launch-legal', title: 'Privacy / contact pages present', kind: 'Manual', detail: 'Confirm privacy and contact pages exist and are linked, if your site needs them.' },
]

export function LaunchChecklist({ report, launchChecks, launchError }: { report: AuditResponse | null; launchChecks: LaunchChecks | null; launchError: string }) {
  const [done, toggle, reset] = useLocalChecklist('kluzar-seo-launch-checklist', LAUNCH_MANUAL.map((t) => t.id))

  const auto: LaunchTask[] = []
  if (report) {
    const f = (id: string) => report.findings.find((x) => x.id === id)
    auto.push(
      { id: 'launch-title', title: 'SEO title present', kind: 'Automatic', detail: f('title-present')?.status === 'pass' ? 'Passed in the latest audit.' : 'Needs attention in the latest audit — see the Action Checklist.' },
      { id: 'launch-desc', title: 'Meta description present', kind: 'Automatic', detail: f('description-present')?.status === 'pass' ? 'Passed in the latest audit.' : 'Needs attention in the latest audit.' },
      { id: 'launch-canonical', title: 'Canonical present', kind: 'Automatic', detail: f('canonical')?.status === 'pass' ? 'Passed in the latest audit.' : 'Needs attention in the latest audit.' },
      { id: 'launch-indexing', title: 'No blocking noindex', kind: 'Automatic', detail: f('robots')?.status === 'pass' ? 'No blocking robots directive found.' : 'A blocking directive was found — check the audit before launch.' },
      { id: 'launch-viewport', title: 'Mobile viewport present', kind: 'Automatic', detail: f('technical-basics')?.evidence.includes('viewport present') ? 'Viewport tag present.' : 'Viewport tag missing in the latest audit.' },
      { id: 'launch-https', title: 'Served over HTTPS', kind: 'Automatic', detail: report.finalUrl.startsWith('https://') ? 'Final URL uses HTTPS.' : 'Final URL does not use HTTPS — fix this before launch.' },
      { id: 'launch-images', title: 'Image alt text', kind: 'Automatic', detail: f('images-alt')?.status === 'pass' ? 'All images have alt text (or no images found).' : 'Some images are missing alt text — see the audit.' },
      { id: 'launch-links', title: 'Internal links present', kind: 'Automatic', detail: f('links')?.status === 'pass' ? 'Internal links found.' : 'No internal links found in the latest audit.' },
    )
  }
  const all = [...auto, ...LAUNCH_MANUAL]
  const autoDone = auto.filter((t) => t.detail.startsWith('Passed') || t.detail.startsWith('No blocking') || t.detail.startsWith('Viewport tag present') || t.detail.startsWith('Final URL uses') || t.detail.startsWith('All images') || t.detail.startsWith('Internal links found')).length
  const totalDone = autoDone + LAUNCH_MANUAL.filter((t) => done.includes(t.id)).length

  return (
    <div className="tool">
      <p className="tool-kicker">TOOL 4 · <span className="tier free">FREE</span></p>
      <h2>Website Launch Checklist</h2>
      <p className="tool-intro">Automatic items come from the latest audit and from a live robots.txt / sitemap check. Manual items are reminders only — this tool does not connect to Analytics or Search Console, and ticking them does not verify anything.</p>
      {!report && <div className="empty"><p>No audit yet.</p><p>Run a Basic Audit first to fill in the automatic items. Manual items below still work without an audit.</p></div>}
      {report && <Progress done={totalDone} total={all.length} />}
      <ul className="task-list">
        {auto.map((t) => (
          <li key={t.id}><span><strong>{t.title}</strong> — {t.kind}<br />{t.detail}</span></li>
        ))}
        {LAUNCH_MANUAL.map((t) => (
          <li key={t.id} className={done.includes(t.id) ? 'done' : ''}>
            <label><input type="checkbox" checked={done.includes(t.id)} onChange={() => toggle(t.id)} /><span><strong>{t.title}</strong> — {t.kind}<br />{t.detail}</span></label>
          </li>
        ))}
      </ul>
      <div className="card">
        <h3>Robots.txt &amp; sitemap — checked with the same analysis <span className="tier free">FREE</span></h3>
        {launchError && <p className="error" role="alert">{launchError}</p>}
        {launchChecks ? (
          <dl className="meta-list">
            <div><dt>Site origin</dt><dd>{launchChecks.origin} — HTTPS: {launchChecks.https ? 'yes' : 'no'}</dd></div>
            <div><dt>robots.txt</dt><dd>{launchChecks.robotsTxt.found ? `Found (HTTP ${launchChecks.robotsTxt.status})` : 'Not found'} {launchChecks.robotsTxt.sitemapUrls.length > 0 && `· Sitemap lines: ${launchChecks.robotsTxt.sitemapUrls.join(', ')}`}</dd></div>
            <div><dt>Sitemap</dt><dd>{launchChecks.sitemap.found ? `Found at ${launchChecks.sitemap.url} (HTTP ${launchChecks.sitemap.status})` : 'Not found at the checked locations'}</dd></div>
            <div><dt>Checked at</dt><dd>{new Date(launchChecks.checkedAt).toLocaleString()}</dd></div>
          </dl>
        ) : !launchError && <p className="help">Robots.txt and sitemap were not checked live for this report (for example, a sample report). The automatic items above still come from the audit itself.</p>}
        <p className="help">This checks only robots.txt and sitemap availability for the audited origin. It does not check Search Console, indexing status, or whether the sitemap content is valid XML in full.</p>
      </div>
      {LAUNCH_MANUAL.length > 0 && <button type="button" onClick={reset}>Reset manual progress</button>}
    </div>
  )
}

// ---- E. Website Quality Checklist ----------------------------------------
export function QualityTool({ report }: { report: AuditResponse | null }) {
  if (!report) {
    return (
      <div className="tool">
        <p className="tool-kicker">TOOL 5 · <span className="tier free">FREE</span></p>
        <h2>Website Quality Checklist</h2>
        <div className="empty"><p>No audit yet.</p><p>Run a Basic Audit first. Quality items below are derived from that audit's actual evidence — nothing here is a full browser-rendered accessibility audit, a real-user performance measurement, or a security penetration test.</p></div>
      </div>
    )
  }
  const f = (id: string) => report.findings.find((x) => x.id === id)
  const rows: { title: string; status: string; detail: string }[] = [
    { title: 'HTML structure & metadata', status: f('title-present')?.status === 'pass' && f('h1')?.status === 'pass' ? 'Passed' : 'Needs attention', detail: `Title: ${f('title-present')?.status ?? 'not checked'} · H1: ${f('h1')?.status ?? 'not checked'} · Heading order: ${f('heading-hierarchy')?.status ?? 'not checked'}` },
    { title: 'Mobile viewport', status: f('technical-basics')?.evidence.includes('viewport present') ? 'Passed' : 'Needs attention', detail: 'From the technical-basics finding. Tap-target sizes and real-device rendering are NOT measured here.' },
    { title: 'Image alternative text', status: f('images-alt')?.status ?? 'not_checked', detail: f('images-alt')?.evidence ?? '' },
    { title: 'Link destinations', status: report.brokenLinks ? (report.brokenLinks.broken.length === 0 ? 'Passed (checked links)' : 'Needs attention') : 'Not checked', detail: report.brokenLinks ? `${report.brokenLinks.checked} internal link(s) checked, ${report.brokenLinks.broken.length} broken, ${report.brokenLinks.couldNotVerify.length} could not be verified, ${report.brokenLinks.unchecked} unchecked (Starter limit: ${LIMITS.auditBrokenLinksChecked}). ${report.brokenLinks.note}` : 'Broken-link checking was not returned by this Worker version. Only links actually checked are ever labelled broken.' },
    { title: 'Link safety (new-tab links)', status: (report.blankWithoutNoopener ?? 0) === 0 ? 'Passed' : 'Needs attention', detail: `${report.blankWithoutNoopener ?? 0} external link(s) open in a new tab without rel="noopener". This is a static HTML signal only.` },
    { title: 'Security response headers (presence only)', status: 'Info', detail: `HSTS: ${report.headers.strictTransportSecurity ? 'present' : 'not present'} · X-Content-Type-Options: ${report.headers.xContentTypeOptions ? 'present' : 'not present'} · X-Frame-Options: ${report.headers.xFrameOptions ? 'present' : 'not present'} · CSP: ${report.headers.hasContentSecurityPolicy ? 'present' : 'not present'}. Header presence is not a security test — it does not prove the site is secure.` },
    { title: 'Performance signals', status: 'Info', detail: 'No real-user performance is measured by this static audit. No Core Web Vitals, load time, or Lighthouse score is claimed here. Use a real browser performance tool for that.' },
    { title: 'Accessibility indicators', status: 'Info', detail: 'Only static signals are available: lang declaration, heading order, image alt text, and link text quality (Premium, gated). This is not a WCAG audit and not a screen-reader test.' },
  ]
  return (
    <div className="tool">
      <p className="tool-kicker">TOOL 5 · <span className="tier free">FREE</span></p>
      <h2>Website Quality Checklist</h2>
      <p className="tool-intro">Derived from the latest audit ({report.finalUrl}). Limitations are stated on every row: static HTML analysis cannot see JavaScript-rendered content, real performance, or full accessibility.</p>
      <table className="quality-table">
        <thead><tr><th>Check</th><th>Status</th><th>Evidence / limitation</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.title}><td><strong>{r.title}</strong></td><td>{r.status}</td><td>{r.detail}</td></tr>)}
        </tbody>
      </table>
      <LockedNote feature="Full multi-page quality scan (every page on a site, not just one URL)" />
    </div>
  )
}
