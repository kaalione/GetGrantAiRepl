import { db } from "../db";
import { grants, companies, searchProfiles, type Grant, type Company } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { calculateMatchScore, type RelevanceProfile } from "@shared/matching";
import { storage, type GrantFilters } from "../storage";

// Scoring reads only these columns. Loading them for every grant costs a
// fraction of the full row (grants.description alone is 1.2 MB across the
// open grants) and match scoring itself is ~50 ms for the whole table, so
// the ordering is computed in memory and only the requested page is
// hydrated with full rows.
export type GrantIndexRow = Pick<
  Grant,
  "id" | "title" | "status" | "deadline" | "market" | "targetGroup" | "keywords" |
  "structuredEligibility" | "eligibilityCriteria" | "createdAt" | "sourceName"
>;
type ScoringRow = GrantIndexRow;

interface ScoringCacheEntry {
  rows: ScoringRow[];
  loadedAt: number;
}

// Grants only change when a scraper runs, so the scoring columns are safe
// to reuse briefly across requests and across users.
const SCORING_CACHE_TTL_MS = 3 * 60 * 1000;
let scoringCache: ScoringCacheEntry | null = null;

async function loadScoringRows(): Promise<ScoringRow[]> {
  if (scoringCache && Date.now() - scoringCache.loadedAt < SCORING_CACHE_TTL_MS) {
    return scoringCache.rows;
  }
  const rows = await db
    .select({
      id: grants.id,
      title: grants.title,
      status: grants.status,
      deadline: grants.deadline,
      market: grants.market,
      targetGroup: grants.targetGroup,
      keywords: grants.keywords,
      structuredEligibility: grants.structuredEligibility,
      eligibilityCriteria: grants.eligibilityCriteria,
      createdAt: grants.createdAt,
      sourceName: grants.sourceName,
    })
    .from(grants);
  scoringCache = { rows: rows as ScoringRow[], loadedAt: Date.now() };
  return scoringCache.rows;
}

// Called after scrapers write, so a run's results are visible immediately.
export function invalidateGrantScoringCache(): void {
  scoringCache = null;
}

// Shared read-only index for endpoints that must reason over every grant
// but return only a few — eligibility overview, calendar, digests. Avoids
// each of them loading the full table.
export async function getGrantIndex(): Promise<GrantIndexRow[]> {
  return loadScoringRows();
}

export type GrantSort = "match" | "deadline" | "newest";

export interface GrantSearchParams extends GrantFilters {
  userId?: string | null;
  companyId?: string | null;
  profileId?: string | null;
  sort?: GrantSort;
  page?: number;
  pageSize?: number;
  minScore?: number;
}

export interface GrantSearchResult {
  items: (Grant & { matchScore: number | null })[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  scored: boolean;
}

const MAX_PAGE_SIZE = 100;

export async function searchGrants(params: GrantSearchParams): Promise<GrantSearchResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? 24));
  const sort: GrantSort = params.sort ?? "match";

  // Resolve the scoring context. Both are optional: an anonymous visitor
  // gets an unscored list ordered by deadline.
  let company: Company | null = null;
  let profile: RelevanceProfile | null = null;

  if (params.userId) {
    if (params.companyId) {
      const [owned] = await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, params.companyId), eq(companies.userId, params.userId)));
      company = owned ?? null;
    } else {
      const owned = await db.select().from(companies).where(eq(companies.userId, params.userId));
      company = owned[0] ?? null;
    }

    if (params.profileId) {
      const [found] = await db
        .select()
        .from(searchProfiles)
        .where(and(
          eq(searchProfiles.id, params.profileId),
          eq(searchProfiles.userId, params.userId),
          eq(searchProfiles.active, true),
        ));
      profile = found ?? null;
    }
  }

  // SQL owns filtering (text search, amounts, deadline windows) and returns
  // ids only; scoring and ordering happen over those ids in memory.
  const filteredIds = await storage.getGrantIdsFiltered(params);
  const filteredIdSet = new Set(filteredIds);

  const canScore = Boolean(company);
  let ordered: { id: string; matchScore: number | null }[];

  if (canScore && sort === "match") {
    const scoringRows = await loadScoringRows();
    const scored = scoringRows
      .filter((row) => filteredIdSet.has(row.id))
      .map((row) => ({
        id: row.id,
        matchScore: calculateMatchScore(company, row as unknown as Grant, profile).score,
        deadline: row.deadline,
      }));

    const minScore = params.minScore ?? 0;
    ordered = scored
      .filter((s) => s.matchScore >= minScore)
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      })
      .map(({ id, matchScore }) => ({ id, matchScore }));
  } else if (sort === "newest") {
    const scoringRows = await loadScoringRows();
    ordered = scoringRows
      .filter((row) => filteredIdSet.has(row.id))
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .map((row) => ({ id: row.id, matchScore: null }));
  } else {
    // getGrantIdsFiltered already orders by status, then deadline.
    ordered = filteredIds.map((id) => ({ id, matchScore: null }));
  }

  const total = ordered.length;
  const pageIds = ordered.slice((page - 1) * pageSize, page * pageSize);

  if (pageIds.length === 0) {
    return { items: [], total, page, pageSize, hasMore: false, scored: canScore };
  }

  // Hydrate only the page — this is the single full-row query per request.
  const pageGrants = await storage.getGrantsByIds(pageIds.map((p) => p.id));
  const byId = new Map(pageGrants.map((g) => [g.id, g]));
  const items = pageIds
    .map(({ id, matchScore }) => {
      const grant = byId.get(id);
      return grant ? { ...grant, matchScore } : null;
    })
    .filter(Boolean) as (Grant & { matchScore: number | null })[];

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    scored: canScore,
  };
}
