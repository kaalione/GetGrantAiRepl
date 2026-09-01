import { pool } from "../db";

/**
 * What a funder actually awards a company, from historical decisions.
 *
 * A call advertises a ceiling — "up to 5 000 000 kr" — which tells an applicant
 * almost nothing about what to expect. Vinnova's median company award is around
 * 85 000 kr. This turns the GDP open data into that answer, optionally narrowed
 * to a funder's own subject category or a county.
 */

export interface BenchmarkQuery {
  funder?: string;
  category?: string;
  county?: string;
  orgNumber?: string;
  sinceYear?: number;
}

export interface Benchmark {
  awards: number;
  companies: number;
  median: number | null;
  p10: number | null;
  p90: number | null;
  total: number | null;
  years: { from: number | null; to: number | null };
  topCategories: Array<{ category: string; awards: number; median: number }>;
}

export async function getFundingBenchmark(q: BenchmarkQuery): Promise<Benchmark> {
  const where: string[] = ["amount_sek > 0"];
  const params: unknown[] = [];

  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };

  if (q.funder) add("funder = ?", q.funder);
  // Categories are pipe-separated multi-values in the source data.
  if (q.category) add("category ILIKE ?", `%${q.category}%`);
  if (q.county) add("county ILIKE ?", `%${q.county}%`);
  if (q.orgNumber) add("org_number = ?", q.orgNumber);
  if (q.sinceYear) add("year >= ?", q.sinceYear);

  const clause = `WHERE ${where.join(" AND ")}`;

  const stats = await pool.query(
    `SELECT
       count(*)::int                                                        AS awards,
       count(DISTINCT org_number)::int                                      AS companies,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY amount_sek)               AS median,
       percentile_cont(0.1) WITHIN GROUP (ORDER BY amount_sek)               AS p10,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY amount_sek)               AS p90,
       sum(amount_sek)                                                       AS total,
       min(year)::int                                                        AS from_year,
       max(year)::int                                                        AS to_year
     FROM funding_awards ${clause}`,
    params,
  );

  // Only meaningful when the caller has not already picked a category.
  const cats = q.category
    ? { rows: [] as Array<{ category: string; awards: number; median: string }> }
    : await pool.query(
        `SELECT category,
                count(*)::int AS awards,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY amount_sek) AS median
           FROM funding_awards ${clause} AND category IS NOT NULL
          GROUP BY category
          ORDER BY count(*) DESC
          LIMIT 6`,
        params,
      );

  const s = stats.rows[0];
  const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v)));

  return {
    awards: s.awards,
    companies: s.companies,
    median: num(s.median),
    p10: num(s.p10),
    p90: num(s.p90),
    total: num(s.total),
    years: { from: s.from_year, to: s.to_year },
    topCategories: cats.rows.map((r: any) => ({
      category: r.category,
      awards: r.awards,
      median: Math.round(Number(r.median)),
    })),
  };
}
