import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { Header, ScoreRing } from './components/components'
import { runAudit, runLaunchChecks, downloadJson, downloadHtmlReport } from './lib/api'
import { normalizeUrl } from './lib/url'
import { Header, ScoreRing } from './components/components'
import PremiumUpsell from './components/PremiumUpsell'
import { checkAccountStatus, ACCOUNT_LOGIN_URL, PREMIUM_RETURN_URL } from './lib/account'
import type { AuditResponse, LaunchChecks } from './lib/types'
import {
  groupFindings,
  categoryScore,
  scorePct,
  severityRank,
  previewData,
} from './lib/derive'

// Non-critical report sections load on demand only — the first load ships
// the scan form, the overview, and shared UI, nothing more.
const AuditView = lazy(() => import('./tools/AuditView'))
const ChecklistView = lazy(() => import('./tools/ChecklistView'))
const PreviewView = lazy(() => import('./tools/PreviewView'))
const LaunchView = lazy(() => import('./tools/LaunchView'))
const QualityView = lazy(() => import('./tools/QualityView'))

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
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

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

  // Footer tool links use hashes (#audit, #checklist, ...): opening the
  // page with one selects that tool. Plain links, real destinations.
  useEffect(() => {
    const h = window.location.hash.replace('#', '')
    if (h === 'audit' || h === 'checklist' || h === 'preview' || h === 'launch' || h === 'quality') setTab(h)
  }, [])

  // Service worker: production HTTPS only. A new version never silently
  // replaces the running app — it waits until the user taps Refresh.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext || !import.meta.env.PROD) return
    let cancelled = false
    let refreshing = false
    const onControllerChange = () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      if (cancelled) return
      if (reg.waiting) {
        setWaitingWorker(reg.waiting)
        setUpdateAvailable(true)
      }
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(worker)
            setUpdateAvailable(true)
          }
        })
      })
    }).catch(() => {
      // Offline-first is an enhancement: the app works without it.
    })
    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  function applyUpdate() {
    if (!waitingWorker) return
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  }

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

  return (
    <div className="page">
      <Header theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} planLabel={planLabel} />

      {updateAvailable && (
        <div className="update-banner" role="status">
          <span>A new version of Kluzar SEO is available.</span>
          <button type="button" className="btn-primary" onClick={applyUpdate}>Refresh</button>
          <button type="button" className="btn-secondary" onClick={() => setUpdateAvailable(false)}>Later</button>
        </div>
      )}

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
                <button type="button" className="btn-secondary" onClick={() => { try { downloadJson(report) } catch { setError('Report download failed. Please try again.') } }}>Download JSON</button>
                <button type="button" className="btn-secondary" onClick={() => { try { downloadHtmlReport(report) } catch { setError('Report download failed. Please try again.') } }}>Download free report</button>
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
              <>
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
              <PremiumUpsell />
              </>
            )}

            <Suspense fallback={<p className="muted">Loading…</p>}>
              {tab === 'audit' && (
                <AuditView groups={groups} filter={auditFilter} onClearFilter={() => setAuditFilter(null)} />
              )}
              {tab === 'checklist' && <ChecklistView issues={issues} />}
              {tab === 'preview' && preview && <PreviewView report={report} preview={preview} />}
              {tab === 'launch' && (
                <LaunchView
                  report={report}
                  launch={launch}
                  launchLoading={launchLoading}
                  launchError={launchError}
                  onRunLaunch={handleLaunch}
                  manualDone={manualDone}
                  onToggleManual={toggleManual}
                />
              )}
              {tab === 'quality' && <QualityView report={report} />}
            </Suspense>
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
            <PremiumUpsell />
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <p><strong>Kluzar SEO</strong></p>
            <p className="muted">Free analysis of any public website — title, description, headings, links, images, and technical basics. No account needed for a basic scan.</p>
            <p><a href={PREMIUM_RETURN_URL} className="footer-main-link">Get Premium to unlock full potential</a></p>
          </div>
          <nav className="footer-col" aria-label="SEO tools">
            <h3>Tools</h3>
            <ul>
              <li><a href="#audit" onClick={() => setTab('audit')}>Basic SEO Audit</a></li>
              <li><a href="#checklist" onClick={() => setTab('checklist')}>Action Checklist</a></li>
              <li><a href="#preview" onClick={() => setTab('preview')}>Search &amp; Social Preview</a></li>
              <li><a href="#launch" onClick={() => setTab('launch')}>Launch Checklist</a></li>
              <li><a href="#quality" onClick={() => setTab('quality')}>Quality Check</a></li>
            </ul>
          </nav>
          <nav className="footer-col" aria-label="Kluzar">
            <h3>Kluzar</h3>
            <ul>
              <li><a href="https://kluzar.com/">Kluzar home</a></li>
              <li><a href="https://kluzar.com/services/">Services</a></li>
              <li><a href={ACCOUNT_LOGIN_URL}>Account login</a></li>
              <li><a href={PREMIUM_RETURN_URL}>Plans &amp; Premium</a></li>
            </ul>
          </nav>
          <nav className="footer-col" aria-label="Support and legal">
            <h3>Support &amp; legal</h3>
            <ul>
              <li><a href="mailto:info@kluzar.com">info@kluzar.com</a></li>
              <li><a href="mailto:support@kluzar.com">support@kluzar.com</a></li>
              <li><a href="https://kluzar.com/terms.html">Terms of Service</a></li>
              <li><a href="https://kluzar.com/privacy.html">Privacy Policy</a></li>
              <li><a href="https://kluzar.com/refund.html">Refund Policy</a></li>
              <li><a href="https://kluzar.com/payment-terms.html">Payment Terms</a></li>
            </ul>
          </nav>
        </div>
        <p className="muted small footer-note">
          This audit checks one public page. It does not claim search rankings, traffic, backlinks, or indexing status that were not checked. · Serving Worldwide
        </p>
      </footer>
    </div>
  )
}
