// ACCOUNT & PLAN — navigation destinations are confirmed, but there is NO
// session integration configured for this page yet, so the plan shown is
// Starter (Free) unless a real session endpoint is configured at build
// time. A login link, a localStorage flag, or a frontend value is NEVER
// proof of a paid plan — only a trusted backend response is.
//   - Login / signup destination: https://accounts.kluzar.com
//   - Premium / payment destination: https://payments.kluzar.com
//     (plans, options and payments live there, never on this page, and
//     no prices are shown here.)
// If VITE_AUTH_SESSION_URL is ever set, it must point at a real session
// endpoint returning { authenticated: boolean, plan?: string }.
// Build-time values: an explicitly set variable wins, but an EMPTY value
// (what GitHub Actions passes for an unset repository variable) counts as
// unset — otherwise a link silently becomes href="" and looks dead.
function envVal(v: string | undefined): string {
  return v && v.trim() ? v.trim().replace(/\/$/, '') : ''
}
export const LOGIN_URL = envVal(import.meta.env.VITE_LOGIN_URL as string | undefined)
  || envVal(import.meta.env.VITE_AUTH_URL as string | undefined)
  || 'https://accounts.kluzar.com'
export const PREMIUM_URL = envVal(import.meta.env.VITE_PREMIUM_URL as string | undefined)
  || 'https://payments.kluzar.com'

// Get Premium links from SEO carry the return destination: after a
// completed payment, the payments page sends the user back here.
// The payments page validates ?return= the same way (https Kluzar
// subdomains only, never payments itself), so an unknown or invalid
// value simply shows no back link and changes nothing else.
export const PREMIUM_RETURN_URL = `${PREMIUM_URL}/?return=${encodeURIComponent('https://seo.kluzar.com/')}`
export const SESSION_URL = envVal(import.meta.env.VITE_AUTH_SESSION_URL as string | undefined)
  || 'https://account-api.kluzar.com/auth'
// SESSION_URL is the auth base (public configuration, never a secret):
// checkAccountStatus appends /session, so the real endpoint called is
// GET https://account-api.kluzar.com/auth/session. A repo variable, when
// set, wins over this canonical default. The accounts Worker only
// answers this call for origins in its ALLOWED_ORIGINS variable, so
// every Kluzar subdomain that fetches the plan must be listed there.

// Account entry point for first-time users: sign in / sign up, then come
// back to this SEO subdomain. The accounts app honours ?next= only for
// https Kluzar subdomains (never accounts itself, never another host),
// so an unknown or invalid value simply lands on the accounts dashboard.
export const ACCOUNT_LOGIN_URL = `${LOGIN_URL}/login/?next=${encodeURIComponent('https://seo.kluzar.com/')}`

export interface AccountState {
  authenticated: boolean
  planLabel: string
  detail: string
  // True ONLY when the server's entitlement says so (plan growth/max
  // with active status). Never derived from a client flag, a URL, or
  // storage — a forged value can at most change this display locally,
  // it can never make the server return premium data.
  premium: boolean
}

// Display labels come from the server's plan value only. Unknown or
// missing values fail closed to Free — premium is never displayed
// without server proof.
function planLabelFor(plan: unknown): string {
  if (plan === 'growth') return 'Growth'
  if (plan === 'max') return 'Max'
  return 'Free'
}

export async function checkAccountStatus(): Promise<AccountState> {
  if (!SESSION_URL) {
    return {
      authenticated: false,
      planLabel: 'Free',
      detail: 'Starter (Free) — no account needed for a basic scan.',
      premium: false,
    }
  }
  try {
    const res = await fetch(`${SESSION_URL}/session`, { credentials: 'include' })
    const session = (await res.json().catch(() => null)) as {
      authenticated?: unknown
      entitlement?: { plan?: unknown; status?: unknown; premium?: unknown } | null
    } | null
    if (!res.ok || !session || session.authenticated !== true) {
      return {
        authenticated: false,
        planLabel: 'Free',
        detail: 'We could not sign you in. You are using Starter (Free).',
        premium: false,
      }
    }
    const entitlement = session.entitlement
    const premium = entitlement?.premium === true
      && (entitlement?.plan === 'growth' || entitlement?.plan === 'max')
      && entitlement?.status === 'active'
    const label = planLabelFor(entitlement?.plan)
    return {
      authenticated: true,
      planLabel: premium ? label : 'Free',
      detail: premium ? `Signed in — ${label} plan.` : 'Signed in — Starter (Free).',
      premium,
    }
  } catch {
    return {
      authenticated: false,
      planLabel: 'Free',
      detail: 'We could not sign you in. You are using Starter (Free).',
      premium: false,
    }
  }
}
