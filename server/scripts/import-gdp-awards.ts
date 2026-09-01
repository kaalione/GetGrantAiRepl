import "dotenv/config";
import { pool } from "../db";

/**
 * Imports historical funding decisions from the Gemensamma data-projektet (GDP)
 * open data files.
 *
 * These are decisions already made, not calls to apply for, so they answer a
 * different question than the grants table: what does this funder actually
 * award a company, as opposed to the ceiling quoted in a call? Vinnova's median
 * company award is 85 000 kr against calls that advertise millions.
 *
 * The files need no API key — unlike the GDP API — and are refreshed daily.
 * Only Vinnova publishes them today; gdphub.se says the other agencies are on
 * the way, and this handles them by URL when they appear.
 *
 *   npx tsx server/scripts/import-gdp-awards.ts
 *
 * Idempotent: rows are keyed on (funder, case number, org number, year), so a
 * re-run updates amounts rather than duplicating them.
 */

const SOURCES = [
  {
    funder: "Vinnova",
    awards: "https://stvinndatalagret.gdp.vinnova.se/csvfiles/1a.beslutadFinansiering.csv",
    classification: "https://stvinndatalagret.gdp.vinnova.se/csvfiles/1c.ansokanKlassificering.csv",
  },
];

// The product serves companies, so university and public-sector awards are
// skipped — they would drag every benchmark away from what a company can expect.
const COMPANY_TYPE = "Företag";

// The files are UTF-16LE with a BOM and semicolon-separated.
async function fetchCsv(url: string): Promise<Array<Record<string, string>>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const text = new TextDecoder("utf-16le").decode(await res.arrayBuffer());
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = splitRow(lines[0]).map((h) => h.replace(/^﻿/, ""));
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

// Values are quoted and may contain the delimiter, so a plain split will not do.
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ";" && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

async function main() {
  for (const source of SOURCES) {
    console.log(`\n${source.funder}`);

    const [awards, classes] = await Promise.all([
      fetchCsv(source.awards),
      fetchCsv(source.classification),
    ]);
    console.log(`  ${awards.length} award rows, ${classes.length} classification rows`);

    const byCase = new Map<string, Record<string, string>>();
    for (const c of classes) byCase.set(c.ansokanDiarienummer, c);

    const companies = awards.filter((a) => a.organisationTyp === COMPANY_TYPE);
    console.log(`  ${companies.length} of them companies`);

    // The file carries one row per aid basis (stödgrund), so the same company
    // can appear twice for one case and year — often with a second row of zero
    // kronor. Summing per case, company and year gives the figure a benchmark
    // should use, and makes the natural key actually unique.
    const merged = new Map<string, {
      funder: string; caseNumber: string; orgName: string; orgNumber: string;
      orgType: string; county: string; year: number | null; amount: number;
    }>();

    for (const r of companies) {
      const year = parseInt(r.beslutadFinansieringAr, 10);
      const amount = Number(r.beslutadFinansieringBelopp);
      const k = `${r.finansiarNamn}|${r.ansokanDiarienummer}|${r.organisationOrgnummer}|${r.beslutadFinansieringAr}`;
      const existing = merged.get(k);
      if (existing) {
        existing.amount += Number.isFinite(amount) ? amount : 0;
        continue;
      }
      merged.set(k, {
        funder: r.finansiarNamn || source.funder,
        caseNumber: r.ansokanDiarienummer,
        orgName: r.organisationNamn,
        orgNumber: r.organisationOrgnummer,
        orgType: r.organisationTyp,
        county: r.organisationLan,
        year: Number.isFinite(year) ? year : null,
        amount: Number.isFinite(amount) ? amount : 0,
      });
    }
    const records = [...merged.values()];
    console.log(`  ${records.length} after merging duplicate aid-basis rows`);

    let written = 0;
    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const values: unknown[] = [];
      const tuples = batch.map((r, n) => {
        const k = byCase.get(r.caseNumber);
        values.push(
          r.funder,
          r.caseNumber,
          r.orgName || null,
          r.orgNumber || null,
          r.orgType || null,
          r.county || null,
          r.year,
          r.amount,
          k?.kategoriseringFinansiar || null,
          k?.forskningsamnen || null,
          k?.hallbarhetsmal || null,
        );
        const b = n * 11;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`;
      });

      await pool.query(
        `INSERT INTO funding_awards
           (funder, case_number, org_name, org_number, org_type, county, year,
            amount_sek, category, research_subject, sustainability_goals)
         VALUES ${tuples.join(",")}
         ON CONFLICT (funder, case_number, org_number, year) DO UPDATE SET
           amount_sek = EXCLUDED.amount_sek,
           category = EXCLUDED.category,
           research_subject = EXCLUDED.research_subject,
           sustainability_goals = EXCLUDED.sustainability_goals,
           imported_at = now()`,
        values,
      );
      written += batch.length;
      if (written % 10000 === 0) console.log(`    ${written}…`);
    }
    console.log(`  wrote ${written}`);
  }

  const r = await pool.query(
    `SELECT funder, count(*)::int AS n, count(distinct org_number)::int AS orgs
       FROM funding_awards GROUP BY funder`);
  for (const row of r.rows) {
    console.log(`\n  ${row.funder}: ${row.n} awards, ${row.orgs} distinct companies`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
