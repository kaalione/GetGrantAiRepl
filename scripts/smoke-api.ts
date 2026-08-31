// Asserts that the API answers with JSON rather than the SPA shell.
//
// In production the client is served by a catch-all that returns index.html
// for anything it does not recognise, so a missing or misspelt API route
// answers 200 with HTML instead of failing. A status-code check passes; the
// endpoint is broken. This checks the content type, which is what actually
// distinguishes the two.
//
//   npx tsx scripts/smoke-api.ts                     # localhost:5002
//   npx tsx scripts/smoke-api.ts https://host        # a deployment

const base = (process.argv[2] || "http://localhost:5002").replace(/\/$/, "");

// Unauthenticated: public endpoints answer 200, guarded ones answer 401 —
// either is fine here. What matters is that a JSON handler replied at all.
const ENDPOINTS = [
  "/healthz",
  "/api/grants",
  "/api/grants?page=1&pageSize=5",
  "/api/grants/top-matches",
  "/api/grants/eligibility-overview",
  "/api/companies",
  "/api/projects",
  "/api/bookmarks",
  "/api/alerts",
  "/api/applications",
  "/api/calendar/events",
  "/api/notifications/preferences",
];

async function main() {
  console.log(`Smoke-testing ${base}\n`);
  let failed = 0;

  for (const path of ENDPOINTS) {
    let status: number | string;
    let type: string;
    try {
      const res = await fetch(`${base}${path}`, { redirect: "manual" });
      status = res.status;
      type = res.headers.get("content-type") ?? "(none)";
    } catch (error) {
      status = "ERR";
      type = error instanceof Error ? error.message : String(error);
    }

    const ok = typeof status === "number" && type.includes("application/json");
    if (!ok) failed++;
    console.log(`${ok ? "✅" : "❌"} ${String(status).padEnd(4)} ${path.padEnd(38)} ${type}`);
  }

  console.log();
  if (failed > 0) {
    console.error(
      `${failed} endpoint${failed === 1 ? "" : "s"} did not answer with JSON — ` +
      `most likely the route is missing and the SPA fallback served index.html.`
    );
    process.exit(1);
  }
  console.log(`All ${ENDPOINTS.length} endpoints answered with JSON.`);
}

main();
