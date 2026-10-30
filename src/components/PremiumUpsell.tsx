import { PREMIUM_RETURN_URL } from '../lib/account'

// Premium upsell, shown wherever a feature is Premium-gated: the free
// scan covers one page, and this card names exactly what Premium
// unlocks. The button carries ?return= so the payments page sends
// the user back to seo.kluzar.com after checkout.
export default function PremiumUpsell() {
  return (
    <section className="card premium-upsell">
      <div className="premium-upsell-head">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h3>Get Premium to unlock full potential</h3>
      </div>
      <p className="muted">
        The free scan checks one page. Premium unlocks the full service:
      </p>
      <ul className="plain-list">
        <li><strong>Premium SEO audit</strong> — word count, structured data, hreflang, sitemap detail, duplicate headings, anchor text</li>
        <li><strong>Full multi-page quality scan</strong> — every page on the site, not just one</li>
        <li><strong>Branded report</strong> — a report you can share with clients</li>
      </ul>
      <a href={PREMIUM_RETURN_URL} className="btn-primary">Get Premium</a>
      <p className="muted small">After checkout, you return to seo.kluzar.com.</p>
    </section>
  )
}
