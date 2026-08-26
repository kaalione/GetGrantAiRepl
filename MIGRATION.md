# Migration: Replit → standalone (Supabase + Railway)

This document records how getgrant.ai was migrated off Replit, what changed
and why, and the runbook for moving the production data. Written August 2026.

## What was replaced

| Replit dependency | Replacement | Where |
|---|---|---|
| Replit Auth (OIDC via `REPL_ID`) | Supabase Auth (Google, GitHub, email/password) | `server/auth/`, `client/src/pages/auth*.tsx`, `client/src/lib/supabase.ts` |
| Replit AI gateway (`AI_INTEGRATIONS_ANTHROPIC_*`) | Direct `@anthropic-ai/sdk` with `ANTHROPIC_API_KEY` | `server/lib/anthropic.ts` (shared client) |
| Stripe via Replit connector + `stripe-replit-sync` | `stripe` npm package with env keys, own webhook verification | `server/lib/stripeClient.ts`, `server/lib/webhookHandlers.ts` |
| Resend via Replit connector | `RESEND_API_KEY` / `RESEND_FROM_EMAIL` env | `server/lib/resend.ts` |
| Replit Postgres | Supabase Postgres (eu-north-1) | `DATABASE_URL` (pooled) + `DATABASE_URL_DIRECT` (drizzle-kit) |
| Replit scheduler | GitHub Actions | `.github/workflows/cron.yml` |
| `REPLIT_DEV_DOMAIN`/`REPL_SLUG` base URLs | Single `APP_URL` env | `server/lib/appUrl.ts` |
| Replit Vite plugins, `.replit`, `replit.md`, nix stubs | Removed | — |

Also removed: `server/replit_integrations/chat` and `/batch` (unmounted Replit
template boilerplate, including an unauthenticated chat CRUD), and the unused
`conversations`/`messages` tables from the schema.

## Auth design

- **Identity**: the browser signs in with `@supabase/supabase-js` and POSTs its
  access token to `POST /api/auth/session`. The server verifies it with
  `supabase.auth.getUser()` and creates the same express-session (Postgres
  `sessions` table via connect-pg-simple) the app always used.
- **Why**: `req.user` keeps the historical shape
  `{ claims: { sub, email, ... }, expires_at }` with `claims.sub` = `users.id`,
  so all ~40 route guards, ownership/IDOR checks, per-user rate limiting and
  the WebSocket cookie handshake (`sess.passport.user.claims.sub`) work
  unchanged.
- **User mapping**: `users.id` remains the app-wide identity (all FKs
  untouched). New unique column `users.auth_provider_id` stores the Supabase
  `auth.users.id`. Login resolution: by `auth_provider_id` → by verified email
  (this links legacy Replit-era rows and backfills `auth_provider_id`) → new
  row. No data is destroyed.
- `/api/login` (linked from many pages) now redirects to the `/auth` page;
  `/api/logout` destroys the session.

### Supabase Auth setup (one-time)

1. Create a Supabase project in **eu-north-1**.
2. Authentication → Providers: enable **Email**, **Google**, **GitHub**
   (create OAuth apps in Google Cloud Console / GitHub; the callback URL is
   `https://<project-ref>.supabase.co/auth/v1/callback`).
3. Authentication → URL Configuration: set Site URL to your `APP_URL` and add
   `http://localhost:5001/auth/callback` and
   `https://<your-domain>/auth/callback` to the redirect allowlist.
