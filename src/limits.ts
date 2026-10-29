// CENTRAL STARTER / PREMIUM LIMITS — single source of truth for the UI.
// Starter = free tier, useful but limited. Premium = included in eligible
// Kluzar paid packs (Growth and Max), NOT a separate fixed-price product.
// No prices are defined here: prices live in the future pack-selection
// service, never in this code. Changing a limit here changes every label
// and gate in the UI, so limits are never scattered across components.
//
// Enforcement note (read this before changing anything): these limits are
// UI labels only. They do NOT grant access. Any protected Worker endpoint
// must verify entitlement server-side (see worker/src/entitlements.ts).
// Hiding a button, or a localStorage flag, is never proof of payment.

export type Tier = 'free' | 'premium'

// PREMIUM DESTINATION — single configuration setting, never a pricing
// table on the SEO page. CONFIRMED by the owner 2026-10-29:
//   https://payments.kluzar.com — plans, options and payments all live
//   there, not on this page. VITE_PREMIUM_URL only overrides it if set.
// No prices are defined here: plans live on the payment subdomain and
// are never displayed on the SEO page.
export const PREMIUM_DESTINATION_URL =
  ((import.meta.env.VITE_PREMIUM_URL as string | undefined)
    ?? 'https://payments.kluzar.com').replace(/\/$/, '')

export const LIMITS = {
  // Basic Audit (free): one page, scored findings, bounded broken-link check.
  auditBrokenLinksChecked: 5,
  auditBrokenLinksFull: 'premium' as Tier,
  // Action Checklist: full task list from audit findings, local only.
  actionChecklist: 'free' as Tier,
  // Preview: unlimited local previews (no server work, no account).
  preview: 'free' as Tier,
  // Launch Checklist: manual tasks free; robots/sitemap auto-check free
  // (it is a small, bounded public fetch, not a paid feature).
  launchAutoCheck: 'free' as Tier,
  // Quality: derived checks free; full multi-page quality scan is premium
  // and PLANNED ONLY — it does not exist as an endpoint in this release.
  qualityDerived: 'free' as Tier,
  qualityMultiPage: 'premium' as Tier,
  // Premium audit findings (structured data, hreflang, anchor quality,
  // duplicate headings, word count, sitemap-from-robots): server-gated,
  // 403 in this release. Described, never labelled operational.
  premiumAudit: 'premium' as Tier,
  brandedReport: 'premium' as Tier,
} as const

export function tierLabel(tier: Tier): 'FREE' | 'PREMIUM' {
  return tier === 'free' ? 'FREE' : 'PREMIUM'
}
