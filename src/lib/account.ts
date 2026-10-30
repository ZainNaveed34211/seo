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
export const SESSION_URL = envVal(import.meta.env.VITE_AUTH_SESSION_URL as string | undefined)

// Account entry point for first-time users: sign in / sign up, then come
// back to this SEO subdomain. The accounts app honours ?next= only for
// https Kluzar subdomains (never accounts itself, never another host),
// so an unknown or invalid value simply lands on the accounts dashboard.
export const ACCOUNT_LOGIN_URL = `${LOGIN_URL}/login/?next=${encodeURIComponent('https://seo.kluzar.com/')}`

export interface AccountState {
  authenticated: boolean
  planLabel: string
  detail: string
}

export async function checkAccountStatus(): Promise<AccountState> {
  if (!SESSION_URL) {
    return {
      authenticated: false,
      planLabel: 'Free',
      detail: 'Starter (Free) — no account needed for a basic scan.',
    }
  }
  try {
    const res = await fetch(`${SESSION_URL}/session`, { credentials: 'include' })
    const session = (await res.json().catch(() => null)) as { authenticated?: unknown; plan?: unknown } | null
    if (!res.ok || !session || session.authenticated !== true) {
      return {
        authenticated: false,
        planLabel: 'Free',
        detail: 'We could not sign you in. You are using Starter (Free).',
      }
    }
    const plan = typeof session.plan === 'string' && session.plan ? session.plan : 'Signed in'
    return {
      authenticated: true,
      planLabel: plan,
      detail: `Signed in — plan shown as reported by your account: ${plan}.`,
    }
  } catch {
    return {
      authenticated: false,
      planLabel: 'Free',
      detail: 'We could not verify your account right now. Only Starter features are available.',
    }
  }
}
