import { LOGO_URL, LOGO_DARK_URL } from '../logoData'
import { ACCOUNT_LOGIN_URL, PREMIUM_RETURN_URL } from '../lib/account'
import type { Finding } from '../lib/types'

export function Header(props: {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  planLabel: string
  // Premium users never see the Get Premium link: the server already
  // confirmed their entitlement, so upselling them would be wrong.
  isPremium: boolean
}) {
  const { theme, onToggleTheme, planLabel, isPremium } = props
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()} aria-label="Kluzar SEO home">
          <img src={theme === 'dark' ? LOGO_DARK_URL : LOGO_URL} alt="Kluzar SEO" className="brand-logo" />
        </a>
        <nav className="header-nav" aria-label="Main">
          <a href="#" onClick={(e) => e.preventDefault()} className="nav-link active">Home</a>
          {!isPremium && <a href={PREMIUM_RETURN_URL} className="nav-link">Get Premium</a>}
          <a href="https://support.kluzar.com/" className="nav-link">Support</a>
        </nav>
        <div className="header-actions">
          <span className={isPremium ? 'plan-pill premium' : 'plan-pill'} title="Your current plan">{planLabel}</span>
          <a href={ACCOUNT_LOGIN_URL} className="icon-btn" aria-label="Account — sign in or sign up" title="Account">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          </a>
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Theme">
            {theme === 'dark' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}

export function ScoreRing(props: { pct: number; label: string }) {
  const { pct, label } = props
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="score-ring" role="img" aria-label={`SEO score ${pct} out of 100`}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} className="ring-bg" />
        <circle
          cx="70"
          cy="70"
          r={r}
          className="ring-fg"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="ring-text">
        <strong>{pct}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

export function StatusDot(props: { status: Finding['status'] }) {
  const { status } = props
  const text = status === 'pass' ? 'Good' : status === 'attention' ? 'Needs work' : 'Not checked'
  return <span className={`status-dot status-${status}`}>{text}</span>
}

export function SeverityTag(props: { severity: Finding['severity'] }) {
  const { severity } = props
  const text = severity === 'high' ? 'High' : severity === 'medium' ? 'Medium' : severity === 'info' ? 'Info' : 'Low'
  return <span className={`sev sev-${severity}`}>{text}</span>
}

// Premium-only action label, derived from the finding's EXISTING status
// and severity — it adds no data and changes no finding. Display rule,
// stated plainly: a passed check needs nothing; an unchecked item has no
// action yet; a high-severity attention item is a correction ("Change
// this"); any other attention item is a task ("Do this").
export function actionLabelFor(f: Finding): { text: string; kind: 'none' | 'do' | 'change' | 'unknown' } {
  if (f.status === 'pass') return { text: 'No action', kind: 'none' }
  if (f.status === 'not_checked') return { text: 'Not checked', kind: 'unknown' }
  if (f.severity === 'high') return { text: 'Change this', kind: 'change' }
  return { text: 'Do this', kind: 'do' }
}

export function ActionLabel(props: { finding: Finding }) {
  const { text, kind } = actionLabelFor(props.finding)
  return <span className={`action-label action-${kind}`}>{text}</span>
}

export function FindingCard(props: { finding: Finding; showWhy?: boolean; isPremium?: boolean }) {
  const { finding: f, showWhy, isPremium } = props
  return (
    <article className="finding-card">
      <div className="finding-head">
        <h3>{f.title}</h3>
        <StatusDot status={f.status} />
      </div>
      <p className="finding-text">{f.explanation}</p>
      {f.evidence && <p className="finding-evidence">{f.evidence}</p>}
      {showWhy && f.whyItMatters && (
        <p className="finding-why"><strong>Why it matters:</strong> {f.whyItMatters}</p>
      )}
      <p className="finding-fix"><strong>What to do:</strong> {f.recommendation}</p>
      {f.maxPoints > 0 && (
        <p className="finding-points">{f.points} / {f.maxPoints} points · <SeverityTag severity={f.severity} />{isPremium && (<> · <ActionLabel finding={f} /></>)}</p>
      )}
      {f.maxPoints === 0 && (
        <p className="finding-points"><SeverityTag severity={f.severity} />{isPremium && (<> · <ActionLabel finding={f} /></>)}</p>
      )}
    </article>
  )
}
