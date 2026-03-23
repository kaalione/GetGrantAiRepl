import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { contentLibrary, contentLibraryUsage } from "@shared/schema";
import type { ContentBlock, Application, Company, Grant } from "@shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface ExtractedContent {
  contentType: string;
  title: string;
  content: string;
  language: string;
  tags: string[];
  qualityNote?: string;
}

const CONTENT_TYPES = [
  'company_description',
  'team_overview',
  'problem_statement',
  'market_analysis',
  'technology_description',
  'impact_statement',
  'budget_approach',
  'sustainability_plan',
  'custom',
] as const;

const SECTION_TYPE_MAPPING: Record<string, string[]> = {
  background_and_need: ['problem_statement', 'market_analysis'],
  project_description: ['technology_description', 'company_description'],
  team_and_capacity: ['team_overview'],
  expected_results: ['impact_statement'],
  sustainability: ['sustainability_plan'],
  company_description: ['company_description'],
  executive_summary: ['company_description', 'problem_statement'],
  budget_justification: ['budget_approach'],
  market_and_competition: ['market_analysis'],
  innovation_description: ['technology_description'],
  impact_and_results: ['impact_statement'],
  team_description: ['team_overview'],
  problem_and_need: ['problem_statement', 'market_analysis'],
};

export async function extractContentBlocks(
  application: Application,
  company: Company
): Promise<ExtractedContent[]> {
  const sections = application.sections || [];
  if (sections.length === 0) return [];

  const fullText = sections
    .map((s) => `[${s.sectionKey}]\n${s.content}`)
    .join("\n\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      system:
        "You extract reusable content blocks from grant applications. Respond with JSON only.",
      messages: [
        {
          role: "user",
          content: `Extract reusable content blocks from this grant application.
For each block, extract content that could be reused in future applications 
with minimal editing. Focus on evergreen content about the company, team, 
technology, and problem — NOT grant-specific content like budget justifications 
or timelines.

APPLICATION:
${fullText}

COMPANY: ${company.companyName} | ${company.industry || ""}

Extract blocks in JSON array:
[
  {
    "contentType": "company_description" | "team_overview" | "problem_statement" | 
                   "market_analysis" | "technology_description" | "impact_statement" | 
                   "sustainability_plan",
    "title": "Short descriptive name for this block",
    "content": "The extracted reusable text",
    "language": "sv" | "en",
    "tags": ["relevant", "tags"],
    "qualityNote": "Brief note on what makes this reusable / what would need editing"
  }
]

Only extract blocks that are:
1. At least 50 words long
2. About the company/project in general (not grant-specific)
3. Well-written enough to reuse
Return empty array if no good reusable content found.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "[]";
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b: any) =>
        b.contentType &&
        b.title &&
        b.content &&
        b.content.split(/\s+/).length >= 30
    );
  } catch (error) {
    console.error("Content extraction failed:", error);
    return [];
  }
}

export async function saveExtractedBlocks(
  blocks: ExtractedContent[],
  applicationId: string,
  userId: string,
  companyId: string
): Promise<ContentBlock[]> {
  const saved: ContentBlock[] = [];
  for (const block of blocks) {
    const wordCount = block.content.split(/\s+/).length;
    const [inserted] = await db
      .insert(contentLibrary)
      .values({
        userId,
        companyId,
        contentType: block.contentType,
        title: block.title,
        content: block.content,
        wordCount,
        language: block.language || "sv",
        tags: block.tags || [],
        sourceApplicationId: applicationId,
        isApproved: false,
      })
      .returning();
    saved.push(inserted);
  }
  return saved;
}

export async function findRelevantContentBlocks(
  sectionKey: string,
  companyId: string,
  language: string = "sv"
): Promise<ContentBlock[]> {
  const blocks = await db
    .select()
    .from(contentLibrary)
    .where(
      and(
        eq(contentLibrary.companyId, companyId),
        eq(contentLibrary.isApproved, true),
        eq(contentLibrary.isDeleted, false)
      )
    )
    .orderBy(desc(contentLibrary.usageCount), desc(contentLibrary.updatedAt))
    .limit(10);

  const relevantTypes = SECTION_TYPE_MAPPING[sectionKey] || [];
  if (relevantTypes.length === 0) return blocks.slice(0, 3);

  const matched = blocks.filter((b) => relevantTypes.includes(b.contentType));
  return matched.length > 0 ? matched : [];
}

export async function recordBlockUsage(
  contentId: string,
  applicationId: string,
  sectionKey: string
): Promise<void> {
  await db.insert(contentLibraryUsage).values({
    contentId,
    applicationId,
    sectionKey,
  });
  await db
    .update(contentLibrary)
    .set({
      usageCount: sql`${contentLibrary.usageCount} + 1`,
      lastUsedAt: new Date(),
    })
    .where(eq(contentLibrary.id, contentId));
}

export async function getLibraryBlocks(
  userId: string,
  companyId: string,
  filters?: {
    contentType?: string;
    language?: string;
    tags?: string[];
    search?: string;
  }
): Promise<ContentBlock[]> {
  const conditions = [
    eq(contentLibrary.userId, userId),
    eq(contentLibrary.companyId, companyId),
    eq(contentLibrary.isDeleted, false),
  ];

  let blocks = await db
    .select()
    .from(contentLibrary)
    .where(and(...conditions))
    .orderBy(desc(contentLibrary.isApproved), desc(contentLibrary.usageCount), desc(contentLibrary.updatedAt));

  if (filters?.contentType) {
    blocks = blocks.filter((b) => b.contentType === filters.contentType);
  }
  if (filters?.language) {
    blocks = blocks.filter((b) => b.language === filters.language);
  }
  if (filters?.tags && filters.tags.length > 0) {
    blocks = blocks.filter((b) =>
      filters.tags!.some((t) => b.tags?.includes(t))
    );
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    blocks = blocks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.content.toLowerCase().includes(q)
    );
  }

  return blocks;
}
