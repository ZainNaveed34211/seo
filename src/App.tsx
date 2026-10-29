import { useEffect, useState } from 'react'
import { PACKS, PACKS_URL } from './limits'
import { checkPremium } from './api'
import type { AuditResponse } from './types'
import AuditTool from './tools/AuditTool'
import { ActionChecklist, LaunchChecklist, QualityTool } from './tools/Checklists'
import PreviewTool from './tools/PreviewTool'

type Tool = 'home' | 'audit' | 'action' | 'preview' | 'launch' | 'quality' | 'premium'

const NAV: { id: Tool; label: string; tier: string }[] = [
  { id: 'home', label: 'Home', tier: '' },
  { id: 'audit', label: 'Basic SEO Audit', tier: 'FREE' },
  { id: 'action', label: 'SEO Action Checklist', tier: 'FREE' },
  { id: 'preview', label: 'Search & Social Preview', tier: 'FREE' },
  { id: 'launch', label: 'Launch Checklist', tier: 'FREE' },
  { id: 'quality', label: 'Quality Checklist', tier: 'FREE' },
  { id: 'premium', label: 'Premium', tier: 'PREMIUM' },
]

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('kluzar-seo-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [tool, setTool] = useState<Tool>('home')
  const [report, setReport] = useState<AuditResponse | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)
  const [premiumMsg, setPremiumMsg] = useState('')
  const [checkingPremium, setCheckingPremium] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('kluzar-seo-theme', theme) } catch { /* ignore */ }
  }, [theme])

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

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <a className="brand" href="https://seo.kluzar.com/" aria-label="Kluzar SEO home" onClick={(e) => { e.preventDefault(); setTool('home') }}>
            <span className="brand-mark" aria-hidden="true">K</span>
            <span>KLUZAR</span>
            <span className="brand-sub">SEO</span>
          </a>
          <button type="button" className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label="SEO tools">
          {NAV.map((n) => (
            <button key={n.id} type="button" aria-current={tool === n.id ? 'page' : undefined} className={tool === n.id ? 'active' : ''} onClick={() => setTool(n.id)}>
              {n.label}{n.tier && <span className={`tier ${n.tier === 'FREE' ? 'free' : 'premium'}`}>{n.tier}</span>}
            </button>
          ))}
          <p className="sidebar-note">All five tools are in this product. Starter limits are shown on each tool. Premium features are LOCKED until entitlements exist — they are never unlocked by this page.</p>
        </nav>

        <main className="main">
          {tool === 'home' && (
            <div className="tool">
              <p className="eyebrow">KLUZAR SEO · FIVE TOOLS, ONE PRODUCT</p>
              <h1>Check your page.<br />Fix what matters.</h1>
              <p className="hero-copy">Five separate tools, each with its own screen. Start with a Basic Audit — the other tools build on its real evidence. We never invent rankings, traffic, backlinks, indexing status, or Core Web Vitals that were not checked.</p>
              <div className="tool-cards">
                <button type="button" onClick={() => setTool('audit')}><strong>Basic SEO Audit</strong><span className="tier free">FREE</span><span>Real evidence-based report for one public page.</span></button>
                <button type="button" onClick={() => setTool('action')}><strong>SEO Action Checklist</strong><span className="tier free">FREE</span><span>Audit findings turned into tickable tasks, saved in this browser only.</span></button>
                <button type="button" onClick={() => setTool('preview')}><strong>Search &amp; Social Preview</strong><span className="tier free">FREE</span><span>Edit title and description locally and see a simulated preview.</span></button>
                <button type="button" onClick={() => setTool('launch')}><strong>Website Launch Checklist</strong><span className="tier free">FREE</span><span>Automatic checks plus manual reminders for Analytics and Search Console.</span></button>
                <button type="button" onClick={() => setTool('quality')}><strong>Website Quality Checklist</strong><span className="tier free">FREE</span><span>Technical and usability signals from the audit, with limits stated.</span></button>
              </div>
              <section id="packs" className="packs">
                <h2>Packs — Premium is a tier, not a separate product</h2>
                <p>Premium features are included in eligible Kluzar paid packs when entitlements are enabled. No prices are shown here because no price has been set for this product, and no payment is taken on this page.</p>
                <div className="pack-cards">
                  {PACKS.map((p) => (
                    <div key={p.name} className="pack-card">
                      <h3>{p.name}</h3>
                      <p className="pack-billing">{p.billing}</p>
                      <p>{p.note}</p>
                    </div>
                  ))}
                </div>
                {PACKS_URL ? <p><a href={PACKS_URL}>Go to pack selection →</a></p> : <p className="help">Pack selection is not live yet. The destination subdomain has not been configured, so no payment link is shown here.</p>}
                <button type="button" onClick={onPremium} disabled={checkingPremium}>{checkingPremium ? 'Checking…' : 'Check premium availability →'}</button>
                {premiumMsg && <p className="premium-msg" role="status">{premiumMsg}</p>}
                <p className="help">Questions? Email <a href="mailto:info@kluzar.com">info@kluzar.com</a> or <a href="mailto:support@kluzar.com">support@kluzar.com</a>. No account is created here.</p>
              </section>
            </div>
          )}
          {tool === 'audit' && <AuditTool onReport={setReport} />}
          {tool === 'action' && <ActionChecklist report={report} />}
          {tool === 'preview' && <PreviewTool report={report} />}
          {tool === 'launch' && <LaunchChecklist report={report} />}
          {tool === 'quality' && <QualityTool report={report} />}
          {tool === 'premium' && (
            <div className="tool">
              <h2>Premium</h2>
              <p className="tool-intro">Premium is a feature tier included in the Growth and Max packs — not a separate fixed-price product, and not for sale from this page yet.</p>
              <ul>
                <li><strong>Full broken-link scan</strong> — LOCKED, planned only. Starter checks up to 5 internal links.</li>
                <li><strong>Premium audit findings</strong> — LOCKED, server-gated (403). Structured data, hreflang, anchor-text quality, duplicate headings, word count, sitemap-from-robots.</li>
                <li><strong>Branded downloadable report</strong> — LOCKED, planned only. The free JSON/HTML downloads are not the branded report.</li>
                <li><strong>Multi-page quality scan</strong> — LOCKED, planned only. The Quality tool in this release covers one audited page.</li>
              </ul>
              <p>Security: hiding these items in the UI would not grant access. A protected Worker endpoint must verify entitlement server-side. Today there is no authentication system or entitlement database, so premium stays 403 and no payment is simulated.</p>
              {PACKS_URL ? <p><a href={PACKS_URL}>Go to pack selection →</a></p> : <p className="help">Pack selection is not live yet — no payment link is shown.</p>}
              <button type="button" onClick={onPremium} disabled={checkingPremium}>{checkingPremium ? 'Checking…' : 'Check premium availability →'}</button>
              {premiumMsg && <p className="premium-msg" role="status">{premiumMsg}</p>}
            </div>
          )}
        </main>
      </div>

      <footer className="footer">
        <div className="footer-inner">
          <p><strong>Kluzar SEO</strong> — Your Business, Online &amp; Managed.</p>
          <p>Contact: <a href="mailto:info@kluzar.com">info@kluzar.com</a> · Support: <a href="mailto:support@kluzar.com">support@kluzar.com</a> · Phone: <a href="tel:+923285049744">+92 328 5049744</a> · Serving Worldwide</p>
          <p className="footer-note">Free audit only. Scores are Kluzar audit scores, not Google rankings. Private and local addresses are never fetched. This is a JavaScript-rendered single-page app on GitHub Pages — see the README for indexing limitations.</p>
        </div>
      </footer>
    </div>
  )
}
