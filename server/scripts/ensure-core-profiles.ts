import { db } from "../db";
import { companies, searchProfiles } from "@shared/schema";
import { isNull, eq, and } from "drizzle-orm";
import { ensureCoreProfileForCompany } from "../services/searchProfiles";

// Ensures every company has its auto-created default "core" search profile
// (mirrors the company profile — gives exactly the pre-profiles matching
// behavior). Idempotent; runs at server startup and can be run standalone.
export async function ensureCoreProfiles(): Promise<number> {
  const missing = await db
    .select({
      id: companies.id,
      userId: companies.userId,
      description: companies.description,
      focusAreas: companies.focusAreas,
    })
    .from(companies)
    .leftJoin(
      searchProfiles,
      and(eq(searchProfiles.companyId, companies.id), eq(searchProfiles.kind, "core"))
    )
    .where(isNull(searchProfiles.id));

  let created = 0;
  for (const company of missing) {
    const profile = await ensureCoreProfileForCompany(company);
    if (profile) created++;
  }
  if (created > 0) {
    console.log(`[Profiles] Created ${created} core search profiles`);
  }
  return created;
}
