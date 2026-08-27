import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { companies, searchProfiles, users, type SearchProfile } from "@shared/schema";
import { and, eq, desc } from "drizzle-orm";
import { isAuthenticated } from "../auth";

const router = Router();

// Plan limits for user-created 'project' profiles (the auto 'core' profile
// never counts): free = none, pro = 5, enterprise = unlimited.
const PROJECT_PROFILE_LIMITS: Record<string, number> = {
  free: 0,
  pro: 5,
  enterprise: Number.POSITIVE_INFINITY,
};

const createProfileSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(4000).optional().nullable(),
  goals: z.string().max(4000).optional().nullable(),
  focusAreas: z.array(z.string().max(80)).max(20).optional().nullable(),
  keywords: z.array(z.string().max(60)).max(30).optional().nullable(),
  budgetSek: z.number().int().nonnegative().max(1_000_000_000).optional().nullable(),
  timeframe: z.string().max(120).optional().nullable(),
});

const updateProfileSchema = createProfileSchema.partial().omit({ companyId: true });

async function ownedCompany(companyId: string, userId: string) {
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
  return company ?? null;
}

async function ownedProfile(profileId: string, userId: string): Promise<SearchProfile | null> {
  const [profile] = await db
    .select()
    .from(searchProfiles)
    .where(and(eq(searchProfiles.id, profileId), eq(searchProfiles.userId, userId)));
  return profile ?? null;
}

// List the user's profiles (optionally for one company). Core profile first.
router.get("/profiles", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims.sub;
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : null;

    const conditions = [eq(searchProfiles.userId, userId), eq(searchProfiles.active, true)];
    if (companyId) conditions.push(eq(searchProfiles.companyId, companyId));

    const profiles = await db
      .select()
      .from(searchProfiles)
      .where(and(...conditions))
      .orderBy(desc(searchProfiles.isDefault), desc(searchProfiles.createdAt));

    res.json(profiles);
  } catch (error) {
    console.error("Failed to list search profiles:", error);
    res.status(500).json({ error: "Kunde inte hämta sökprofiler" });
  }
});

// Create a project profile (wizard flow). Plan-gated.
router.post("/profiles", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims.sub;
    const parsed = createProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Ogiltiga fält", details: parsed.error.flatten() });
    }
    const data = parsed.data;

    if (!(await ownedCompany(data.companyId, userId))) {
      return res.status(403).json({ error: "Företaget tillhör inte ditt konto" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const plan = user?.plan || "free";
    const limit = PROJECT_PROFILE_LIMITS[plan] ?? 0;

    const existing = await db
      .select({ id: searchProfiles.id })
      .from(searchProfiles)
      .where(
        and(
          eq(searchProfiles.userId, userId),
          eq(searchProfiles.kind, "project"),
          eq(searchProfiles.active, true)
        )
      );

    if (existing.length >= limit) {
      return res.status(403).json({
        error: "Plangräns nådd",
        message:
          plan === "free"
            ? "Projektprofiler kräver Pro. Uppgradera för att söka bidrag till specifika projekt."
            : `Din plan tillåter ${limit} projektprofiler. Arkivera en profil eller uppgradera.`,
        upgrade: plan !== "enterprise",
      });
    }

    const [profile] = await db
      .insert(searchProfiles)
      .values({
        companyId: data.companyId,
        userId,
        name: data.name,
        kind: "project",
        description: data.description ?? null,
        goals: data.goals ?? null,
        focusAreas: data.focusAreas ?? null,
        keywords: data.keywords ?? null,
        budgetSek: data.budgetSek ?? null,
        timeframe: data.timeframe ?? null,
        createdFrom: "wizard",
      })
      .returning();

    res.status(201).json(profile);
  } catch (error) {
    console.error("Failed to create search profile:", error);
    res.status(500).json({ error: "Kunde inte skapa sökprofil" });
  }
});

// Update a profile. Core profiles accept edits to relevance fields only
// through the company profile page — but allow name-independent updates here
// for project profiles.
router.patch("/profiles/:id", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims.sub;
    const profile = await ownedProfile(req.params.id as string, userId);
    if (!profile) return res.status(404).json({ error: "Profilen hittades inte" });
    if (profile.kind === "core") {
      return res.status(400).json({ error: "Kärnprofilen redigeras via företagsprofilen" });
    }

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Ogiltiga fält", details: parsed.error.flatten() });
    }

    const [updated] = await db
      .update(searchProfiles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(searchProfiles.id, profile.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Failed to update search profile:", error);
    res.status(500).json({ error: "Kunde inte uppdatera sökprofil" });
  }
});

// Archive (soft delete) a project profile. Alerts/applications keep their
// profile_id reference for history.
router.delete("/profiles/:id", isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.claims.sub;
    const profile = await ownedProfile(req.params.id as string, userId);
    if (!profile) return res.status(404).json({ error: "Profilen hittades inte" });
    if (profile.kind === "core") {
      return res.status(400).json({ error: "Kärnprofilen kan inte tas bort" });
    }

    await db
      .update(searchProfiles)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(searchProfiles.id, profile.id));

    res.json({ archived: true });
  } catch (error) {
    console.error("Failed to archive search profile:", error);
    res.status(500).json({ error: "Kunde inte arkivera sökprofil" });
  }
});

export default router;
