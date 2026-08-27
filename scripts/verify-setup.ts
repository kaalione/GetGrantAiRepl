import "dotenv/config";

// Readiness check: validates every external service the app depends on
// using the values in .env. Run with:  npx tsx scripts/verify-setup.ts
// Safe to run repeatedly — makes only read-only API calls.

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function report(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name.padEnd(22)} ${detail}`);
}

function missing(name: string, vars: string[]): boolean {
  const absent = vars.filter((v) => !process.env[v]);
  if (absent.length > 0) {
    report(name, false, `missing env: ${absent.join(", ")}`);
    return true;
  }
  return false;
}

async function checkDatabase() {
  if (missing("Database", ["DATABASE_URL"])) return;
  try {
    const pg = (await import("pg")).default;
    // Same TLS behavior as server/db.ts — encrypt, skip CA verification.
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL!.replace("sslmode=require", "sslmode=no-verify"),
      max: 1,
    });
    const { rows } = await pool.query(
      "select (select count(*) from grants) as grants, (select count(*) from users) as users, (select count(*) from sessions) as sessions"
    );
    await pool.end();
    report("Database", true, `connected — grants=${rows[0].grants}, users=${rows[0].users}, sessions=${rows[0].sessions}`);
  } catch (err: any) {
    report("Database", false, err.message);
  }
}

async function checkDrizzleDirect() {
  if (!process.env.DATABASE_URL_DIRECT) {
    report("Drizzle (direct)", false, "missing env: DATABASE_URL_DIRECT (needed for npm run db:push)");
    return;
  }
  try {
    const pg = (await import("pg")).default;
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_DIRECT, max: 1 });
    await pool.query("select 1");
    await pool.end();
    report("Drizzle (direct)", true, "direct connection works");
  } catch (err: any) {
    report("Drizzle (direct)", false, err.message);
  }
}

async function checkSupabase() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!process.env.SUPABASE_URL || !key) {
    report("Supabase Auth", false, "missing env: SUPABASE_URL and/or SUPABASE_PUBLISHABLE_KEY");
    return;
  }
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: key },
    });
    if (!res.ok) throw new Error(`auth settings returned ${res.status}`);
    const settings: any = await res.json();
    const external = Object.entries(settings.external || {})
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .join(", ");
    report("Supabase Auth", true, `reachable — providers enabled: ${external || "none yet"}`);
    if (!process.env.VITE_SUPABASE_URL) {
      report("Supabase (client)", false, "missing env: VITE_SUPABASE_URL");
    }
    if (!process.env.VITE_SUPABASE_PUBLISHABLE_KEY && !process.env.VITE_SUPABASE_ANON_KEY) {
      report("Supabase (client)", false, "missing env: VITE_SUPABASE_PUBLISHABLE_KEY");
    }
    if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_URL !== process.env.SUPABASE_URL) {
      report("Supabase (client)", false, "VITE_SUPABASE_URL differs from SUPABASE_URL");
    }
  } catch (err: any) {
    report("Supabase Auth", false, err.message);
  }
}

async function checkAnthropic() {
  if (missing("Anthropic", ["ANTHROPIC_API_KEY"])) return;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const models = await client.models.list();
    report("Anthropic", true, `key valid — ${models.data.length} models visible`);
  } catch (err: any) {
    report("Anthropic", false, err.message);
  }
}

async function checkStripe() {
  if (missing("Stripe", ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"])) return;
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const account = await stripe.accounts.retrieve();
    const mode = process.env.STRIPE_SECRET_KEY!.startsWith("sk_test") ? "test" : "LIVE";
    report("Stripe", true, `key valid (${mode} mode, account ${account.id})`);

    for (const [envName, plan] of [
      ["STRIPE_PRO_PRICE_ID", "pro"],
      ["STRIPE_ENTERPRISE_PRICE_ID", "enterprise"],
      ["STRIPE_PARTNER_STARTER_PRICE_ID", "partner starter"],
      ["STRIPE_PARTNER_PROFESSIONAL_PRICE_ID", "partner professional"],
    ] as const) {
      const id = process.env[envName];
      if (!id) {
        report(`Stripe price (${plan})`, false, `missing env: ${envName}`);
        continue;
      }
      try {
        const price = await stripe.prices.retrieve(id);
        report(`Stripe price (${plan})`, true, `${price.unit_amount! / 100} ${price.currency?.toUpperCase()} / ${price.recurring?.interval}`);
      } catch {
        report(`Stripe price (${plan})`, false, `price ${id} not found with this key`);
      }
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      report("Stripe webhook", false, "missing env: STRIPE_WEBHOOK_SECRET (stripe listen / dashboard endpoint)");
    } else {
      report("Stripe webhook", true, "webhook secret set");
    }
  } catch (err: any) {
    report("Stripe", false, err.message);
  }
}

async function checkResend() {
  if (missing("Resend", ["RESEND_API_KEY"])) return;
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const body: any = await res.json();
    const domains = (body.data || []).map((d: any) => `${d.name} (${d.status})`).join(", ");
    report("Resend", true, `key valid — domains: ${domains || "none verified yet"}`);
  } catch (err: any) {
    report("Resend", false, err.message);
  }
}

function checkStatic() {
  report("SESSION_SECRET", !!process.env.SESSION_SECRET, process.env.SESSION_SECRET ? "set" : "missing — openssl rand -hex 32");
  report("CRON_API_KEY", !!process.env.CRON_API_KEY, process.env.CRON_API_KEY ? "set" : "missing — cron endpoints will return 503");
  report("APP_URL", !!process.env.APP_URL, process.env.APP_URL || "missing — emails/Stripe redirects fall back to localhost");
}

(async () => {
  console.log("getgrant.ai setup verification\n");
  checkStatic();
  await checkDatabase();
  await checkDrizzleDirect();
  await checkSupabase();
  await checkAnthropic();
  await checkStripe();
  await checkResend();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length > 0 ? 1 : 0);
})();
