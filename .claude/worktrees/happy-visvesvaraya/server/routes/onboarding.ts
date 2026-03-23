import { Router } from "express";
import { db } from "../db";
import { onboardingSessions, companies } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  normalizeUrl,
  isPrivateOrLocalUrl,
  scrapeWebsite,
  extractCompanyDataFromWebsite,
  mapExtractedDataToCompanyProfile,
  countExtractedFields,
} from "../services/websiteExtractor";

const router = Router();

router.post("/onboarding/start", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const existing = await db.query.onboardingSessions.findFirst({
      where: and(
        eq(onboardingSessions.userId, userId),
        sql`${onboardingSessions.completedAt} IS NULL`,
        sql`${onboardingSessions.skippedAt} IS NULL`
      ),
      orderBy: [desc(onboardingSessions.createdAt)],
    });

    if (existing) {
      const userCompany = await db.query.companies.findFirst({
        where: eq(companies.userId, userId),
      });
      return res.json({
        sessionId: existing.id,
        currentStep: existing.currentStep,
        completedAt: existing.completedAt,
        existingProfile: !!userCompany,
        resuming: true,
      });
    }

    const userCompany = await db.query.companies.findFirst({
      where: eq(companies.userId, userId),
    });

    let startStep = 1;
    if (userCompany) {
      startStep = 4;
    }

    const [session] = await db
      .insert(onboardingSessions)
      .values({
        userId,
        companyId: userCompany?.id || null,
        currentStep: startStep,
      })
      .returning();

    return res.json({
      sessionId: session.id,
      currentStep: session.currentStep,
      completedAt: null,
      existingProfile: !!userCompany,
      resuming: false,
    });
  } catch (error: any) {
    console.error("Error starting onboarding:", error);
    return res.status(500).json({ error: "Could not start onboarding" });
  }
});

async function performExtraction(req: any, res: any, userId: string, sessionId: string | null, websiteUrl: string, context?: string) {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeUrl(websiteUrl);
  } catch {
    return res.status(400).json({ error: "Ogiltig URL-format" });
  }

  if (isPrivateOrLocalUrl(normalizedUrl)) {
    return res.status(400).json({ error: "URL kan inte vara en lokal eller privat adress" });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyAttempts = await db
    .select({ count: sql<number>`count(*)` })
    .from(onboardingSessions)
    .where(
      and(
        eq(onboardingSessions.userId, userId),
        gte(onboardingSessions.lastExtractionAt, today)
      )
    );
  if (Number(dailyAttempts[0]?.count || 0) >= 10) {
    return res.status(429).json({
      error: "daily_limit",
      message: "Max 10 analysfoersok per dag.",
    });
  }

  if (context !== "profile_edit" && sessionId) {
    const session = await db.query.onboardingSessions.findFirst({
      where: and(
        eq(onboardingSessions.id, sessionId),
        eq(onboardingSessions.userId, userId)
      ),
    });
    if (!session) {
      return res.status(404).json({ error: "Session hittades inte" });
    }
    if ((session.extractionAttempts || 0) >= 10) {
      return res.status(429).json({
        error: "too_many_attempts",
        message: "Max 10 forsok per session. Fyll i uppgifterna manuellt.",
      });
    }

    const isDifferentUrl = session.websiteUrl && session.websiteUrl !== normalizedUrl;
    await db
      .update(onboardingSessions)
      .set({
        extractionStatus: "scraping",
        websiteUrl: normalizedUrl,
        ...(isDifferentUrl ? { extractionAttempts: 0 } : {}),
        updatedAt: new Date(),
      })
      .where(eq(onboardingSessions.id, sessionId));
  }

  const startTime = Date.now();

  const { content, pagesScraped, errors } = await scrapeWebsite(normalizedUrl);

  if (!content || content.trim().length < 50) {
    if (sessionId && context !== "profile_edit") {
      await db
        .update(onboardingSessions)
        .set({
          extractionStatus: "failed",
          extractionAttempts: sql`${onboardingSessions.extractionAttempts} + 1`,
          lastExtractionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(onboardingSessions.id, sessionId));
    }
    return res.status(422).json({
      error: "website_unreachable",
      message: "Kunde inte hamta innehall fran webbplatsen.",
      suggestion: "Kontrollera att URL:en ar korrekt och att webbplatsen ar tillganglig.",
    });
  }

  if (sessionId && context !== "profile_edit") {
    await db
      .update(onboardingSessions)
      .set({ extractionStatus: "extracting", updatedAt: new Date() })
      .where(eq(onboardingSessions.id, sessionId));
  }

  console.log(`[Onboarding] Starting AI extraction for ${normalizedUrl}, scraped content length: ${content.length} chars`);
  const extractedData = await extractCompanyDataFromWebsite(content, normalizedUrl);
  const mappedProfile = mapExtractedDataToCompanyProfile(extractedData);
  const { found: fieldsFound, total: totalFields } = countExtractedFields(extractedData);
  const durationMs = Date.now() - startTime;

  console.log(`[Onboarding] Extraction result for ${normalizedUrl}: companyName=${extractedData.companyName}, sector=${extractedData.sector}, fieldsFound=${fieldsFound}/${totalFields}, duration=${durationMs}ms`);

  let status: "success" | "partial" | "failed" = "success";
  if (fieldsFound === 0) status = "failed";
  else if (fieldsFound < totalFields * 0.5) status = "partial";

  let message = "";
  if (status === "success") {
    message = `Vi hittade ${fieldsFound} av ${totalFields} uppgifter fran din webbplats.`;
  } else if (status === "partial") {
    message = `Vi hittade ${fieldsFound} av ${totalFields} uppgifter. Du behover fylla i resten manuellt.`;
  } else {
    message = "Kunde inte extrahera tillracklig information fran webbplatsen.";
  }

  if (sessionId && context !== "profile_edit") {
    const autoFields = Object.entries(extractedData)
      .filter(([k, v]) => v !== null && v !== undefined && !Array.isArray(v) && k !== "confidence" && k !== "extractedFrom" && k !== "extractionNotes")
      .map(([k]) => k);

    await db
      .update(onboardingSessions)
      .set({
        extractionStatus: status,
        rawExtractedData: extractedData as any,
        confidenceScores: extractedData.confidence as any,
        autoFilledFields: autoFields,
        extractionAttempts: sql`${onboardingSessions.extractionAttempts} + 1`,
        lastExtractionAt: new Date(),
        currentStep: status !== "failed" ? 3 : 2,
        updatedAt: new Date(),
      })
      .where(eq(onboardingSessions.id, sessionId));
  }

  return res.json({
    sessionId: sessionId || null,
    status,
    extractedData,
    mappedProfile,
    fieldsFound,
    totalFields,
    confidenceScores: extractedData.confidence,
    pagesScraped,
    message,
    durationMs,
  });
}

router.post("/onboarding/extract", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { sessionId, websiteUrl, context } = req.body;

    if (!websiteUrl) {
      return res.status(400).json({ error: "URL kravs" });
    }

    if (context !== "profile_edit" && !sessionId) {
      return res.status(400).json({ error: "sessionId kravs" });
    }

    return await performExtraction(req, res, userId, sessionId || null, websiteUrl, context);
  } catch (error: any) {
    console.error("Error extracting:", error);
    return res.status(500).json({ error: "Extraction failed", message: error.message });
  }
});

