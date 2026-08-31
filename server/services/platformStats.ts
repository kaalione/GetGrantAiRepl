import { db } from "../db";
import { grants, scraperSources } from "@shared/schema";
import { sql, eq } from "drizzle-orm";

// Powers the public-facing counts ("2 100+ active grants", "39+ sources").
// They were hardcoded in translation strings, so they drifted: the site
// advertised 1 700 grants and 39 sources while the database held 2 103 and 66.
export interface PlatformStats {
  activeGrants: number;
  sources: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { value: PlatformStats; at: number } | null = null;

export async function getPlatformStats(): Promise<PlatformStats> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const [g] = await db
    .select({ n: sql<number>`count(*)` })
    .from(grants)
    .where(sql`${grants.status} <> 'closed'`);

  const [s] = await db
    .select({ n: sql<number>`count(*)` })
    .from(scraperSources)
    .where(eq(scraperSources.active, true));

  const value = { activeGrants: Number(g.n), sources: Number(s.n) };
  cache = { value, at: Date.now() };
  return value;
}
