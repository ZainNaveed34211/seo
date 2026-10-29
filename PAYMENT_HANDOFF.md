# Payment integration handoff — READ THIS BEFORE CHOOSING A PROVIDER

## The application is ready for payment setup. Here are the exact steps and credentials needed.

That statement means: the free audit works, the premium architecture is
complete, and premium is correctly disabled — it does **not** mean payment
is implemented. No checkout, no live billing, no paid subscription, and no
cost has been created in this release. Do not enable live checkout until
the steps below are done, in order, with your explicit approval for each
provider and for live mode.

## 1. First decision: which provider can actually pay you?

**Do not assume Stripe.** As of checks in October 2026, Stripe does not
list Pakistan as a supported country for a Pakistan-registered business,
and PayPal does not support receiving money into a Pakistani account.
Those lists change, so re-check the provider's own official
supported-countries page on the day you sign up — do not rely on this file
alone, and do not rely on a blog post.

Candidates to check first, in this order, because they are merchant-of-
record (MoR) platforms that sell in their own name and handle sales tax:

1. **Paddle** — markets a Pakistan page and is not reported as excluding
   Pakistan from its unsupported-countries list. Payouts are reported as
   wire or Payoneer, monthly, with a minimum threshold. Verify on
   paddle.com: supported countries, payout methods/minimums, fees, and
   whether your business type is accepted.
2. **Lemon Squeezy** — reported as listing Pakistan among countries for
   bank payouts, with PayPal payouts offered separately. Verify on
   lemonsqueezy.com: current country list, payout methods/minimums, fees,
   and its migration to Stripe Managed Payments (which has its own
   country restrictions — check that list too before building around it).
3. **Creem / Dodo Payments / Polar** — reported as onboarding individuals
   in Pakistan in 2026 comparisons. Verify each one's official supported-
   merchant-countries page, payout method (bank vs Payoneer vs crypto),
   and any restriction on business vs personal bank accounts before
   choosing one.
4. **Stripe, only via a company in a supported country** (for example a
   US LLC or UK limited company) — this is a legal/tax decision, not a
   workaround. It needs proper company formation, a bank account in that
   country, and tax advice for both countries. Do not open a Stripe
   account with Pakistani details and hope it passes review.
5. **PayPal, for receiving** — not a viable primary checkout for a
   Pakistan-based business as of October 2026 checks. Do not build
   premium checkout on PayPal receiving unless PayPal's own country page
   has changed by the time you read this.

**Fees:** do not trust a fee number in this file. Comparison articles in
October 2026 reported around 5% + $0.50 per transaction for Paddle and
Lemon Squeezy, versus Stripe's lower card rate — but MoR fees, currency
conversion, and payout fees change. Read the provider's own pricing page
on the day you sign up and record the exact fee here before going live.

## 2. What merchant account / approval you must create or get approved

- A merchant account with the chosen MoR provider (business or individual
  onboarding, as that provider requires — some MoRs onboard individuals,
  some require a registered business; check before you apply).
- Identity verification (passport/CNIC or company documents, as required).
- A payout destination in your own name: bank account and/or Payoneer, as
  that provider supports. A name mismatch between your identity documents
  and your payout account is a common reason payouts bounce — match them
  exactly.
- Tax information as the provider requests (for an MoR, the MoR normally
  handles customer sales tax/VAT; you still declare your own income in
  Pakistan — check with a tax adviser, this file is not tax advice).
- No Kluzar code change is needed to apply — apply on the provider's site,
  in test/sandbox mode first.

## 3. What you must configure in the provider dashboard

- Create **one product** for Premium SEO Audit (one-time purchase first;
  subscriptions only if you later decide Premium is recurring — do not
  create a subscription until you have decided the billing model).
- Set the price in the provider dashboard, not in Kluzar code. Prices in
  code would be a second source of truth and a bug waiting to happen.
- Create a **webhook endpoint** pointing at the Worker, for example:
  `POST https://seo-api.kluzar.com/api/payment-webhook`
  (the Worker route does not exist yet — it is built in step 5, and the
  hostname for payment itself is a separate decision: do not create DNS
  for a payment subdomain until you have approved it in the payment phase).
