import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { contentLibrary, applications, companies } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  extractContentBlocks,
  saveExtractedBlocks,
  findRelevantContentBlocks,
  getLibraryBlocks,
  recordBlockUsage,
} from "../services/contentLibrary";
import { isAuthenticated } from "../replit_integrations/auth";

const router = Router();

router.get("/api/content-library", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.userId, userId))
      .limit(1);
    if (!company[0]) return res.json([]);

    const blocks = await getLibraryBlocks(userId, company[0].id, {
      contentType: req.query.contentType as string | undefined,
      language: req.query.language as string | undefined,
      tags: req.query.tags
        ? (req.query.tags as string).split(",")
        : undefined,
      search: req.query.search as string | undefined,
    });
    res.json(blocks);
  } catch (error) {
    console.error("Error fetching content library:", error);
    res.status(500).json({ error: "Failed to fetch content library" });
  }
});

const createBlockSchema = z.object({
  contentType: z.string(),
  title: z.string().min(1),
  content: z.string().min(1),
  language: z.string().default("sv"),
  tags: z.array(z.string()).default([]),
});

router.post("/api/content-library", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.userId, userId))
      .limit(1);
    if (!company[0])
      return res.status(400).json({ error: "No company profile" });

    const data = createBlockSchema.parse(req.body);
    const wordCount = data.content.split(/\s+/).length;

    const [block] = await db
      .insert(contentLibrary)
      .values({
        userId,
        companyId: company[0].id,
        contentType: data.contentType,
        title: data.title,
        content: data.content,
        wordCount,
        language: data.language,
        tags: data.tags,
        isApproved: true,
      })
      .returning();

    res.json(block);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error creating content block:", error);
    res.status(500).json({ error: "Failed to create content block" });
  }
});

const updateBlockSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  isApproved: z.boolean().optional(),
});

router.put(
  "/api/content-library/:id",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const existing = await db
        .select()
        .from(contentLibrary)
        .where(
          and(
            eq(contentLibrary.id, req.params.id),
            eq(contentLibrary.userId, userId),
            eq(contentLibrary.isDeleted, false)
          )
        )
        .limit(1);

      if (!existing[0]) return res.status(404).json({ error: "Not found" });

      const data = updateBlockSchema.parse(req.body);
      const updateData: any = { ...data, updatedAt: new Date() };

      if (data.content) {
        updateData.wordCount = data.content.split(/\s+/).length;
      }

      const [updated] = await db
        .update(contentLibrary)
        .set(updateData)
        .where(eq(contentLibrary.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating content block:", error);
      res.status(500).json({ error: "Failed to update content block" });
    }
  }
);

router.delete(
  "/api/content-library/:id",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const existing = await db
        .select()
        .from(contentLibrary)
        .where(
          and(
            eq(contentLibrary.id, req.params.id),
            eq(contentLibrary.userId, userId)
          )
        )
        .limit(1);

      if (!existing[0]) return res.status(404).json({ error: "Not found" });

      await db
        .update(contentLibrary)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(contentLibrary.id, req.params.id));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting content block:", error);
      res.status(500).json({ error: "Failed to delete content block" });
    }
  }
);

router.post(
  "/api/content-library/extract/:applicationId",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const appId = req.params.applicationId;

      const [app] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, appId))
        .limit(1);

      if (!app) return res.status(404).json({ error: "Application not found" });

      const company = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.id, app.companyId!),
            eq(companies.userId, userId)
          )
        )
        .limit(1);

      if (!company[0])
        return res.status(403).json({ error: "Not authorized" });

      const extracted = await extractContentBlocks(app, company[0]);
      const saved = await saveExtractedBlocks(
        extracted,
        appId,
        userId,
        company[0].id
      );

      res.json({ extracted: saved.length, blocks: saved });
    } catch (error) {
      console.error("Error extracting content:", error);
      res.status(500).json({ error: "Failed to extract content" });
    }
  }
);

router.post(
  "/api/content-library/:id/approve",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const [updated] = await db
        .update(contentLibrary)
        .set({ isApproved: true, updatedAt: new Date() })
        .where(
          and(
            eq(contentLibrary.id, req.params.id),
            eq(contentLibrary.userId, userId),
            eq(contentLibrary.isDeleted, false)
          )
        )
        .returning();

      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error approving content block:", error);
      res.status(500).json({ error: "Failed to approve content block" });
    }
  }
);

router.get(
  "/api/content-library/suggestions/:sectionKey",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.userId, userId))
        .limit(1);

      if (!company[0]) return res.json([]);

      const language = (req.query.language as string) || "sv";
      const blocks = await findRelevantContentBlocks(
        req.params.sectionKey,
        company[0].id,
        language
      );

      res.json(blocks);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      res.status(500).json({ error: "Failed to fetch suggestions" });
    }
  }
);

router.post(
  "/api/content-library/:id/use",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { applicationId, sectionKey } = req.body;

      const [block] = await db
        .select()
        .from(contentLibrary)
        .where(
          and(
            eq(contentLibrary.id, req.params.id),
            eq(contentLibrary.userId, userId),
            eq(contentLibrary.isDeleted, false)
          )
        )
        .limit(1);

      if (!block) return res.status(404).json({ error: "Not found" });

      if (applicationId && sectionKey) {
        await recordBlockUsage(block.id, applicationId, sectionKey);
      }

      res.json(block);
    } catch (error) {
      console.error("Error using content block:", error);
      res.status(500).json({ error: "Failed to use content block" });
    }
  }
);

export default router;