router.get("/onboarding/session", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const session = await db.query.onboardingSessions.findFirst({
      where: eq(onboardingSessions.userId, userId),
      orderBy: [desc(onboardingSessions.createdAt)],
    });

    if (!session) {
      return res.json({ session: null });
    }

    return res.json({ session });
  } catch (error: any) {
    console.error("Error getting session:", error);
    return res.status(500).json({ error: "Could not get session" });
  }
});

router.put("/onboarding/step", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { sessionId, step } = req.body;
    if (!sessionId || !step) {
      return res.status(400).json({ error: "sessionId and step required" });
    }

    const session = await db.query.onboardingSessions.findFirst({
      where: and(
        eq(onboardingSessions.id, sessionId),
        eq(onboardingSessions.userId, userId)
      ),
    });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const [updated] = await db
      .update(onboardingSessions)
      .set({ currentStep: step, updatedAt: new Date() })
      .where(eq(onboardingSessions.id, sessionId))
      .returning();

    return res.json({ session: updated });
  } catch (error: any) {
    console.error("Error updating step:", error);
    return res.status(500).json({ error: "Could not update step" });
  }
});

router.post("/onboarding/save-profile", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { sessionId, profileData, autoFilledFields, userEditedFields } = req.body;

    if (!profileData || !profileData.companyName) {
      console.log(`[Onboarding] save-profile rejected: missing companyName, profileData keys: ${profileData ? Object.keys(profileData).join(',') : 'null'}`);
      return res.status(400).json({ error: "Företagsnamn krävs" });
    }

    console.log(`[Onboarding] Saving profile for user ${userId}: companyName=${profileData.companyName}, industry=${profileData.industry}, location=${profileData.location}`);

    const existingCompany = await db.query.companies.findFirst({
      where: eq(companies.userId, userId),
    });

    let companyId: string;

    if (existingCompany) {
      const [updated] = await db
        .update(companies)
        .set({
          companyName: profileData.companyName,
          orgNumber: profileData.orgNumber || existingCompany.orgNumber,
          industry: profileData.industry || existingCompany.industry,
          employees: profileData.employees || existingCompany.employees,
          foundedYear: profileData.foundedYear || existingCompany.foundedYear,
          description: profileData.description || existingCompany.description,
          location: profileData.location || existingCompany.location,
          websiteUrl: profileData.websiteUrl || existingCompany.websiteUrl,
          focusAreas: profileData.focusAreas || existingCompany.focusAreas,
        })
        .where(eq(companies.id, existingCompany.id))
        .returning();
      companyId = updated.id;
    } else {
      const [created] = await db
        .insert(companies)
        .values({
          userId,
          companyName: profileData.companyName,
          orgNumber: profileData.orgNumber,
          industry: profileData.industry,
          employees: profileData.employees,
          foundedYear: profileData.foundedYear,
          description: profileData.description,
          location: profileData.location,
          websiteUrl: profileData.websiteUrl,
          focusAreas: profileData.focusAreas || [],
        })
        .returning();
      companyId = created.id;
    }

    if (sessionId) {
      await db
        .update(onboardingSessions)
        .set({
          companyId,
          currentStep: 4,
          autoFilledFields: autoFilledFields || [],
          userEditedFields: userEditedFields || [],
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(onboardingSessions.id, sessionId),
            eq(onboardingSessions.userId, userId)
          )
        );
    }

    const filledFields = [
      profileData.companyName,
      profileData.description,
      profileData.industry,
      profileData.employees,
      profileData.location,
      profileData.orgNumber,
      profileData.foundedYear,
      profileData.websiteUrl,
    ].filter(Boolean).length;

    const profileCompletion = Math.round((filledFields / 8) * 100);

    return res.json({ companyId, profileCompletion });
  } catch (error: any) {
    console.error("Error saving profile:", error);
    return res.status(500).json({ error: "Could not save profile" });
  }
});