4. Copy the Project URL and the **publishable key** (`sb_publishable_...`,
   Project Settings → API Keys) into `.env` (`SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, and the `VITE_`-prefixed copies). Publishable +
   secret keys replaced the legacy anon/service_role keys in 2025; the app
   only needs the publishable one (legacy `SUPABASE_ANON_KEY` still works as
   a fallback env name).

## Stripe

- Keys come from `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY`.
- The webhook (`POST /api/stripe/webhook`) verifies signatures with
  `STRIPE_WEBHOOK_SECRET` and now **maintains `users.plan`**:
  `checkout.session.completed` upgrades, `customer.subscription.updated`/
  `deleted` track status and downgrade to free. (Under Replit, no code path
  ever updated `users.plan` after checkout — the app was never live, so this
  was implemented as the intended behavior.)
- Partner subscriptions and success-fee invoices are handled by the same
  webhook route as before (`partnerStripeWebhook`, `successFeeWebhook`).
- Create the products/prices in the Stripe dashboard and put their ids in
  `STRIPE_PRO_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID`,
  `STRIPE_PARTNER_STARTER_PRICE_ID`, `STRIPE_PARTNER_PROFESSIONAL_PRICE_ID`.
- **Local dev**:
  ```bash
  stripe listen --forward-to localhost:5001/api/stripe/webhook
  ```
  and put the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`.
- **Production**: add a webhook endpoint in the Stripe dashboard pointing at
  `https://<your-domain>/api/stripe/webhook` with events
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`,
  `invoice.voided`.
- Note: the old `stripe-replit-sync` package created a `stripe` schema in the
  Replit database. It is no longer written to and is not migrated.

## Database

- Both connection strings live behind the **Connect** button at the top of
  the Supabase dashboard (they are no longer under Settings → Database).
- **App + Python scrapers**: `DATABASE_URL` → the **Transaction pooler**
  string (port 6543, `?sslmode=require`).
- **Drizzle Kit** (`npm run db:push`): `DATABASE_URL_DIRECT` → the **Direct
  connection** string (port 5432); the transaction pooler doesn't support the
  prepared statements drizzle-kit uses.
- There are no migration files; the schema is applied with `npm run db:push`
  (unchanged from Replit).

### Data migration runbook (Replit → Supabase)

1. Get the old database URL: Replit workspace → Database pane → connection
   string.
2. Apply the schema to Supabase first:
   ```bash
   npm run db:push
   ```
3. Run the migration script (dumps public-schema data, restores with FK
   triggers disabled, prints row counts on both sides):
   ```bash
   SOURCE_DATABASE_URL='postgres://...replit...' \
   TARGET_DATABASE_URL='postgres://...supabase direct (5432)...' \
     ./scripts/migrate-data.sh
   ```
4. Verify the printed counts match — expected magnitudes: `grants` ≈ 1,750,
   plus `companies`, `applications`, `scraper_sources`, `scraper_logs`,
   `user_progress`, `users`.
5. Not migrated on purpose: `sessions` (transient Replit logins — users just
   sign in again and are linked by email) and the `stripe` schema (sync-engine
   cache).

## Scheduled jobs

All `/api/cron/*` endpoints are protected by `CRON_API_KEY` (fail-closed) and
accept it as `Authorization: Bearer`, `x-api-key` header, or `body.apiKey`.

GitHub Actions (`.github/workflows/cron.yml`) drives the schedule — configure
repo **secret** `CRON_API_KEY` and repo **variable** `APP_URL`:

| Job | Endpoint | Schedule (UTC) |
|---|---|---|
| Daily scrape | `POST /api/cron/scrape` | daily 05:00 |
| Weekly + slow scrape | `POST /api/cron/scrape` (`{"frequency":"weekly"}`) + `/scrape-slow` | Sun 06:00 |
| Eligibility extraction | `POST /api/cron/extract-eligibility` | daily 07:00 |
| Description enrichment | `POST /api/cron/enrich-descriptions` | Sat 08:00 |
| Notifications | `POST /api/cron/notifications` | hourly |
| Close expired grants | `POST /api/cron/close-expired` | daily 04:30 |
| Weekly digest | `POST /api/cron/weekly-digest` | Mon 05:00 |
| Success-fee maintenance | `POST /api/cron/success-fee-maintenance` | daily 04:15 |
| Project health | `POST /api/cron/project-health` | Tue 05:00 (safety net) |
| Partner maintenance | `POST /api/cron/partner-maintenance` | daily 04:45 |

Any other scheduler works the same way, e.g.:

```bash
curl -X POST "$APP_URL/api/cron/scrape" -H "Authorization: Bearer $CRON_API_KEY"
```

(For Vercel Cron you would add entries to `vercel.json` — but note the app is
not Vercel-shaped; see Hosting.)

Still in-process (self-scheduling inside the server, no action needed):
nightly partner stats cache (02:00), partner invite expiration (09:00), weekly
partner digest (Mon 07:00), and closing expired grants at startup.

## Hosting

**Railway** is the recommended target (Fly.io works the same way): the app is
one long-lived Node process that serves the SPA, runs a WebSocket server for
collaboration, spawns Python scrapers as child processes, and writes uploads
to local disk — all things serverless platforms (Vercel) don't do.

Railway notes:

- Build: `npm run build`; start: `npm start`. Railway injects `PORT`.
- The image needs Node 20+ **and** Python 3.11+ with
  `scrapers/requirements.txt` installed (plus `playwright install chromium`
  and its system deps) — set `PYTHON_BIN` if the interpreter isn't `python3`.
  Nixpacks providers `node,python` or a custom Dockerfile both work.
- Mount a **volume** at `/app/uploads` so partner logo/favicon uploads survive
  deploys.
- Set every variable from `.env.example`.

## Local quirks worth knowing

- macOS AirPlay listens on port 5000 — local dev uses `PORT=5001`.
- If the repo lives on an exFAT/NTFS drive, create the Python venv on the
  system disk: `VENV_DIR=~/.venvs/getgrant ./scrapers/setup.sh` (macOS
  AppleDouble `._*` files inside a venv break pip).

## Verification status (Phase 4)

Verified locally during the migration (no external credentials needed):

- ✅ `tsc` clean (49 pre-existing errors fixed, incl. two runtime
  ReferenceErrors) and `npm run build` passing
- ✅ Server boots against a fresh Postgres, schema via `db:push`, seeding works
- ✅ Session model end-to-end: cookie → pg `sessions` row → passport shape →
  API guards (401 without, user JSON with)
- ✅ `/api/login` → `/auth` redirect; auth page renders (tabs, OAuth buttons,
  email form); graceful notice when Supabase env is missing
- ✅ Cron endpoints: Bearer + legacy key forms accepted, wrong key → 401
- ✅ Full scraper chain: cron endpoint → spawned venv Python → live Vinnova
  scrape → grants + scraper_logs rows written
- ✅ i18n (sv/en) and analytics no-op without PostHog key

Requires real credentials (do after creating Supabase/Stripe/Anthropic/Resend
accounts and deploying):

- ☐ Sign up / log in with Google, GitHub, email+password
- ☐ Onboarding wizard, company profile + completion score
- ☐ AI matching and 4-step application generation with per-section editing
  (needs `ANTHROPIC_API_KEY`)
- ☐ DOCX/PDF export (Pro-gated — needs a Pro user)
- ☐ Stripe checkout + webhook in test mode; plan gating flips to Pro
- ☐ Emails via Resend (verify the sending domain first)
- ☐ Data migration run against the real Replit database
