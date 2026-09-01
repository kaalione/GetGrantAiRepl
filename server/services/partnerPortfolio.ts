import { inArray, eq, and } from "drizzle-orm";
import { db } from "../db";
import { companies, searchProfiles, applications } from "@shared/schema";
import type { Grant } from "@shared/schema";

/**
 * The working state of a consultant's client, for the portfolio table.
 *
 * The clients list used to answer "who did I invite, and when" — name, email,
 * status, signup date. A consultant already knows that. What they open the page
 * to decide is where today's hour goes, which needs the opposite columns: how
 * many pursuits a client has running, what the best open call is right now, and
 * which deadline lands first.
 */

export interface ClientPortfolioEntry {
  pursuits: number;
  openApplications: number;
  approvedThisYearSek: number;
  bestMatch: { grantId: string; title: string; score: number } | null;
  nextDeadline: { grantId: string; title: string; deadline: string } | null;
}

// Scoring is ~50ms per client against the active index. A consultant page of 50
// stays under three seconds; past that the wait costs more than the columns are
// worth, so the rest of the page returns without match data rather than hanging.
const MAX_SCORED_CLIENTS = 60;

const OPEN_APPLICATION_STATUSES = ["draft", "ready", "submitted", "under_review"];

export async function getClientPortfolio(
  clients: { id: string; userId: string | null }[],
): Promise<Map<string, ClientPortfolioEntry>> {
  const result = new Map<string, ClientPortfolioEntry>();
  for (const c of clients) {
    result.set(c.id, {
      pursuits: 0,
      openApplications: 0,
      approvedThisYearSek: 0,
      bestMatch: null,
      nextDeadline: null,
    });
  }

  const userIds = clients.map((c) => c.userId).filter((id): id is string => !!id);
  if (userIds.length === 0) return result;

  const [companyRows, profileRows] = await Promise.all([
    db.select().from(companies).where(inArray(companies.userId, userIds)),
    db
      .select()
      .from(searchProfiles)
      .where(and(inArray(searchProfiles.userId, userIds), eq(searchProfiles.active, true))),
  ]);

  const companyIds = companyRows.map((c) => c.id);
  const applicationRows = companyIds.length
    ? await db.select().from(applications).where(inArray(applications.companyId, companyIds))
    : [];

  const companyByUser = new Map<string, typeof companyRows[number]>();
  for (const company of companyRows) {
    if (company.userId && !companyByUser.has(company.userId)) companyByUser.set(company.userId, company);
  }

  const pursuitsByUser = new Map<string, number>();
  for (const profile of profileRows) {
    pursuitsByUser.set(profile.userId, (pursuitsByUser.get(profile.userId) ?? 0) + 1);
  }

  const applicationsByCompany = new Map<string, typeof applicationRows>();
  for (const application of applicationRows) {
    if (!application.companyId) continue;
    const list = applicationsByCompany.get(application.companyId) ?? [];
    list.push(application);
    applicationsByCompany.set(application.companyId, list);
  }

  const { getGrantIndex } = await import("./grantSearch");
  const { calculateMatchScore } = await import("@shared/matching");
  const grantIndex = await getGrantIndex();

  const now = new Date();
  const currentYear = now.getFullYear();
  const grantById = new Map(grantIndex.map((g) => [g.id, g]));
  // Only calls a client could still act on are worth ranking or counting down to.
  const openGrants = grantIndex.filter(
    (g) => g.status !== "closed" && (!g.deadline || new Date(g.deadline) >= now),
  );

  let scored = 0;
  for (const client of clients) {
    const entry = result.get(client.id)!;
    if (!client.userId) continue;

    entry.pursuits = pursuitsByUser.get(client.userId) ?? 0;

    const company = companyByUser.get(client.userId);
    if (!company) continue;

    const clientApplications = applicationsByCompany.get(company.id) ?? [];
    entry.openApplications = clientApplications.filter((a) =>
      OPEN_APPLICATION_STATUSES.includes(a.status),
    ).length;
    entry.approvedThisYearSek = clientApplications
      .filter(
        (a) =>
          a.status === "approved" &&
          a.approvedAmount &&
          a.statusUpdatedAt &&
          new Date(a.statusUpdatedAt).getFullYear() === currentYear,
      )
      .reduce((sum, a) => sum + Number(a.approvedAmount ?? 0), 0);

    // A deadline the consultant has already committed to outranks a suggested
    // one, so applications in progress are considered before open matches.
    for (const application of clientApplications) {
      if (!OPEN_APPLICATION_STATUSES.includes(application.status) || !application.grantId) continue;
      const grant = grantById.get(application.grantId);
      if (!grant?.deadline) continue;
      const deadline = new Date(grant.deadline);
      if (deadline < now) continue;
      if (!entry.nextDeadline || deadline < new Date(entry.nextDeadline.deadline)) {
        entry.nextDeadline = {
          grantId: grant.id,
          title: grant.title,
          deadline: new Date(grant.deadline).toISOString(),
        };
      }
    }

    if (scored >= MAX_SCORED_CLIENTS) continue;
    scored++;

    const profile = profileRows.find((p) => p.userId === client.userId && p.isDefault)
      ?? profileRows.find((p) => p.userId === client.userId)
      ?? null;

    let best: ClientPortfolioEntry["bestMatch"] = null;
    let bestDeadline: ClientPortfolioEntry["nextDeadline"] = null;
    for (const grant of openGrants) {
      const score = calculateMatchScore(company, grant as unknown as Grant, profile as any).score;
      if (!best || score > best.score) best = { grantId: grant.id, title: grant.title, score };
      if (score >= 50 && grant.deadline) {
        const deadline = new Date(grant.deadline);
        if (!bestDeadline || deadline < new Date(bestDeadline.deadline)) {
          bestDeadline = { grantId: grant.id, title: grant.title, deadline: deadline.toISOString() };
        }
      }
    }
    entry.bestMatch = best;
    if (!entry.nextDeadline) entry.nextDeadline = bestDeadline;
  }

  return result;
}