router.post("/onboarding/save-goals", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { sessionId, goal, fundingRange, urgency } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });

    const session = await db.query.onboardingSessions.findFirst({
      where: and(
        eq(onboardingSessions.id, sessionId),
        eq(onboardingSessions.userId, userId)
      ),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });

    await db
      .update(onboardingSessions)
      .set({
        goalsData: { goal, fundingRange, urgency } as any,
        updatedAt: new Date(),
      })
      .where(eq(onboardingSessions.id, sessionId));

    return res.json({ success: true });
  } catch (error: any) {
    console.error("Error saving goals:", error);
    return res.status(500).json({ error: "Could not save goals" });
  }
});

router.post("/onboarding/save-notifications", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { sessionId, weeklyDigest, instantNotify, deadlineReminders } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });

    const session = await db.query.onboardingSessions.findFirst({
      where: and(
        eq(onboardingSessions.id, sessionId),
        eq(onboardingSessions.userId, userId)
      ),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });

    await db
      .update(onboardingSessions)
      .set({
        notificationPreferences: { weeklyDigest, instantNotify, deadlineReminders } as any,
        updatedAt: new Date(),
      })
      .where(eq(onboardingSessions.id, sessionId));

    return res.json({ success: true });
  } catch (error: any) {
    console.error("Error saving notifications:", error);
    return res.status(500).json({ error: "Could not save notification preferences" });
  }
});

router.post("/onboarding/complete", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { sessionId, extractionRating, extractionFeedback } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    const session = await db.query.onboardingSessions.findFirst({
      where: and(
        eq(onboardingSessions.id, sessionId),
        eq(onboardingSessions.userId, userId)
      ),
    });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    await db
      .update(onboardingSessions)
      .set({
        completedAt: new Date(),
        currentStep: 6,
        extractionRating: extractionRating || null,
        extractionFeedback: extractionFeedback || null,
        updatedAt: new Date(),
      })
      .where(eq(onboardingSessions.id, sessionId));

    return res.json({
      redirectTo: "/grants?firstVisit=true",
      matchesReady: false,
      message: "Onboarding klar! Du kan nu utforska bidrag som matchar ditt företag.",
    });
  } catch (error: any) {
    console.error("Error completing onboarding:", error);
    return res.status(500).json({ error: "Could not complete onboarding" });
  }
});

router.post("/onboarding/skip", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { sessionId } = req.body;

    if (sessionId) {
      await db
        .update(onboardingSessions)
        .set({ skippedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(onboardingSessions.id, sessionId),
            eq(onboardingSessions.userId, userId)
          )
        );
    }

    return res.json({ redirectTo: "/dashboard" });
  } catch (error: any) {
    console.error("Error skipping onboarding:", error);
    return res.status(500).json({ error: "Could not skip onboarding" });
  }
});

router.post("/onboarding/retry-extraction", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { sessionId, websiteUrl } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    const session = await db.query.onboardingSessions.findFirst({
      where: and(
        eq(onboardingSessions.id, sessionId),
        eq(onboardingSessions.userId, userId)
      ),
    });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const url = websiteUrl || session.websiteUrl;
    if (!url) {
      return res.status(400).json({ error: "No website URL to retry" });
    }

    return await performExtraction(req, res, userId, sessionId, url);
  } catch (error: any) {
    console.error("Error retrying extraction:", error);
    return res.status(500).json({ error: "Could not retry extraction" });
  }
});

export default router;
