import { useEffect, useMemo, useState } from 'react'
import { Header, ScoreRing, FindingCard } from './components/components'
import { runAudit, runLaunchChecks, downloadJson, downloadHtmlReport, WORKER_URL } from './lib/api'
import { normalizeUrl } from './lib/url'
import { checkAccountStatus, PREMIUM_URL } from './lib/account'
import type { AuditResponse, LaunchChecks } from './lib/types'
import {
  groupFindings,
  categoryScore,
  scorePct,
  severityRank,
  findById,
  previewData,
  launchItems,
  MANUAL_LAUNCH_ITEMS,
  qualityItems,
} from './lib/derive'

type Tab = 'overview' | 'audit' | 'checklist' | 'preview' | 'launch' | 'quality'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'audit', label: 'SEO Audit' },
  { id: 'checklist', label: 'Action Checklist' },
  { id: 'preview', label: 'Search & Social Preview' },
  { id: 'launch', label: 'Launch Checklist' },
  { id: 'quality', label: 'Quality Check' },
]

function initialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('kluzar-seo-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)
  const [planLabel, setPlanLabel] = useState('Free')
  const [planDetail, setPlanDetail] = useState('Starter (Free) — no account needed for a basic scan.')
  const [urlInput, setUrlInput] = useState('')
  const [report, setReport] = useState<AuditResponse | null>(null)
  const [launch, setLaunch] = useState<LaunchChecks | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [auditFilter, setAuditFilter] = useState<string | null>(null)
  const [launchLoading, setLaunchLoading] = useState(false)
  const [launchError, setLaunchError] = useState('')
  const [manualDone, setManualDone] = useState<Set<number>>(new Set())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('kluzar-seo-theme', theme)
  }, [theme])

  useEffect(() => {
    checkAccountStatus().then((s) => {
      setPlanLabel(s.planLabel)
      setPlanDetail(s.detail)
    })
  }, [])

  const groups = useMemo(() => (report ? groupFindings(report) : []), [report])
  const issues = useMemo(
    () => (report ? [...report.findings].filter((f) => f.status === 'attention').sort((a, b) => severityRank(a) - severityRank(b)) : []),
    [report],
  )
  const positives = useMemo(() => (report ? report.findings.filter((f) => f.status === 'pass') : []), [report])

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const norm = normalizeUrl(urlInput)
    if (!norm.ok) {
      setError(norm.error)
      return
    }
    if (!WORKER_URL) {
      setError('The analysis service is not configured in this build, so a live scan cannot run. No sample or fake report is shown instead.')
      return
    }
    setLoading(true)
    setLaunch(null)
    try {
      const res = await runAudit(norm.url)
      setReport(res)
      setTab('overview')
      setAuditFilter(null)
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLaunch() {
    if (!report) return
    setLaunchError('')
    setLaunchLoading(true)
    try {
      const res = await runLaunchChecks(report.auditedUrl)
      setLaunch(res)
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Launch check failed. Try again.')
    } finally {
      setLaunchLoading(false)
    }
  }

  function toggleManual(i: number) {
    setManualDone((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const preview = report ? previewData(report) : null
  const launchList = report ? launchItems(report, launch) : []
  const qualityList = report ? qualityItems(report) : []

  return (
    <div className="page">
      <Header theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} planLabel={planLabel} />

      <main className="main">
        <section className="hero">
          <h1>Check your website&apos;s SEO</h1>
          <p className="hero-sub">
            Enter a public website address and get a clear report: score, issues, fixes, and
            previews — free, with no account needed for a basic scan.
          </p>
          <form className="scan-form" onSubmit={handleScan}>
            <label htmlFor="url-input" className="sr-only">Website URL</label>
            <input
              id="url-input"
              type="text"
              inputMode="url"
              autoComplete="off"
              placeholder="example.com or https://example.com/about"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="hero-note">{planDetail} One page is checked per scan. Private and local addresses cannot be analyzed.</p>
        </section>

        {report && (
          <section id="results" className="results">
            <div className="results-head">
              <div>
                <h2>Results for {report.finalUrl}</h2>
                <p className="muted">
                  Checked {report.fetchedAt} · HTTP {report.status}
                  {report.redirectChain.length > 1 ? ` · ${report.redirectChain.length - 1} redirect(s)` : ''}
                </p>
              </div>
              <div className="report-actions">
                <button type="button" className="btn-secondary" onClick={() => downloadJson(report)}>Download JSON</button>
                <button type="button" className="btn-secondary" onClick={() => downloadHtmlReport(report)}>Download free report</button>
              </div>
            </div>

            <nav className="tabs" aria-label="Report sections">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tab-btn${tab === t.id ? ' active' : ''}`}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? 'true' : undefined}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === 'overview' && (
              <div className="overview-grid">
                <div className="card score-card">
                  <ScoreRing pct={scorePct(report)} label={report.score.grade} />
                  <p className="score-note">{report.score.total} / {report.score.max} points</p>
                  <p className="muted">{report.score.gradeNote}</p>
                  <p className="muted">
                    {positives.length} check(s) good · {issues.length} need work ·{' '}
                    {report.findings.filter((f) => f.status === 'not_checked').length} not checked
                  </p>
                </div>
                <div className="card">
                  <h3>Issues found</h3>
                  {issues.length === 0 ? (
                    <p>No issues were found in this scan.</p>
                  ) : (
                    <ul className="plain-list">
                      {issues.slice(0, 8).map((f) => (
                        <li key={f.id}>
                          <strong>{f.title}</strong> — {f.explanation}
                        </li>
                      ))}
                    </ul>
                  )}
                  {issues.length > 8 && <p className="muted">Plus {issues.length - 8} more — see the Action Checklist.</p>}
                </div>
                <div className="card">
                  <h3>What&apos;s working</h3>
                  {positives.length === 0 ? (
                    <p>No checks passed in this scan yet.</p>
                  ) : (
                    <ul className="plain-list">
                      {positives.slice(0, 8).map((f) => (
                        <li key={f.id}><strong>{f.title}</strong></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="card">
                  <h3>Top recommendations</h3>
                  {issues.length === 0 ? (
                    <p>Nothing urgent — keep the good checks passing.</p>
                  ) : (
                    <ol className="plain-list">
                      {issues.slice(0, 5).map((f) => (
                        <li key={f.id}><strong>{f.title}:</strong> {f.recommendation}</li>
                      ))}
                    </ol>
                  )}
                </div>
                <div className="card wide-card">
                  <h3>Categories</h3>
                  <div className="category-grid">
                    {groups.map((g) => {
                      const s = categoryScore(g.findings)
                      return (
                        <button
                          key={g.id}
                          type="button"
                          className="category-tile"
                          onClick={() => {
                            setAuditFilter(g.id)
                            setTab('audit')
                          }}
                        >
                          <span className="category-name">{g.label}</span>
                          <span className="category-score">{s.pct}%</span>
                          <span className="muted small">
                            {g.findings.filter((f) => f.status === 'pass').length} good ·{' '}
                            {g.findings.filter((f) => f.status === 'attention').length} need work
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab === 'audit' && (
              <div>
                {auditFilter && (
                  <p>
                    Showing <strong>{groups.find((g) => g.id === auditFilter)?.label}</strong>{' '}
                    <button type="button" className="link-btn" onClick={() => setAuditFilter(null)}>Show all categories</button>
                  </p>
                )}
                {(auditFilter ? groups.filter((g) => g.id === auditFilter) : groups).map((g) => {
                  const s = categoryScore(g.findings)
                  return (
                    <section key={g.id} className="category-section">
                      <h3>{g.label} <span className="muted small">— {s.earned}/{s.max} points</span></h3>
                      <div className="findings-list">
                        {g.findings.map((f) => (
                          <FindingCard key={f.id} finding={f} />
                        ))}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}

            {tab === 'checklist' && (
              <div>
                <p className="muted">
                  Every issue below explains what needs improvement, why it matters, and what to do.
                  {issues.length > 0 && ` ${issues.length} task(s) in total.`}
                </p>
                {issues.length === 0 ? (
                  <p>No action items — everything checked passed.</p>
                ) : (
                  <div className="findings-list">
                    {issues.map((f) => (
                      <FindingCard key={f.id} finding={f} showWhy />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'preview' && preview && (
              <div>
                <p className="muted">
                  Previews use the real title, description, and Open Graph values found on the page.
                  A missing value is shown as missing — nothing is invented.
                </p>
                <div className="preview-grid">
                  <article className="card preview-card">
                    <h3>Google Search</h3>
                    <p className="google-url">{preview.url}</p>
                    <p className="google-title">{preview.title ?? 'Missing page title'}</p>
                    <p className="google-desc">{preview.description ?? 'No meta description found — Google would use page text instead.'}</p>
                  </article>
                  <article className="card preview-card">
                    <h3>Facebook</h3>
                    <p className="fb-title">{preview.ogTitle ?? preview.title ?? 'Missing sharing title'}</p>
                    <p className="muted small">{preview.url}</p>
                    <p>{preview.ogDescription ?? preview.description ?? 'No sharing description found.'}</p>
                    {!preview.ogTitle && <p className="warn">og:title is missing — Facebook would fall back to the page title.</p>}
                    {!preview.ogDescription && <p className="warn">og:description is missing — Facebook would fall back to the meta description or page text.</p>}
                  </article>
                  <article className="card preview-card">
                    <h3>X (Twitter) card</h3>
                    <p className="fb-title">{preview.ogTitle ?? preview.title ?? 'Missing card title'}</p>
                    <p>{preview.ogDescription ?? preview.description ?? 'No card description found.'}</p>
                    <p className="muted small">X summary cards use Open Graph values when present, otherwise the page title and description.</p>
                  </article>
                </div>
                <div className="card">
                  <h3>Metadata recommendations</h3>
                  <ul className="plain-list">
                    {(['title-present', 'description-present', 'open-graph'] as const).map((id) => {
                      const f = findById(report, id)
                      if (!f) return null
                      return <li key={id}><strong>{f.title}:</strong> {f.recommendation}</li>
                    })}
                    {preview.canonical && <li><strong>Canonical:</strong> {preview.canonical}</li>}
                  </ul>
                </div>
              </div>
            )}

            {tab === 'launch' && (
              <div>
                {!launch ? (
                  <div className="card">
                    <p>Launch checks fetch the site&apos;s robots.txt and sitemap in addition to the audit.</p>
                    <button type="button" className="btn-primary" onClick={handleLaunch} disabled={launchLoading}>
                      {launchLoading ? 'Checking…' : 'Run launch checks'}
                    </button>
                    {launchError && <p className="form-error" role="alert">{launchError}</p>}
                  </div>
                ) : (
                  <div className="card">
                    <h3>Automatic checks</h3>
                    <ul className="plain-list">
                      {launchList.map((item) => (
                        <li key={item.label}>
                          <strong>{item.label}:</strong> {item.detail}
                        </li>
                      ))}
                    </ul>
                    <p className="muted small">{launch.note}</p>
                  </div>
                )}
                <div className="card">
                  <h3>Manual checks — verify these yourself before launch</h3>
                  <ul className="check-list">
                    {MANUAL_LAUNCH_ITEMS.map((item, i) => (
                      <li key={item}>
                        <label>
                          <input type="checkbox" checked={manualDone.has(i)} onChange={() => toggleManual(i)} />
                          {item}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="muted small">{manualDone.size} of {MANUAL_LAUNCH_ITEMS.length} manual checks ticked. These are stored only in this browser.</p>
                </div>
              </div>
            )}

            {tab === 'quality' && (
              <div>
                <p className="muted">
                  Quality here is derived from the same scan — accessibility basics, mobile readiness,
                  connection security, and the bounded broken-link check. This scan does not measure
                  load speed, so no speed score is claimed.
                </p>
                <div className="findings-list">
                  {qualityList.map((q) => (
                    <article key={q.label} className="finding-card">
                      <div className="finding-head">
                        <h3>{q.label}</h3>
                        <span className={`status-dot status-${q.state === 'pass' ? 'pass' : q.state === 'attention' ? 'attention' : 'not_checked'}`}>
                          {q.state === 'pass' ? 'Good' : q.state === 'attention' ? 'Needs work' : 'Not checked'}
                        </span>
                      </div>
                      <p className="finding-text">{q.detail}</p>
                    </article>
                  ))}
                </div>
                <div className="card">
                  <h3>Full multi-page quality scan</h3>
                  <p>
                    A full scan of every page on a site is a Premium feature and is not available yet.
                    The free scan checks one page and a bounded number of its links.
                  </p>
                  <a href={PREMIUM_URL} target="_blank" rel="noreferrer" className="btn-primary">Get Premium</a>
                </div>
              </div>
            )}
          </section>
        )}

        {!report && !loading && (
          <section className="tools-intro">
            <h2>Five tools, one report</h2>
            <div className="tools-grid">
              <div className="card"><h3>Basic SEO Audit</h3><p>Title, description, headings, images, links, canonical, indexing, sitemap, technical basics, and social tags — scored, with clear findings.</p></div>
              <div className="card"><h3>Action Checklist</h3><p>Every issue turned into a task: what to fix, why it matters, and how.</p></div>
              <div className="card"><h3>Search &amp; Social Preview</h3><p>How the page may appear on Google, Facebook, and X — from the real metadata found.</p></div>
              <div className="card"><h3>Launch Checklist</h3><p>HTTPS, robots, sitemap, metadata, and the manual checks to verify before going live.</p></div>
              <div className="card"><h3>Quality Check</h3><p>Accessibility basics, mobile readiness, security signals, and broken links — kept separate from the SEO score.</p></div>
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <p>
          Kluzar SEO · Contact: info@kluzar.com · support@kluzar.com · Serving Worldwide
        </p>
        <p className="muted small">
          This audit checks one public page. It does not claim search rankings, traffic, backlinks, or indexing status that were not checked.
        </p>
      </footer>
    </div>
  )
}
