# Cloudflare Worker setup — kluzar-seo-audit

This Worker is **new and independent**. It must not replace or overwrite any
existing Worker. Its name is `kluzar-seo-audit`, set in
`worker/wrangler.toml`. If a Worker with that name already exists in your
account and it is not this SEO Worker, stop and rename it here first.

## 1. What the Worker is

- Entry point: `worker/src/index.ts`
- Configuration: `worker/wrangler.toml` (`compatibility_date = "2024-06-20"`,
  `nodejs_compat` flag, no bindings in v1)
- Routes / API:
  - `GET /api/health` — `{ ok: true, service: "kluzar-seo-audit", version: "1" }`
  - `POST /api/audit` — JSON `{ url: "https://example.com/" }` →
    audit response (see `README.md` for the finding shape)
  - `POST /api/premium-audit` — always `403 PREMIUM_NOT_ENABLED` in v1
  - `OPTIONS *` — CORS preflight for allowed origins only
- No database, no KV, no R2, no secrets are required for the free audit.

## 2. Create and deploy the Worker (exact steps)

You need: a Cloudflare account with Wrangler access, and Node 20+ locally.
You do **not** need to create DNS records for the Worker itself — a
`*.workers.dev` URL is assigned on first deploy. Do not create a custom
Worker route on `seo.kluzar.com` — that hostname is GitHub Pages, and a
Worker route there would conflict with Pages.

```bash
cd worker
npm install

# First time only: sign in to Cloudflare in the browser.
npx wrangler login

# Check the configuration without deploying:
npx wrangler deploy --dry-run

# Deploy (creates/updates ONLY kluzar-seo-audit):
npx wrangler deploy
```

After deploy, Wrangler prints the Worker URL, for example:
`https://seo-api.kluzar.com`
Copy that exact URL — it is the `VITE_WORKER_URL` for the frontend build.

Local development (no deploy, no login required for `--local`):

```bash
cd worker
npm run dev        # wrangler dev --local on http://localhost:8787
```

## 3. Frontend configuration

- **Build-time public variable only:** `VITE_WORKER_URL`
  - GitHub Actions: set the repository variable `VITE_WORKER_URL` to the
    Worker URL above (Repo Settings → Variables). The workflow already
    passes it to `npm run build`.
  - Local preview of a production build: `VITE_WORKER_URL=http://localhost:8787 npm run build`
    then `npm run preview` — but that build is for local testing only.
    Never ship a build with a localhost Worker URL to Pages.
- **No secrets in the frontend.** GitHub Pages cannot store backend secrets.
  There are no frontend secrets in this project. If a future feature needs
  a private credential, it goes in the Worker (see §5), never in
  `VITE_*` variables, which are embedded in the public JavaScript bundle.

## 4. CORS configuration (already in code, no dashboard rule needed)

Allowed origins, enforced in `worker/src/index.ts`:
- `https://seo.kluzar.com` (production frontend)
- `http://localhost:*` and `http://127.0.0.1:*` (local development only)

Everything else gets no `Access-Control-Allow-Origin` header, so browsers
block the response. There is no wildcard. If you later serve the frontend
from another domain, add it in code and redeploy — do not set a wildcard,
and do not rely on CORS as an authentication mechanism. Premium security is
the server-side entitlement check, not the Origin header.

## 5. Environment variables and secrets

| Name | Type | Required in v1? | Notes |
| ---- | ---- | --------------- | ----- |
| `VITE_WORKER_URL` | Frontend build variable (public) | Yes, for live audits | Worker URL, not a secret |
| `ALLOWED_ORIGINS` | Worker plain variable (optional) | No | Not used to bypass the hardcoded rule; never set to `*` |
| `PAYMENT_PROVIDER_WEBHOOK_SECRET` | Worker secret | **No — future only** | Set with `wrangler secret put` when payment is configured (see `PAYMENT_HANDOFF.md`) |
| `PREMIUM_SIGNING_KEY` | Worker secret | **No — future only** | Same as above |

Never commit a secret to this repository. Worker secrets are set with:

```bash
cd worker
npx wrangler secret put PAYMENT_PROVIDER_WEBHOOK_SECRET   # future only, do not run yet
```

## 6. Verify the Worker is deployed and responding

