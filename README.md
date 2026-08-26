# getgrant.ai — AI-Powered Swedish Grant Application Platform

getgrant.ai helps Swedish businesses discover, match with, and apply for
grants and funding opportunities.

## Features

- **Grant Discovery**: 35+ scraped sources — Vinnova, Tillväxtverket, EU,
  Nordic agencies and foundations
- **Smart Matching**: AI-powered matching against the company profile
- **AI Application Generation**: Claude generates application content in
  Swedish, section by section, with DOCX/PDF export
- **Structured Eligibility**: AI-extracted eligibility criteria per grant
- **Billing**: Stripe subscriptions (Free/Pro/Enterprise) + partner whitelabel
- **Automated Updates**: scheduled scraping, digests and notifications

## Tech stack

- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack Query,
  Tailwind + shadcn/ui, react-i18next (sv default; en/no/fi)
- **Backend**: Express 5 + TypeScript, Zod, express-session (Postgres store)
- **Database**: Supabase Postgres + Drizzle ORM
- **Auth**: Supabase Auth (Google, GitHub, email/password)
- **AI**: Anthropic Claude (`@anthropic-ai/sdk`)
- **Scrapers**: Python (BeautifulSoup, Playwright, psycopg2) in `scrapers/`
- **Email**: Resend · **Analytics**: PostHog (no-op without key)

## Local setup

Prerequisites: Node 20+, Python 3.11+, a Supabase project (or any Postgres).

1. `npm install`
2. `cp .env.example .env` and fill it in — minimum for a first boot:
   `DATABASE_URL`, `DATABASE_URL_DIRECT`, `SESSION_SECRET`, `PORT=5001`
   (macOS AirPlay squats port 5000). For login also set the four
   `SUPABASE`/`VITE_SUPABASE` values; for AI features `ANTHROPIC_API_KEY`.
3. `npm run db:push` — applies the schema (uses `DATABASE_URL_DIRECT`).
4. `./scrapers/setup.sh` — Python venv + dependencies + Playwright Chromium.
   On an exFAT/NTFS drive: `VENV_DIR=~/.venvs/getgrant ./scrapers/setup.sh`,
   then set `PYTHON_BIN` in `.env` accordingly.
5. `npm run dev` — serves API + client on `http://localhost:5001`.
6. (Stripe, optional) `stripe listen --forward-to localhost:5001/api/stripe/webhook`
   and copy the `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

Check your configuration at any point — validates every key in `.env` with
read-only API calls and tells you exactly what's missing:

```bash
npx tsx scripts/verify-setup.ts
```

Useful commands:

```bash
npm run check                      # TypeScript
npm run build && npm start        # production build + serve
python scrapers/main.py --frequency daily          # run scrapers directly
curl -X POST localhost:5001/api/cron/scrape \
  -H "Authorization: Bearer $CRON_API_KEY"          # via the API
```

## Deployment

- **App**: Railway (or Fly.io) — one Node process with WebSockets, spawned
  Python scrapers and disk uploads, so serverless hosts don't fit. Mount a
  volume at `uploads/`. Build `npm run build`, start `npm start`.
- **Database + Auth**: Supabase (eu-north-1). Pooled connection string for
  `DATABASE_URL`, direct for `DATABASE_URL_DIRECT`.
- **Scheduled jobs**: GitHub Actions (`.github/workflows/cron.yml`) — set repo
  secret `CRON_API_KEY` and repo variable `APP_URL`.
- **Stripe webhook**: dashboard endpoint → `https://<domain>/api/stripe/webhook`.

See [MIGRATION.md](MIGRATION.md) for the full Replit migration record,
Supabase/Stripe setup details and the data migration runbook.

## Environment variables

`.env.example` is the complete, documented list. Everything is read from
`.env` (dotenv) or the process environment.
