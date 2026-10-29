import { useEffect, useRef, useState } from 'react'
import { WORKER_URL, apiBase, checkPremium, runAudit, runLaunchChecks } from './api'
import { LOGO_DARK_URL, LOGO_URL } from './logoData'
import { normalizeUrl } from './url'
import { SAMPLE_REPORT } from './sampleReport'
import { AUTH_URL, checkAccountStatus, type AccountState } from './account'
import type { AuditResponse, LaunchChecks } from './types'
import AuditSection from './tools/AuditSection'
import { ActionChecklist, GoPremium, LaunchChecklist, QualityTool } from './tools/Checklists'
import PreviewTool from './tools/PreviewTool'

type Phase = 'idle' | 'validating' | 'fetching' | 'launch' | 'done' | 'error'

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('kluzar-seo-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [rawInput, setRawInput] = useState('')
  const [submittedRaw, setSubmittedRaw] = useState('')
  const [normalized, setNormalized] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [phaseNote, setPhaseNote] = useState('')
  const [report, setReport] = useState<AuditResponse | null>(null)
  const [launchChecks, setLaunchChecks] = useState<LaunchChecks | null>(null)
  const [launchError, setLaunchError] = useState('')
  const [error, setError] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)
  const [premiumMsg, setPremiumMsg] = useState('')
  const [checkingPremium, setCheckingPremium] = useState(false)
  const [account, setAccount] = useState<AccountState | null>(null)
  const [loginMsg, setLoginMsg] = useState('')
  const [displayedScore, setDisplayedScore] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('kluzar-seo-theme', theme) } catch { /* ignore */ }
  }, [theme])

  // Account status on load: no integration -> Starter immediately, no fake
  // loading. Integration configured -> loading state, then backend result,
  // failing safe to Starter (never paid) on any failure. See src/account.ts.
  useEffect(() => {
    if (AUTH_URL) setAccount({ kind: 'loading', authenticated: false, premium: false, detail: 'Checking account status…' })
    checkAccountStatus(checkPremium).then(setAccount).catch(() =>
      setAccount({ kind: 'unverified', authenticated: false, premium: false, detail: 'Account status could not be verified. Only Starter features are available.' }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Animated score, only when results are ready. Reduced motion -> instant.
  useEffect(() => {
    if (!report) { setDisplayedScore(0); return }
    const target = report.score.total
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setDisplayedScore(target); return }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 800)
      setDisplayedScore(Math.round(target * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [report])

  const busy = phase === 'validating' || phase === 'fetching' || phase === 'launch'

  async function onAnalyze(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setLaunchError('')
    setPremiumMsg('')
    const result = normalizeUrl(rawInput)
    if (!result.ok) {
      setError(result.error)
      setPhase('error')
      return
    }
    if (!WORKER_URL) {
      setError('The analysis Worker is not configured for this build yet. Set VITE_WORKER_URL to https://seo-api.kluzar.com at build time, or view the sample report below. No analysis was faked.')
      setPhase('error')
      return
    }
    setSubmittedRaw(rawInput.trim())
    setNormalized(result.url)
    setPhase('validating')
    setPhaseNote('Validating the URL…')
    try {
      setPhase('fetching')
      setPhaseNote('Fetching the page safely and analyzing it (timeout and size limits apply)…')
      const audit = await runAudit(result.url)
      setReport(audit)
      // Launch checks reuse the same analyzed origin; a failure here must
      // not destroy the audit report — it is shown honestly as unchecked.
      setPhase('launch')
      setPhaseNote('Checking robots.txt and sitemap for the same site…')
      try {
        setLaunchChecks(await runLaunchChecks(result.url))
        setLaunchError('')
      } catch (launchErr) {
        setLaunchChecks(null)
        setLaunchError(launchErr instanceof Error ? launchErr.message : 'Robots/sitemap check failed.')
      }
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
      setPhase('error')
    }
  }

  function onSample() {
    setError('')
    setLaunchError('')
    setReport(SAMPLE_REPORT)
    setLaunchChecks(null)
    setLaunchError('Sample report — robots.txt and sitemap were not checked live. This is demonstration data, not a live analysis.')
    setNormalized(SAMPLE_REPORT.finalUrl)
    setSubmittedRaw(SAMPLE_REPORT.finalUrl)
    setPhase('done')
  }

  async function onPremium() {
    setCheckingPremium(true)
    setPremiumMsg('')
    try {
      const result = await checkPremium()
      setPremiumMsg(result.available
        ? 'Premium is available.'
        : `${result.reason} No checkout, no charge, and no premium access is granted here. Premium is enforced on the Worker, not by this page.`)
    } catch (err) {
      setPremiumMsg(err instanceof Error ? err.message : 'Premium check failed.')
    } finally {
      setCheckingPremium(false)
    }
  }

  function analyzeAnother() {
    document.getElementById('analyze')?.scrollIntoView({ behavior: 'smooth' })
    inputRef.current?.focus()
  }

  const attentionSorted = report
    ? [...report.findings].filter((f) => f.status === 'attention').sort((a, b) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 }
        return order[a.severity] - order[b.severity]
      })
    : []

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <a className="brand" href="https://seo.kluzar.com/" aria-label="Kluzar SEO home">
            <img src={theme === 'dark' ? LOGO_DARK_URL : LOGO_URL} alt="Kluzar" className="brand-logo" />
            <span className="brand-sub">SEO</span>
          </a>
          <div className="header-actions">
            {account && account.kind !== 'starter' && (
              <span className="account-badge" role="status">
                {account.kind === 'loading' ? 'Checking account…' : account.kind === 'premium' ? 'Premium' : account.kind === 'authenticated-starter' ? 'Signed in · Starter' : 'Account unverified · Starter only'}
              </span>
            )}
            {account && account.kind === 'starter' && <span className="account-badge">Starter · Free</span>}
            {AUTH_URL ? (
              <a className="login-btn" href={AUTH_URL}>Login</a>
            ) : (
              <button type="button" className="login-btn" onClick={() => setLoginMsg('Login is not live yet — no authentication destination is configured, so no account is created here. You can use all Starter features without logging in.')}>Login</button>
            )}
            <button type="button" className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              {theme === 'dark' ? '☀ Light' : '☾ Dark'}
            </button>
          </div>
        </div>
      </header>
      {loginMsg && <p className="login-msg" role="status">{loginMsg}</p>}

      <main className="unified">
        <section id="analyze" className="analyzer">
          <p className="eyebrow">KLUZAR SEO · ONE URL, ALL FIVE TOOLS</p>
          <h1>Analyze your website.</h1>
          <p className="hero-copy">
            Enter one website URL once, click Analyze Website, and get one unified report:
            Basic SEO Audit, Action Checklist, Search &amp; Social Preview, Launch Checklist,
            and Quality Checklist — all from the same analysis. We never invent rankings,
            traffic, backlinks, indexing status, or Core Web Vitals that were not checked.
          </p>

          <form className="audit-form" onSubmit={onAnalyze}>
            <label htmlFor="url-input">Website URL to analyze</label>
            <div className="form-row">
              <input
                ref={inputRef}
                id="url-input"
                type="text"
                inputMode="url"
                placeholder="example.com or https://example.com/about"
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                aria-describedby="url-help"
                autoComplete="off"
              />
              <button type="submit" disabled={busy}>
                {busy ? 'Analyzing…' : 'Analyze Website →'}
              </button>
            </div>
            <p id="url-help" className="help">
              A bare domain works: <code>example.com</code> becomes <code>https://example.com/</code>.
              A page path is preserved: <code>https://example.com/about</code> stays that page.
              Only public http:// and https:// pages. Private, local, and internal addresses are blocked by the Worker.
            </p>
          </form>

          {busy && (
            <div>
              <div className="stage-indicator" aria-label="Analysis stages">
                {(['Validate URL', 'Fetch & analyze page', 'Check robots & sitemap'] as const).map((label, i) => {
                  const activeIndex = phase === 'validating' ? 0 : phase === 'fetching' ? 1 : 2
                  const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending'
                  return <span key={label} className={`stage stage-${state}`}>{state === 'done' ? '✓ ' : ''}{label}</span>
                })}
              </div>
              <div className="progress" role="status" aria-live="polite">
                <span className="spinner" aria-hidden="true" />
                {phaseNote}
              </div>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              <strong>Could not complete the analysis.</strong> {error}
            </div>
          )}
          {!WORKER_URL && (
            <div className="notice">
              <strong>Worker not configured in this build.</strong> Live analysis needs
              <code> VITE_WORKER_URL </code> set to <code>https://seo-api.kluzar.com</code> at build time.
              The sample report below works without a Worker and is clearly labelled as demo data.
            </div>
          )}
          <div className="hero-actions">
            <button type="button" className="secondary" onClick={onSample}>
              View sample report →
            </button>
            <p className="api-note">
              API: <code>{WORKER_URL ? `${apiBase()}/audit` : 'Worker URL not configured'}</code>
            </p>
          </div>
        </section>

        {report && (
          <div className="report-shell">
            <nav className="section-nav" aria-label="Report sections">
              <a href="#section-audit">Audit</a>
              <a href="#section-action">Action Checklist</a>
              <a href="#section-preview">Preview</a>
              <a href="#section-launch">Launch</a>
              <a href="#section-quality">Quality</a>
              <a href="#section-premium">Premium</a>
            </nav>

            <section className="report-header">
              {report.sample && (
                <div className="sample-banner">
                  <strong>SAMPLE REPORT — demonstration data only.</strong> This was not produced
                  by a live analysis of a real website. The site uses the reserved .example domain.
                </div>
              )}
              <h2>Report for {new URL(report.finalUrl).hostname}</h2>
              <p className="report-meta">
                Page: <code>{report.finalUrl}</code><br />
                {submittedRaw && submittedRaw !== normalized && <>You entered: <code>{submittedRaw}</code> → normalized to: <code>{normalized}</code><br /></>}
                {report.auditedUrl !== report.finalUrl && <>Submitted target redirected to the final URL above{report.redirectChain.length > 0 && ' (' + report.redirectChain.map((r) => r.status).join(' → ') + ')'}.<br /></>}
                Analyzed at: {new Date(report.fetchedAt).toLocaleString()} · HTTP {report.status}
              </p>
              <div className="summary">
                <div className="score-box">
                  <div className="score-number">{displayedScore}<span>/{report.score.max}</span></div>
                  <div className="score-grade">{report.score.grade}</div>
                  <p>{report.score.gradeNote}</p>
                </div>
                <div>
                  <h3>How the score is calculated</h3>
                  <p>
                    The score is the sum of 12 scored checks only: title (10 + 5), description (10 + 5),
                    H1 (15), heading order (5), canonical (10), robots (10), images (10), links (5),
                    technical basics (10), and Open Graph (5) = 100. Informational findings (HTTPS,
                    security headers, new-tab links) are 0 points and do not change the score.
                    Broken-link and launch checks are not scored. This is a Kluzar audit score,
                    not a Google ranking.
                  </p>
                  <div className="counts">
                    <span>{report.findings.filter((f) => f.status === 'pass').length} passed</span>
                    <span>{report.findings.filter((f) => f.status === 'attention').length} need attention</span>
                    <span>{report.findings.filter((f) => f.status === 'not_checked').length} not checked</span>
                  </div>
                  {attentionSorted.length > 0 && (
                    <div className="prioritized">
                      <h3>Prioritized summary — fix these first</h3>
                      <ol>
                        {attentionSorted.slice(0, 5).map((f) => (
                          <li key={f.id}><a href="#section-audit">{f.title}</a> ({f.severity} severity) — {f.recommendation}</li>
                        ))}
                      </ol>
                      {attentionSorted.length > 5 && <p>Plus {attentionSorted.length - 5} more issue(s) in the audit section below.</p>}
                    </div>
                  )}
                  <button type="button" onClick={analyzeAnother}>Analyze another URL →</button>
                </div>
              </div>
            </section>

            <section id="section-audit" className="tool-section">
              <p className="tool-kicker">TOOL 1 · <span className="tier free">FREE</span></p>
              <h2>Basic SEO Audit</h2>
              <AuditSection report={report} />
            </section>

            <section id="section-action" className="tool-section">
              <p className="tool-kicker">TOOL 2 · <span className="tier free">FREE</span></p>
              <h2>SEO Action Checklist</h2>
              <ActionChecklist report={report} />
            </section>

            <section id="section-preview" className="tool-section">
              <p className="tool-kicker">TOOL 3 · <span className="tier free">FREE</span></p>
              <h2>Search &amp; Social Preview</h2>
              <PreviewTool report={report} />
            </section>

            <section id="section-launch" className="tool-section">
              <p className="tool-kicker">TOOL 4 · <span className="tier free">FREE</span></p>
              <h2>Website Launch Checklist</h2>
              <LaunchChecklist report={report} launchChecks={launchChecks} launchError={launchError} />
            </section>

            <section id="section-quality" className="tool-section">
              <p className="tool-kicker">TOOL 5 · <span className="tier free">FREE</span></p>
              <h2>Website Quality Checklist</h2>
              <QualityTool report={report} />
            </section>

            <section id="section-premium" className="tool-section">
              <h2>Premium</h2>
              {account && account.kind !== 'starter' && <p className="account-detail" role="status">{account.detail}</p>}
              <p className="tool-intro">Premium features are LOCKED in this release. They are not operational, no payment is taken here, and premium access is enforced on the Worker (currently 403 for every caller), not by hiding buttons on this page.</p>
              <ul>
                <li><strong>Full broken-link scan</strong> — <span className="tier premium">LOCKED</span> — Starter checks up to 5 internal links.</li>
                <li><strong>Premium audit findings</strong> — <span className="tier premium">LOCKED</span> — Structured data, hreflang, anchor-text quality, duplicate headings, word count, sitemap-from-robots.</li>
                <li><strong>Branded downloadable report</strong> — <span className="tier premium">LOCKED</span> — The free JSON/HTML downloads are not the branded report.</li>
                <li><strong>Multi-page quality scan</strong> — <span className="tier premium">LOCKED</span> — The Quality section above covers one analyzed page.</li>
              </ul>
              <GoPremium />
              <button type="button" onClick={onPremium} disabled={checkingPremium}>{checkingPremium ? 'Checking…' : 'Check premium availability →'}</button>
              {premiumMsg && <p className="premium-msg" role="status">{premiumMsg}</p>}
              <button type="button" className="secondary" onClick={analyzeAnother}>Analyze another URL →</button>
            </section>
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <p><strong>Kluzar SEO</strong> — Your Business, Online &amp; Managed.</p>
          <p>Contact: <a href="mailto:info@kluzar.com">info@kluzar.com</a> · Support: <a href="mailto:support@kluzar.com">support@kluzar.com</a> · Phone: <a href="tel:+923285049744">+92 328 5049744</a> · Serving Worldwide</p>
          <p className="footer-note">One analysis, five sections. Scores are Kluzar audit scores, not Google rankings. Private and local addresses are never fetched. This is a JavaScript-rendered single-page app on GitHub Pages — tool sections are not separate URLs, so the sitemap lists only the home page.</p>
        </div>
      </footer>
    </div>
  )
}