```bash
# Health (no audit, no fetch):
curl https://<your-worker-url>/api/health
# Expected: {"ok":true,"service":"kluzar-seo-audit","version":"1"}

# Free audit, with the production Origin header:
curl -X POST https://<your-worker-url>/api/audit \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://seo.kluzar.com' \
  -d '{"url":"https://example.com/"}'
# Expected: HTTP 200, JSON with findings, score.max = 100, and
# Access-Control-Allow-Origin: https://seo.kluzar.com

# Private target must be blocked before any fetch:
curl -X POST https://<your-worker-url>/api/audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://127.0.0.1/admin"}'
# Expected: HTTP 400, code PRIVATE_TARGET

# Premium must be 403 in v1:
curl -X POST https://<your-worker-url>/api/premium-audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/"}'
# Expected: HTTP 403, code PREMIUM_NOT_ENABLED
```

## 7. Logs and common errors

```bash
cd worker
npx wrangler tail        # live logs for kluzar-seo-audit
```

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Frontend shows "Worker not configured" | `VITE_WORKER_URL` not set at build time | Set the repository variable and rebuild/redeploy Pages |
| Browser audit fails with a CORS error | Frontend origin is not `seo.kluzar.com` or localhost | Serve the frontend from `seo.kluzar.com`, or use localhost for dev |
| Audit returns `FETCH_FAILED` | Target is down, too slow (>10s), or blocked by the target | Try another public URL; check the target in a browser |
| Audit returns `TOO_LARGE` | Page HTML is over 1.5 MB | Expected behaviour — the limit protects the Worker |
| Audit returns `RATE_LIMITED` (429) | Over 10 audits / 10 minutes from one IP | Wait for the `Retry-After` period |
| `wrangler deploy` asks about an existing Worker | A Worker named `kluzar-seo-audit` already exists | Stop, check what it is in the dashboard, rename if it is not this project |
| Local `wrangler dev --local` cannot fetch a public page | This VM's egress proxy is not used by Miniflare's fetch | Known local-dev limitation (see §8); production Workers fetch directly |

## 8. Known local-dev limitation (honest, not a production bug)

In this development VM, `wrangler dev --local` (Miniflare) does not use the
VM's egress proxy, so a live audit through the local Worker returns
`FETCH_FAILED` for public pages, even though direct `curl` from the same VM
succeeds. The same handler code was verified end-to-end in Node (Vitest
integration test) with a real audit of `https://example.com/`, including
CORS, and that test passes. In production Cloudflare Workers, `fetch()`
goes direct and does not need a proxy. If you see `FETCH_FAILED` locally
but the integration test passes, do not "fix" it by weakening SSRF checks —
deploy the Worker and verify with the curl commands in §6.

## 9. Residual risks (do not ignore)

1. **DNS rebinding / resolved-IP SSRF.** Blocking is hostname/IP-literal
   based. Workers `fetch()` resolves DNS internally, so a hostname that
   resolves to a private IP after validation is not caught by this code.
   Follow-up option: resolve the hostname via DNS-over-HTTPS before fetch
   and reject private resolved IPs — this adds a third-party dependency and
   still has a time-of-check/time-of-use race, so it is a mitigation, not a
   proof. For a public-page audit tool, the current controls (private
   hostname/IP blocking, redirect re-validation, port restriction, timeout,
   size limit, rate limit) are the proportionate v1 controls.
2. **Rate limiting is per-isolate, not global.** A determined caller can
   spread requests across isolates. Add a Cloudflare dashboard rate-limiting
   rule for the Worker route (or a KV/Durable Object counter in a later
   release) as the global backstop. The in-memory limit still stops casual
   abuse and accidental loops.
3. **Target-site blocking.** Some sites block automated fetching (bot
   protection, robots.txt, or WAF rules). That is their choice — the audit
   will report `FETCH_FAILED` rather than bypassing it. Do not add a
   bypass, a headless browser, or a proxy rotation to get around it.
4. **No multi-page crawl in v1.** The free audit fetches one page only.
   Premium multi-page crawling is not implemented, and must only be added
   with bounded page counts, same-origin limits, and the same SSRF controls
   per page.

## v2 endpoints (additive, API contract still v1)

- `POST /api/launch-checks` — robots.txt + sitemap availability for the audited origin only. No Analytics/Search Console connection.
- `POST /api/audit` now also returns `brokenLinks` (up to 5 internal links, HEAD, 403/429/405/timeout = could-not-verify, never broken), `internalLinkCount`, `blankWithoutNoopener`, and 0-point informational findings (`https`, `security-headers`, `link-blank-noopener`). The /100 score is unchanged.
- Deploy v2 code to the EXISTING Worker named `kluzar-seo-audit` (wrangler deploy from `worker/`). That updates `https://seo-api.kluzar.com` too, because it is the same Worker. Do NOT create a Worker named `seo-api`.
