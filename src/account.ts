// ACCOUNT & SUBSCRIPTION — future-ready integration interface, NOT a
// login system. There is no authentication backend in this phase, no
// database, no session cookie, and no token handling in this file.
//
// Architecture (what will happen when an integration IS configured):
//   1. On load, check whether a real session integration is configured
//      (AUTH_URL set). If not, the user is Starter/Free immediately —
//      no forced login, no fake loading spinner, no invented session.
//   2. If AUTH_URL is set, the app attempts to load the session from that
//      destination's session endpoint (contract to be confirmed with the
//      provider; see below). Any failure -> "unverified", Starter only.
//   3. If authenticated, premium entitlement is verified ONLY by a trusted
//      backend response (the Worker's premium endpoint). A frontend flag,
//      localStorage value, or login redirect is never proof of payment.
//   4. If authenticated but not entitled, Starter continues + locked states.
//   5. If status cannot be verified, NEVER assume paid — Starter only.
//
// Current phase reality (read before changing anything):
//   - AUTH_URL is empty by default, so every user is Starter/Free and the
//     Login button explains that login is not live yet. That is honest,
//     not a bug.
//   - The Worker premium endpoint returns 403 for every caller in this
//     release, so even a future "premium" account state cannot unlock
//     premium features that do not exist yet (full broken-link scan,
//     branded report, multi-page scan are planned, not operational).
//     A verified premium state therefore shows "entitlement verified,
//     features still planned" — never "premium unlocked" for a feature
//     that has no endpoint.

export type AccountState =
  | { kind: 'starter'; authenticated: false; premium: false; detail: string }
  | { kind: 'loading'; authenticated: false; premium: false; detail: string }
  | { kind: 'authenticated-starter'; authenticated: true; premium: false; detail: string }
  | { kind: 'premium'; authenticated: true; premium: true; detail: string }
  | { kind: 'unverified'; authenticated: false; premium: false; detail: string }

// Configurable future authentication destination. Set VITE_AUTH_URL to
// the real login/session destination when it is confirmed. Do NOT hardcode
// an unconfirmed URL here. While empty, login is not live.
export const AUTH_URL = (import.meta.env.VITE_AUTH_URL as string | undefined)?.replace(/\/$/, '') ?? ''

// Session endpoint contract (to be confirmed with the auth provider):
//   GET {AUTH_URL}/session, credentials included, JSON response shaped as
//   { authenticated: boolean, plan?: 'growth' | 'max' | string }.
// This function does NOT invent a session when the contract is unconfirmed:
// if AUTH_URL is empty it returns Starter immediately without a network call.
export async function checkAccountStatus(
  checkPremiumFn: () => Promise<{ available: boolean; reason: string }>,
): Promise<AccountState> {
  if (!AUTH_URL) {
    return {
      kind: 'starter',
      authenticated: false,
      premium: false,
      detail: 'You are using Starter (Free) without logging in.',
    }
  }
  // A real integration is configured: show a loading state while verifying.
  // Any network or contract failure fails safe to Starter, never to paid.
  let session: { authenticated?: unknown } | null = null
  try {
    const res = await fetch(`${AUTH_URL}/session`, { credentials: 'include' })
    session = (await res.json().catch(() => null)) as { authenticated?: unknown } | null
    if (!res.ok || !session || session.authenticated !== true) {
      return {
        kind: 'starter',
        authenticated: false,
        premium: false,
        detail: 'We could not sign you in. You are using Starter (Free) without logging in.',
      }
    }
  } catch {
    return {
      kind: 'unverified',
      authenticated: false,
      premium: false,
      detail: 'We could not verify your account right now. Only Starter features are available.',
    }
  }
  // Authenticated: verify entitlement from the trusted backend only.
  try {
    const premium = await checkPremiumFn()
    if (premium.available) {
      return {
        kind: 'premium',
        authenticated: true,
        premium: true,
        detail: 'Your Premium account is confirmed. Some Premium features are still being built and will unlock when they are ready.',
      }
    }
  } catch {
    return {
      kind: 'unverified',
      authenticated: false,
      premium: false,
      detail: 'We could not fully verify your account. Only Starter features are available.',
    }
  }
  return {
    kind: 'authenticated-starter',
    authenticated: true,
    premium: false,
    detail: 'You are signed in, but you do not have Premium yet. Starter features are available and Premium features are locked.',
  }
}