export interface PortfolioSummary {
  totalPursuits: number;
  totalOpenApplications: number;
  approvedThisYearSek: number;
}

/**
 * The summary cards describe the consultant's whole book of business, so these
 * are counted across every client rather than the page currently displayed.
 * "Satsningar ni skapat" is deliberately the pursuits the consultant authored,
 * not every pursuit their clients have — it is the work they did.
 */
export async function getPortfolioSummary(
  partnerUserId: string,
  allClients: { userId: string | null }[],
): Promise<PortfolioSummary> {
  const empty = { totalPursuits: 0, totalOpenApplications: 0, approvedThisYearSek: 0 };
  const userIds = allClients.map((c) => c.userId).filter((id): id is string => !!id);

  const createdProfiles = await db
    .select({ id: searchProfiles.id })
    .from(searchProfiles)
    .where(and(eq(searchProfiles.createdByUserId, partnerUserId), eq(searchProfiles.active, true)));

  if (userIds.length === 0) return { ...empty, totalPursuits: createdProfiles.length };

  const companyRows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(inArray(companies.userId, userIds));
  const companyIds = companyRows.map((c) => c.id);
  if (companyIds.length === 0) return { ...empty, totalPursuits: createdProfiles.length };

  const applicationRows = await db
    .select()
    .from(applications)
    .where(inArray(applications.companyId, companyIds));

  const currentYear = new Date().getFullYear();
  return {
    totalPursuits: createdProfiles.length,
    totalOpenApplications: applicationRows.filter((a) =>
      OPEN_APPLICATION_STATUSES.includes(a.status),
    ).length,
    approvedThisYearSek: applicationRows
      .filter(
        (a) =>
          a.status === "approved" &&
          a.approvedAmount &&
          a.statusUpdatedAt &&
          new Date(a.statusUpdatedAt).getFullYear() === currentYear,
      )
      .reduce((sum, a) => sum + Number(a.approvedAmount ?? 0), 0),
  };
}
