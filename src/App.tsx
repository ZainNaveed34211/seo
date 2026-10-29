import { useMemo, useState } from 'react'
import { WORKER_URL, apiBase, checkPremium, clientValidateUrl, downloadHtmlReport, downloadJson, runAudit } from './api'
import { SAMPLE_REPORT } from './sampleReport'
import type { AuditResponse, FindingStatus } from './types'

type Phase = 'idle' | 'validating' | 'fetching' | 'analysing' | 'done' | 'error'

const STATUS_LABEL: Record<FindingStatus, string> = {
  pass: 'Passed',
  attention: 'Needs attention',
  not_checked: 'Not checked',
}

export default function App() {
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [phaseNote, setPhaseNote] = useState('')
  const [report, setReport] = useState<AuditResponse | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | FindingStatus>('all')
  const [premiumMsg, setPremiumMsg] = useState('')
  const [checkingPremium, setCheckingPremium] = useState(false)

  const filtered = useMemo(() => {
    if (!report) return []
    return filter === 'all' ? report.findings : report.findings.filter((f) => f.status === filter)
  }, [report, filter])

  const counts = useMemo(() => {
    if (!report) return { pass: 0, attention: 0, not_checked: 0 }
    return {
      pass: report.findings.filter((f) => f.status === 'pass').length,
      attention: report.findings.filter((f) => f.status === 'attention').length,
      not_checked: report.findings.filter((f) => f.status === 'not_checked').length,
    }
  }, [report])

  async function onAudit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPremiumMsg('')
    const problem = clientValidateUrl(url)
    if (problem) {
      setError(problem)
      setPhase('error')
      return
    }
    if (!WORKER_URL) {
      setError('The audit Worker is not configured for this build yet. Set VITE_WORKER_URL to the Worker URL before building for GitHub Pages, run a local Worker with wrangler dev, or view the sample report below. No audit was faked.')
      setPhase('error')
      return
    }
    setPhase('validating')
    setPhaseNote('Checking the URL and sending it to the secure Worker…')
    try {
      setPhase('fetching')
      setPhaseNote('Worker is fetching the public page safely (timeout and size limits apply)…')
      const result = await runAudit(url.trim())
      setPhase('analysing')
      setPhaseNote('Analysing headings, metadata, images and links…')
      // The Worker already analysed the page; this step is rendering only.
      setReport(result)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit failed.')
      setPhase('error')
    }
  }

  function onSample() {
    setError('')
    setPremiumMsg('')
    setReport(SAMPLE_REPORT)
    setPhase('done')
  }

  async function onPremium() {
    setCheckingPremium(true)
    setPremiumMsg('')
    try {
      const result = await checkPremium()
      setPremiumMsg(result.available
        ? 'Premium is available.'
        : `${result.reason} No checkout, no charge, and no premium access is granted here.`)
    } catch (err) {
      setPremiumMsg(err instanceof Error ? err.message : 'Premium check failed.')
    } finally {
      setCheckingPremium(false)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="header-inner">
          <a className="brand" href="https://seo.kluzar.com/" aria-label="Kluzar SEO home">
            <span className="brand-mark" aria-hidden="true">K</span>
            <span>KLUZAR</span>
            <span className="brand-sub">SEO Audit</span>
          </a>
          <nav className="header-nav">
            <a href="#audit">Free audit</a>
            <a href="#premium">Premium</a>
            <a href="#sample">Sample report</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-inner">
            <p className="eyebrow">KLUZAR SEO · FREE PAGE AUDIT</p>
            <h1>Check your page.<br />Fix what matters.</h1>
            <p className="hero-copy">
              Enter a public URL and get a plain-English SEO report: what is missing, why it
              matters, the actual evidence, and the next step. We never invent rankings,
              traffic, backlinks, or indexing status that was not checked.
            </p>

            <form id="audit" className="audit-form" onSubmit={onAudit}>
              <label htmlFor="url-input">Website URL to audit</label>
              <div className="form-row">
                <input
                  id="url-input"
                  type="text"
                  inputMode="url"
                  placeholder="https://example.com/"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  aria-describedby="url-help"
                />
                <button type="submit" disabled={phase === 'validating' || phase === 'fetching' || phase === 'analysing'}>
                  {phase === 'fetching' || phase === 'analysing' || phase === 'validating' ? 'Auditing…' : 'Run free audit →'}
                </button>
              </div>
              <p id="url-help" className="help">
                Only public http:// and https:// pages. Private, local, and internal addresses are
                blocked by the Worker. The page itself is fetched server-side — its scripts are
                never run in your browser.
              </p>
            </form>

            {(phase === 'validating' || phase === 'fetching' || phase === 'analysing') && (
              <div className="progress" role="status" aria-live="polite">
                <span className="spinner" aria-hidden="true" />
                {phaseNote}
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                <strong>Could not complete the audit.</strong> {error}
              </div>
            )}
            {!WORKER_URL && (
              <div className="notice">
                <strong>Worker not configured in this build.</strong> Live audits need
                <code> VITE_WORKER_URL </code> set to the new Worker URL at build time.
                The sample report below works without a Worker and is clearly labelled as demo data.
              </div>
            )}

            <div className="hero-actions">
              <button type="button" className="secondary" onClick={onSample} id="sample">
                View sample report →
              </button>
              <a className="secondary-link" href="#premium">What does Premium add?</a>
            </div>
            <p className="api-note">
              API: <code>{WORKER_URL ? `${apiBase()}/audit` : 'Worker URL not configured'}</code>
              {WORKER_URL ? '' : ' · Local dev uses the Vite /api proxy to a local Worker.'}
            </p>
          </div>
        </section>

        {report && (
          <section className="report" aria-live="polite">
            <div className="report-inner">
              {report.sample && (
                <div className="sample-banner">
                  <strong>SAMPLE REPORT — demonstration data only.</strong> This was not produced
                  by a live audit of a real website. The site uses the reserved .example domain.
                </div>
              )}
              <div className="summary">
                <div className="score-box">
                  <div className="score-number">{report.score.total}<span>/{report.score.max}</span></div>
                  <div className="score-grade">{report.score.grade}</div>
                  <p>{report.score.gradeNote}</p>
                </div>
                <div className="summary-meta">
                  <h2>Report summary</h2>
                  <dl>
                    <div><dt>Page audited</dt><dd>{report.auditedUrl}</dd></div>
                    <div><dt>Final URL</dt><dd>{report.finalUrl}</dd></div>
                    <div><dt>HTTP status</dt><dd>{report.status}</dd></div>
                    <div><dt>Checked at</dt><dd>{new Date(report.fetchedAt).toLocaleString()}</dd></div>
                    {report.redirectChain.length > 0 && (
                      <div><dt>Redirects</dt><dd>{report.redirectChain.map((r) => `${r.status} → ${r.url}`).join(' · ')}</dd></div>
                    )}
                  </dl>
                  <div className="mobile-check">
                    <strong>Mobile basics (from this audit only):</strong>{' '}
                    {report.findings.find((f) => f.id === 'technical-basics')?.evidence.includes('viewport present')
                      ? 'Viewport tag is present, so the page can scale on phones. '
                      : 'Viewport tag is missing — the page may not scale properly on phones. '}
                    Real tap-target sizes and Core Web Vitals are NOT measured by this HTML audit; they need a real browser/device test.
                  </div>
                  <div className="counts">
                    <span>{counts.pass} passed</span>
                    <span>{counts.attention} need attention</span>
                    <span>{counts.not_checked} not checked</span>
                  </div>
                  <div className="export-row">
                    <button type="button" onClick={() => downloadJson(report)}>Download JSON</button>
                    <button type="button" onClick={() => downloadHtmlReport(report)}>Download HTML report</button>
                  </div>
                </div>
              </div>

              <div className="filters" role="group" aria-label="Filter findings">
                {(['all', 'attention', 'pass', 'not_checked'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    className={filter === f ? 'active' : ''}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All findings' : STATUS_LABEL[f]}
                  </button>
                ))}
              </div>

              <div className="findings">
                {filtered.map((f) => (
                  <article key={f.id} className={`finding finding-${f.status}`}>
                    <div className="finding-top">
                      <h3>{f.title}</h3>
                      <span className="badge">{STATUS_LABEL[f.status]}</span>
                      <span className="badge muted">{f.severity} severity</span>
                      <span className="points">{f.points}/{f.maxPoints} pts</span>
                    </div>
                    <p><strong>What we found:</strong> {f.explanation}</p>
                    <p><strong>Why it matters:</strong> {f.whyItMatters}</p>
                    <p><strong>Evidence:</strong> <code>{f.evidence}</code></p>
                    <p><strong>Next step:</strong> {f.recommendation}</p>
                  </article>
                ))}
                {filtered.length === 0 && <p>No findings match this filter.</p>}
              </div>
            </div>
          </section>
        )}

        <section id="premium" className="premium">
          <div className="premium-inner">
            <p className="eyebrow">PREMIUM — COMING SOON, NOT FOR SALE YET</p>
            <h2>A deeper audit, when you need it.</h2>
            <p>
              Premium is a separate tier, not a recoloured free report. It adds a prioritized
              action plan with step-by-step fixes, extra technical checks (structured data,
              hreflang, anchor-text quality, duplicate headings, content length, and a
              sitemap check from robots.txt), and a branded downloadable report.
            </p>
            <p>
              Premium access is enforced on the Worker, not by hiding buttons here. Right now
              the premium endpoint returns 403 because payment and entitlements are not enabled.
              No checkout, no charge, and no premium access is granted from this page.
            </p>
            <button type="button" onClick={onPremium} disabled={checkingPremium}>
              {checkingPremium ? 'Checking…' : 'Check premium availability →'}
            </button>
            {premiumMsg && <p className="premium-msg" role="status">{premiumMsg}</p>}
            <p className="premium-contact">
              Interested in Premium when it launches? Email{' '}
              <a href="mailto:info@kluzar.com">info@kluzar.com</a> — no account is created here.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <p><strong>Kluzar SEO</strong> — Your Business, Online &amp; Managed.</p>
          <p>
            Contact: <a href="mailto:info@kluzar.com">info@kluzar.com</a> · Support:{' '}
            <a href="mailto:support@kluzar.com">support@kluzar.com</a> · Phone:{' '}
            <a href="tel:+923285049744">+92 328 5049744</a> · Serving Worldwide
          </p>
          <p className="footer-note">
            Free audit only. Scores are Kluzar audit scores, not Google rankings. Private and
            local addresses are never fetched.
          </p>
        </div>
      </footer>
    </div>
  )
}
