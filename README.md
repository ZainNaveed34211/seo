# Kluzar SEO

## v2 — five tools (branch only, not yet on main)

v2 rebuilds the product into five separate tools with separate screens: Basic SEO Audit, SEO Action Checklist, Search & Social Preview, Website Launch Checklist, and Website Quality Checklist. Starter limits are central in `src/limits.ts`. Premium is a tier in the Growth and Max packs (Starter is Free), with locked features described, never labelled operational, and no payment implemented. Premium endpoints stay 403 server-side.

**Worker (do not rename):** Cloudflare Worker name is `kluzar-seo-audit`. Its canonical public URL is `https://seo-api.kluzar.com` (a custom domain on that Worker, verified 2026-10-29). `https://seo-api.kluzar-official.workers.dev` does NOT exist (404). `https://kluzar-seo-audit.kluzar-official.workers.dev` is an alias to the same Worker. Frontend uses only the build variable `VITE_WORKER_URL` — set it to `https://seo-api.kluzar.com`.

**Favicon:** `public/favicon.svg` is a NEW lightweight SVG mark created for this SEO product. It is NOT claimed to be the official Kluzar logo file. The header uses a text wordmark, not a logo image.

**Indexing limitation (honest):** this is a JavaScript-rendered single-page app with state-based tool screens, not separate routes. The sitemap lists only `https://seo.kluzar.com/` because there are no public tool URLs to list. Search engines may render JS imperfectly, so tool screens are not guaranteed to be indexed as separate pages.

## v1 notes below (still accurate for the audit contract, except the Worker URL above)
 — seo.kluzar.com

A free, plain-English, page-level SEO audit. Frontend: React + TypeScript + Vite,
hosted on **GitHub Pages** (custom domain `seo.kluzar.com`, base `/`).
Backend: a **new, independent Cloudflare Worker** named `kluzar-seo-audit`
(see `worker/` and `WORKER_SETUP.md`). No database in v1. No payment in v1.

## What it does

- **Free audit** (`POST /api/audit`): title, meta description, H1, heading order,
  canonical, robots/noindex, image alt text, internal/external links, language,
  viewport, charset, and Open Graph basics. Every finding has a plain-English
  explanation, why it matters, actual evidence, a next step, a severity, and a
  Passed / Needs attention / Not checked status. Score is out of 100 with a
  transparent breakdown. No rankings, traffic, backlinks, indexing status, or
  performance measurements are invented.
- **Sample report**: clearly labelled demonstration data (reserved `.example`
  domain). It is never a live audit.
- **Premium**: architecture only in v1. The premium endpoint returns 403
  (`PREMIUM_NOT_ENABLED`) for every caller, and premium findings are stripped
  from free responses. See `PAYMENT_HANDOFF.md` — payment is a separate future
  phase, not implemented here.
- **Exports**: free JSON download and a free HTML report, generated from the
  audit response. The branded premium report is gated server-side and is not
  generated in v1.

## Mobile + performance focus

- Mobile-first CSS, 360–390px tested, no horizontal overflow, buttons at
  least 44px tall, form stacks on small screens.
- No webfonts (system fonts only), no images in the app bundle, no heavy
  logo file — the header is a text wordmark. Production bundle at v1:
  JS ~242 KB (~76 KB gzip), CSS ~6.3 KB.
- Worker does a single HTML fetch per free audit (no link crawling, no image
  fetching), with a 10-second timeout and a 1.5 MB size limit.
- The site itself (`seo.kluzar.com`) ships with title, description, canonical,
  Open Graph tags, `robots.txt`, and a one-URL `sitemap.xml`.

## Repository layout

```
index.html, vite.config.ts, package.json, tsconfig.json   # frontend (repo root)
src/            # React app: App, api client, types, sample report, styles
public/         # CNAME (seo.kluzar.com), robots.txt, sitemap.xml
worker/         # Cloudflare Worker: src/index.ts, security.ts, audit.ts, entitlements.ts
worker/test/    # Vitest: security, audit, entitlements, handler integration
.github/workflows/pages.yml   # GitHub Pages deploy, main branch only
WORKER_SETUP.md # exact Worker creation, wrangler, env, CORS, logs, troubleshooting
PAYMENT_HANDOFF.md  # future payment phase — read this before choosing a provider
```

## Commands

```bash
# Frontend (repo root)
npm install
npm run typecheck
npm run build          # production build into dist/ (base '/')
npm run preview        # preview dist/ locally

# Worker (worker/)
cd worker
npm install
npm run typecheck
npm test               # Vitest: 23 tests in v1, including a real public-page integration test
npm run dev            # wrangler dev --local on http://localhost:8787
```

Local frontend + Worker together: run the Worker with `npm run dev` in
`worker/`, then run `npm run dev` in the repo root — Vite proxies `/api` to
`http://localhost:8787`. For a production GitHub Pages build, set
`VITE_WORKER_URL` to the real Worker URL (see `WORKER_SETUP.md`); if it is
not set, live audits show a clear "Worker not configured" message and are
never faked.

## GitHub Pages configuration (manual, once)

1. Repo Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Repo Settings → Variables → New repository variable: `VITE_WORKER_URL`
   = your Worker URL, for example `https://seo-api.kluzar.com`.
   (The exact URL is shown after `wrangler deploy` — see `WORKER_SETUP.md`.)
3. Push to `main` (only with your authorization — this branch does not deploy).
   The workflow in `.github/workflows/pages.yml` builds and deploys `dist/`.
4. Keep `public/CNAME` as `seo.kluzar.com`. Do not change `vite.config.ts`
   `base` to `/seo/` — that is only for a subpath deployment, not a custom domain.

## Security summary (see WORKER_SETUP.md for residual risks)

- Only http/https, no credentials in URLs, no localhost/private/reserved
  hostnames or IPs, no non-standard ports, max 5 redirects (each re-validated),
  10s timeout, 1.5 MB limit, 10 audits / 10 minutes per IP (per-isolate,
  not global — a dashboard rate-limit rule is the global backstop).
- CORS: `https://seo.kluzar.com` + localhost/127.0.0.1 for local dev only.
  No wildcard, ever. CORS is not the premium boundary — the server-side
  entitlement check is.
- Scanned pages are parsed, never executed. Raw HTML is never returned to
  the browser. Errors are generic; no stack traces or secrets leak.
- Residual risks, stated honestly: hostname-based SSRF blocking does not
  prove the DNS resolution (Workers fetch resolves DNS internally), and the
  in-memory rate limit is per-isolate, not global. Both are documented with
  follow-up options in `WORKER_SETUP.md`.
