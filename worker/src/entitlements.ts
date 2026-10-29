// PREMIUM ENTITLEMENTS — server-side only, never frontend-only hiding.
//
// Current release (v1): premium is NOT enabled for any caller. There is no
// token, no demo bypass, and no test token in production code. The premium
// endpoints return 403 with PREMIUM_NOT_ENABLED, and premium findings are
// stripped from every free response.
//
// Future payment integration (see PAYMENT_HANDOFF.md) must:
//  1. Verify a payment provider event server-side (signature + API lookup),
//     never trust a browser redirect.
//  2. Write an entitlement record to the smallest suitable store — proposed
//     Cloudflare D1 table (no database is created in this release):
//       entitlements(id TEXT PRIMARY KEY, customer_email_hash TEXT NOT NULL,
//                    plan TEXT NOT NULL, expires_at INTEGER NOT NULL,
//                    created_at INTEGER NOT NULL)
//     Store only a hash of the customer identifier, never card details.
//  3. Issue a short-lived, random entitlement token to the customer and
//     check it here, hashed, against that table (or KV, if D1 is not used).
//  4. Handle duplicate webhook events idempotently (same event id = same
//     outcome, no double grant) and refunds by expiring the entitlement.
//
// Until steps 1–3 are implemented and tested, this function must stay false.
//
// v2 — documented entitlement interface (NOT implemented, NOT used to
// grant access). When a real entitlement store exists, a verified caller
// would be represented as Entitlement below, and isPremiumEntitled would
// check a hashed token against that store. Packs in the UI are:
// Starter (Free), Growth (Paid), Max (Paid). Premium = Growth or Max with
// a current, unexpired entitlement. No price is defined in this file.
export type PremiumPlan = 'growth' | 'max'

export interface Entitlement {
  plan: PremiumPlan
  expiresAt: number // Unix seconds; expired = not entitled, no grace period
  customerHash: string // hash only, never an email or payment identifier
}

export function isEntitlementCurrent(e: Entitlement, nowSec: number): boolean {
  return e.expiresAt > nowSec
}

export interface EntitlementEnv {
  PREMIUM_ENABLED?: string
}

export function isPremiumEntitled(_request: Request, _env: EntitlementEnv): boolean {
  // Deliberately always false in v1. Changing this requires the payment
  // verification + entitlement store above, plus a security review.
  void _request
  void _env
  return false
}

export const PREMIUM_NOT_ENABLED = {
  error: 'Premium audit is not enabled yet. Payment is a separate future integration.',
  code: 'PREMIUM_NOT_ENABLED',
  available: false,
} as const
