import { db } from "../db";
import { searchProfiles, type SearchProfile } from "@shared/schema";
import { and, eq, desc } from "drizzle-orm";

// Shared search-profile logic used by both the owner routes
// (/api/profiles) and the partner routes (/api/partner/clients/:id/
// profiles). Plan limits live here so the two paths cannot drift.

// Project-profile allowance per plan; the auto-created 'core' profile
// never counts. Partner-managed clients are limited by their clientPlan.
const PROJECT_PROFILE_LIMITS: Record<string, number> = {
  free: 0,
  pro: 5,
  enterprise: Number.POSITIVE_INFINITY,
};

export function projectProfileLimit(plan: string | null | undefined): number {
  return PROJECT_PROFILE_LIMITS[plan || "free"] ?? 0;
}

export async function listActiveProfiles(userId: string, companyId?: string | null): Promise<SearchProfile[]> {
  const conditions = [eq(searchProfiles.userId, userId), eq(searchProfiles.active, true)];
  if (companyId) conditions.push(eq(searchProfiles.companyId, companyId));
  return db
    .select()
    .from(searchProfiles)
    .where(and(...conditions))
    .orderBy(desc(searchProfiles.isDefault), desc(searchProfiles.createdAt));
}

export async function countProjectProfiles(userId: string): Promise<number> {
  const rows = await db
    .select({ id: searchProfiles.id })
    .from(searchProfiles)
    .where(and(
      eq(searchProfiles.userId, userId),
      eq(searchProfiles.kind, "project"),
      eq(searchProfiles.active, true),
    ));
  return rows.length;
}

export interface ProjectProfileInput {
  companyId: string;
  userId: string;
  name: string;
  description?: string | null;
  goals?: string | null;
  focusAreas?: string[] | null;
  keywords?: string[] | null;
  budgetSek?: number | null;
  timeframe?: string | null;
  createdFrom?: string;
  sourceDocumentUrl?: string | null;
  extraction?: Record<string, unknown> | null;
  createdByUserId?: string | null;
}

export type CreateProfileResult =
  | { ok: true; profile: SearchProfile }
  | { ok: false; reason: "limit"; limit: number; plan: string };

// Creates a project profile for `userId`, enforcing `plan`'s allowance.
// The caller supplies the plan so the owner path can read users.plan and
// the partner path can read partnerClients.clientPlan.
export async function createProjectProfile(
  input: ProjectProfileInput,
  plan: string
): Promise<CreateProfileResult> {
  const limit = projectProfileLimit(plan);
  const existing = await countProjectProfiles(input.userId);
  if (existing >= limit) {
    return { ok: false, reason: "limit", limit, plan };
  }

  const [profile] = await db
    .insert(searchProfiles)
    .values({
      companyId: input.companyId,
      userId: input.userId,
      name: input.name,
      kind: "project",
      description: input.description ?? null,
      goals: input.goals ?? null,
      focusAreas: input.focusAreas ?? null,
      keywords: input.keywords ?? null,
      budgetSek: input.budgetSek ?? null,
      timeframe: input.timeframe ?? null,
      createdFrom: input.createdFrom ?? "wizard",
      sourceDocumentUrl: input.sourceDocumentUrl ?? null,
      extraction: input.extraction ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();

  return { ok: true, profile };
}

export async function archiveProfile(profileId: string): Promise<void> {
  await db
    .update(searchProfiles)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(searchProfiles.id, profileId));
}

// Creates the auto 'core' profile for a company if it lacks one. Called
// when a company is created (and by the startup backfill) so a company
// always has the profile that mirrors it.
export async function ensureCoreProfileForCompany(company: {
  id: string;
  userId: string | null;
  description?: string | null;
  focusAreas?: string[] | null;
}): Promise<SearchProfile | null> {
  if (!company.userId) return null;

  const [existing] = await db
    .select({ id: searchProfiles.id })
    .from(searchProfiles)
    .where(and(eq(searchProfiles.companyId, company.id), eq(searchProfiles.kind, "core")));
  if (existing) return null;

  const [profile] = await db
    .insert(searchProfiles)
    .values({
      companyId: company.id,
      userId: company.userId,
      name: "Kärnverksamheten",
      kind: "core",
      description: company.description ?? null,
      focusAreas: company.focusAreas ?? null,
      createdFrom: "auto",
      isDefault: true,
    })
    .returning();
  return profile;
}