- Subscribe the webhook to, at minimum: payment succeeded, payment
  refunded, and (for subscriptions, if used) subscription cancelled/expired.
- Copy the provider's **webhook signing secret** — this is a secret, see §4.
- Enable **test mode** and keep live mode off until step 7 passes.

## 4. Worker secrets and environment variables required (future only)

Set these with `wrangler secret put <NAME>` — never commit them, never
put them in `VITE_*` variables (those are public in the Pages bundle):

- `PAYMENT_PROVIDER_WEBHOOK_SECRET` — verifies webhook signatures.
- `PREMIUM_SIGNING_KEY` — signs the short-lived premium entitlement token
  issued after a verified payment.
- `PAYMENT_PROVIDER_API_KEY` (secret, if the chosen provider needs an API
  lookup to confirm a payment — prefer webhook signature + API lookup
  together, not a redirect alone).

Public (non-secret) configuration for the payment phase, set as Worker
plain variables or in code after review:
- Provider name, product/price IDs, and the premium plan definition
  (what Premium includes, and for how long — one-time vs subscription).

## 5. How checkout, verification, entitlements, refunds, and duplicates will work

This is the design the Worker code already anticipates in
`worker/src/entitlements.ts` (currently always 403 — that function is the
exact place this logic goes, and nothing else needs rebuilding):

1. Customer clicks Premium → provider-hosted checkout (card details never
   touch Kluzar servers or GitHub Pages).
2. Provider sends a webhook to the Worker. The Worker verifies the
   signature with `PAYMENT_PROVIDER_WEBHOOK_SECRET`, then confirms the
   payment via the provider API. **A browser redirect to a success page is
   never proof of payment** — success pages are for display only.
3. On verified success, the Worker writes an entitlement record to the
   smallest suitable store (proposed D1 table, no database exists yet):
   `entitlements(id, customer_email_hash, plan, expires_at, created_at)`.
   Only a hash of the customer identifier is stored — never card details.
4. The Worker issues a short-lived entitlement token (signed with
   `PREMIUM_SIGNING_KEY`) to the customer. Premium endpoints check that
   token, hashed, against the entitlement table, and check expiry.
5. **Duplicate webhooks:** the same provider event ID must produce the
   same outcome once (idempotency key = event ID). A duplicate must not
   extend expiry twice or create a second entitlement.
6. **Refunds:** a verified refund webhook expires the entitlement
   immediately. A refunded customer must get 403 again on the next
   premium call.
7. **Expiry:** a one-time purchase expires at the date you set in the
   product definition; a subscription expires when the provider says it
   ended. Expired tokens are rejected, not renewed automatically.

## 6. How to test payments safely before enabling live checkout

1. Stay in the provider's test/sandbox mode. Use the provider's test cards
   only — never a real card in test mode, and never a test card in live mode.
2. Complete a test purchase, then check: webhook received, signature
   verified, entitlement written, premium endpoint returns 200 with
   premium findings, and the branded report download works.
3. Send the same webhook twice — premium must not double-extend.
4. Issue a test refund — premium must return 403 afterwards.
5. Let a test entitlement expire — premium must return 403 afterwards.
6. Try premium with no token, a forged token, and an expired token — all
   must return 403, with no premium data in the response body.
7. Only after 1–6 pass, with your explicit approval, switch the provider
   to live mode, make one small real purchase yourself, refund it, and
   confirm steps 2–6 again in live mode before telling customers Premium
   is for sale.

## 7. What is NOT decided yet (do not assume these)

- Final payment hostname / subdomain (a dedicated payment subdomain or
  service endpoint is a payment-phase decision — no DNS was created here).
- Whether Premium is one-time or a subscription.
- The Premium price (set in the provider dashboard, not in code).
- The provider itself (see §1 — re-check official pages on the day).
- Any cost beyond the provider's own fees (Cloudflare Workers free tier
  covers the audit at v1 scale; check Workers pricing if volume grows).

## Next step, in one line

Choose a provider from §1 by checking its official supported-countries,
payout, and pricing pages, tell Muse which provider you chose, and then
Muse will implement the webhook + entitlement Worker code, the D1 design,
and the test plan in §6 — still without enabling live checkout until you
approve it separately.
