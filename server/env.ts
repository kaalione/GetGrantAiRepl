// Fails fast, and legibly, on a missing configuration.
//
// Without this, the first missing variable surfaced as a throw deep inside a
// lazily-initialised module, so the deploy log showed a megabyte of bundled
// driver source with the actual one-line cause buried in it. Checking here —
// before anything that reads the environment is touched — turns that into a
// short list of what to set.

// Absent these the process cannot serve a single request.
const REQUIRED = [
  ["DATABASE_URL", "Postgres connection string (Supabase transaction pooler, port 6543)"],
  ["SESSION_SECRET", "signs session cookies; any long random string"],
] as const;

// The app boots without these, but the named feature stays off.
const RECOMMENDED = [
  ["SUPABASE_URL", "sign-in is disabled without it"],
  ["SUPABASE_PUBLISHABLE_KEY", "sign-in is disabled without it"],
  ["ANTHROPIC_API_KEY", "grant analysis and application drafting fail"],
  ["APP_URL", "links in emails and Stripe redirects point at the wrong host"],
] as const;

function assertEnv(): void {
  const missing = REQUIRED.filter(([name]) => !process.env[name]);

  if (missing.length > 0) {
    const lines = missing.map(([name, why]) => `  - ${name}: ${why}`).join("\n");
    console.error(
      `\nMissing required environment ${missing.length === 1 ? "variable" : "variables"}:\n${lines}\n\n` +
      `Set them in your hosting provider's variables (or .env locally) and redeploy.\n`
    );
    process.exit(1);
  }

  const absent = RECOMMENDED.filter(([name]) => !process.env[name]);
  for (const [name, consequence] of absent) {
    console.warn(`[env] ${name} is not set — ${consequence}`);
  }
}

// Side effect on import: ESM evaluates imported modules in order, so importing
// this before ./routes guarantees the check runs first. A function called
// between import statements would not — those are hoisted above it.
assertEnv();
