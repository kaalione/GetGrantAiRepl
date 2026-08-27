import { Router, type Request, type Response } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { db } from "../db";
import { companies, searchProfiles, users, type SearchProfile } from "@shared/schema";
import { and, eq, desc } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { requirePlan } from "../middleware/plan-check";
import { aiGenerationLimiter } from "../middleware/rate-limit";
import {
  listActiveProfiles,
  createProjectProfile,
  archiveProfile,
  projectProfileLimit,
} from "../services/searchProfiles";

const router = Router();

// Project documents are sensitive (pitch decks) — stored OUTSIDE uploads/,
// which is served statically. No public URL; the stored path is for
// traceability and future authorized download.
const projectDocsDir = path.join(process.cwd(), "private-uploads", "project-docs");
if (!fs.existsSync(projectDocsDir)) {
  fs.mkdirSync(projectDocsDir, { recursive: true });
}

const uploadProjectDoc = multer({
  storage: multer.diskStorage({
    destination: projectDocsDir,
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || ".pdf"}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Endast PDF stöds för närvarande"));
  },
});

const createProfileSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(4000).optional().nullable(),
  goals: z.string().max(4000).optional().nullable(),
  focusAreas: z.array(z.string().max(80)).max(20).optional().nullable(),
  keywords: z.array(z.string().max(60)).max(30).optional().nullable(),
  budgetSek: z.number().int().nonnegative().max(1_000_000_000).optional().nullable(),
  timeframe: z.string().max(120).optional().nullable(),
  // Document-extraction flow: the confirmed proposal's provenance.
  createdFrom: z.enum(["wizard", "document"]).optional(),
  sourceDocumentPath: z.string().max(300).optional().nullable(),
  extraction: z.record(z.string(), z.unknown()).optional().nullable(),
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

    const profiles = await listActiveProfiles(userId, companyId);
    res.json(profiles);
  } catch (error) {
    console.error("Failed to list search profiles:", error);
    res.status(500).json({ error: "Kunde inte hämta sökprofiler" });
  }
});

// Extract a project proposal from an uploaded PDF (pitch deck, project
// plan). Returns a PROPOSAL for the user to review — nothing is saved here;
// the confirmed profile is created via POST /profiles with the extraction
// attached. Pro+ only; counts against the daily AI generation limit.
router.post(
  "/profiles/extract-document",
  isAuthenticated,
  requirePlan("pro"),
  aiGenerationLimiter,
  (req: any, res: Response, next) => {
    uploadProjectDoc.single("document")(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "Uppladdningen misslyckades" });
      next();
    });
  },
  async (req: any, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Ingen fil bifogad" });

      const { extractTextFromPdf, extractProjectFromText } = await import("../services/projectExtractor");
      const buffer = fs.readFileSync(req.file.path);
      const { text, pages } = await extractTextFromPdf(buffer);

      if (text.trim().length < 100) {
        return res.status(422).json({
          error: "Kunde inte läsa tillräckligt med text ur dokumentet",
          message: "PDF:en verkar sakna textinnehåll (skannad bild?). Fyll i fälten manuellt istället.",
        });
      }

      const extraction = await extractProjectFromText(text);

      res.json({
        proposal: extraction,
        sourceDocumentPath: path.relative(process.cwd(), req.file.path),
        pages,
      });
    } catch (error) {
      console.error("Project extraction failed:", error);
      res.status(500).json({ error: "Extraktionen misslyckades. Försök igen eller fyll i manuellt." });
    }
  }
);

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

    const result = await createProjectProfile(
      {
        companyId: data.companyId,
        userId,
        name: data.name,
        description: data.description,
        goals: data.goals,
        focusAreas: data.focusAreas,
        keywords: data.keywords,
        budgetSek: data.budgetSek,
        timeframe: data.timeframe,
        createdFrom: data.createdFrom,
        sourceDocumentUrl: data.sourceDocumentPath,
        extraction: data.extraction as Record<string, unknown> | null | undefined,
      },
      plan
    );

    if (!result.ok) {
      return res.status(403).json({
        error: "Plangräns nådd",
        message:
          plan === "free"
            ? "Projektprofiler kräver Pro. Uppgradera för att söka bidrag till specifika projekt."
            : `Din plan tillåter ${projectProfileLimit(plan)} projektprofiler. Arkivera en profil eller uppgradera.`,
        upgrade: plan !== "enterprise",
      });
    }

    res.status(201).json(result.profile);
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

    await archiveProfile(profile.id);
    res.json({ archived: true });
  } catch (error) {
    console.error("Failed to archive search profile:", error);
    res.status(500).json({ error: "Kunde inte arkivera sökprofil" });
  }
});

export default router;
