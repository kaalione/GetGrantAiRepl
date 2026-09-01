import "dotenv/config";
import { pool } from "../db";

/**
 * Imports historical funding decisions from the Gemensamma data-projektet (GDP)
 * API — the /finansieradeaktiviteter endpoint, for every agency that publishes
 * one.
 *
 * These are decisions already made, not calls to apply for, and they answer a
 * question the grants table cannot: what does this funder actually award a
 * company, as opposed to the ceiling quoted in a call? Vinnova's median company
 * award over the last five years is 147 484 kr against calls advertising
 * millions.
 *
 * This replaced a CSV importer. The exports are published for Vinnova alone,
 * while the API serves all four agencies and carries three fields the files do
 * not: keywords, the call the activity belongs to, and the grant form. Keywords
 * are what let a benchmark be answered by topic rather than only by funder.
 *
 *   npx tsx server/scripts/import-gdp-awards.ts
 *   POST /api/cron/import-gdp-awards      (weekly, see .github/workflows/cron.yml)
 *
 * Idempotent: rows are keyed on (funder, case number, org number, year), so a
 * re-run updates amounts rather than duplicating them.
 */

interface Agency {
  funder: string;
  base: string;
  keyEnv: string;
}

const AGENCIES: Agency[] = [
  { funder: "Vinnova", base: "https://api.vinnova.se/gdp_vinnova", keyEnv: "GDP_VINNOVA_KEY" },
  { funder: "Formas", base: "https://api.formas.se/gdp_formas", keyEnv: "GDP_FORMAS_KEY" },
  { funder: "Forte", base: "https://api.forte.se/gdp_forte", keyEnv: "GDP_FORTE_KEY" },
  { funder: "Vetenskapsrådet", base: "https://api.vr.se/gdp_vr", keyEnv: "GDP_VR_KEY" },
];

// The product serves companies, so university and public-sector awards are
// skipped — they would drag every benchmark away from what a company can expect.
const COMPANY_TYPE = "Företag";

const PAGE = 1000;

interface AwardRow {
  funder: string;
  caseNumber: string;
  orgName: string | null;
  orgNumber: string | null;
  orgType: string | null;
  county: string | null;
  year: number | null;
  amount: number;
  category: string | null;
  researchSubject: string | null;
  sustainabilityGoals: string | null;
  keywords: string | null;
  callCaseNumber: string | null;
  grantForm: string | null;
}

const names = (list: unknown): string | null => {
  if (!Array.isArray(list) || list.length === 0) return null;
  const joined = list.map((x: any) => x?.namn).filter(Boolean).join(", ");
  return joined || null;
};

async function fetchPage(agency: Agency, key: string, offset: number): Promise<any[]> {
  const url = `${agency.base}/finansieradeaktiviteter?authorization=${encodeURIComponent(key)}&limit=${PAGE}&offset=${offset}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${agency.funder} offset ${offset} → HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

function toRows(agency: Agency, activity: any): AwardRow[] {
  const shared = {
    funder: activity.finansiarNamn || agency.funder,
    caseNumber: activity.diarienummer,
    category: names(activity.kategoriseringFinansiar),
    researchSubject: names(activity.forskningsamnen),
    sustainabilityGoals: names(activity.hallbarhetsmal),
    keywords: names(activity.nyckelord),
    callCaseNumber: activity.utlysning?.diarienummer ?? null,
    grantForm: activity.bidragsform?.namn ?? null,
  };

  const out: AwardRow[] = [];
  for (const decision of activity.beslutadFinansiering || []) {
    const org = decision.finansieradOrganisation;
    if (!org || org.typ !== COMPANY_TYPE) continue;
    out.push({
      ...shared,
      orgName: org.namn ?? null,
      orgNumber: org.organisationsnummer ?? null,
      orgType: org.typ ?? null,
      county: org.lan ?? null,
      year: Number.isFinite(decision.ar) ? decision.ar : null,
      amount: Number.isFinite(decision.belopp) ? decision.belopp : 0,
    });
  }
  return out;
}

export async function importGdpAwards(): Promise<{ funders: number; written: number; skipped: string[] }> {
  let totalWritten = 0;
  const skipped: string[] = [];
  let funders = 0;

  for (const agency of AGENCIES) {
    const key = (process.env[agency.keyEnv] || "").trim();
    if (!key) {
      // One missing key must not stop the others.
      console.warn(`  ${agency.funder}: ${agency.keyEnv} not set — skipping`);
      skipped.push(agency.funder);
      continue;
    }

    console.log(`\n${agency.funder}`);
    funders++;

    // The same company can appear twice for one activity and year — one row per
    // aid basis (stödgrund), often with a second of zero kronor. Summing gives
    // the figure a benchmark should use and makes the key unique.
    const merged = new Map<string, AwardRow>();
    let offset = 0;
    let activities = 0;

    for (;;) {
      const page = await fetchPage(agency, key, offset);
      if (page.length === 0) break;
      activities += page.length;

      for (const activity of page) {
        for (const row of toRows(agency, activity)) {
          const k = `${row.funder}|${row.caseNumber}|${row.orgNumber}|${row.year}`;
          const existing = merged.get(k);
          if (existing) existing.amount += row.amount;
          else merged.set(k, row);
        }
      }

      if (page.length < PAGE) break;
      offset += PAGE;
      if (offset % 5000 === 0) console.log(`    ${activities} activities read…`);
    }

    const records = [...merged.values()];
    console.log(`  ${activities} activities → ${records.length} company awards`);

    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const values: unknown[] = [];
      const tuples = batch.map((r, n) => {
        values.push(
          r.funder, r.caseNumber, r.orgName, r.orgNumber, r.orgType, r.county,
          r.year, r.amount, r.category, r.researchSubject, r.sustainabilityGoals,
          r.keywords, r.callCaseNumber, r.grantForm,
        );
        const b = n * 14;
        return `(${Array.from({ length: 14 }, (_, j) => `$${b + j + 1}`).join(",")})`;
      });

      await pool.query(
        `INSERT INTO funding_awards
           (funder, case_number, org_name, org_number, org_type, county, year,
            amount_sek, category, research_subject, sustainability_goals,
            keywords, call_case_number, grant_form)
         VALUES ${tuples.join(",")}
         ON CONFLICT (funder, case_number, org_number, year) DO UPDATE SET
           amount_sek = EXCLUDED.amount_sek,
           category = EXCLUDED.category,
           research_subject = EXCLUDED.research_subject,
           sustainability_goals = EXCLUDED.sustainability_goals,
           keywords = EXCLUDED.keywords,
           call_case_number = EXCLUDED.call_case_number,
           grant_form = EXCLUDED.grant_form,
           imported_at = now()`,
        values,
      );
      totalWritten += batch.length;
    }
    console.log(`  wrote ${records.length}`);
  }

  const r = await pool.query(
    `SELECT funder, count(*)::int AS n, count(DISTINCT org_number)::int AS orgs,
            count(keywords)::int AS with_keywords
       FROM funding_awards GROUP BY funder ORDER BY n DESC`);
  for (const row of r.rows) {
    console.log(`\n  ${row.funder}: ${row.n} awards, ${row.orgs} companies, ${row.with_keywords} with keywords`);
  }

  return { funders, written: totalWritten, skipped };
}

const runDirectly = process.argv[1]?.includes("import-gdp-awards");
if (runDirectly) {
  importGdpAwards()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
