import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { grants } from "@shared/schema";
import { eq, sql, and, or, isNull } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const RAW_DATA_TEXT_KEYS = [
  "Beskrivning", "BeskrivningEngelska", "description",
  "summary", "content", "abstract", "focusArea",
  "destinationDescription", "furtherInformation", "supportInfo",
];

const RAW_DATA_ARRAY_KEYS = ["tags", "keywords"];

function extractTextFromRawData(rawData: Record<string, unknown> | null): string | null {
  if (!rawData) return null;

  for (const key of RAW_DATA_TEXT_KEYS) {
    const val = rawData[key];
    if (typeof val === "string" && val.length >= 80) {
      return val.slice(0, 1000);
    }
  }

  const fragments: string[] = [];

  for (const key of RAW_DATA_TEXT_KEYS) {
    const val = rawData[key];
    if (typeof val === "string" && val.length >= 20) {
      fragments.push(val);
    }
  }

  for (const key of RAW_DATA_ARRAY_KEYS) {
    const val = rawData[key];
    if (Array.isArray(val) && val.length > 0) {
      fragments.push(val.join(", "));
    }
  }

  if (fragments.join(" ").length >= 80) {
    return fragments.join(". ").slice(0, 1000);
  }

  return null;
}

async function enrichWithAI(title: string, sourceName: string, url: string): Promise<string | null> {
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `You are enriching a grant database. Based on this grant title and source, write a 150-200 word description in Swedish explaining:
- What the grant funds
- Who can apply
- What types of projects are supported

Grant title: ${title}
Grant source: ${sourceName}
Grant URL: ${url}

Write only the description, no headers, in Swedish.`,
      }],
    });

    const block = message.content[0];
    if (block.type === "text" && block.text.length >= 50) {
      return block.text.trim();
    }
    return null;
  } catch (error) {
    console.error(`  AI error for "${title}":`, error instanceof Error ? error.message : error);
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enrichShortDescriptions(limit: number = 20): Promise<{
  total: number;
  enrichedFromRawData: number;
  enrichedFromAI: number;
  failed: number;
  skipped: number;
}> {
  const stats = { total: 0, enrichedFromRawData: 0, enrichedFromAI: 0, failed: 0, skipped: 0 };

  const rows = await db.select({
    id: grants.id,
    title: grants.title,
    description: grants.description,
    sourceName: grants.sourceName,
    url: grants.url,
    rawData: grants.rawData,
  })
    .from(grants)
    .where(
      and(
        sql`${grants.status} IN ('open', 'upcoming')`,
        or(
          isNull(grants.description),
          sql`LENGTH(${grants.description}) < 100`
        )
      )
    )
    .orderBy(sql`CASE ${grants.sourceName} WHEN 'Vinnova' THEN 1 WHEN 'Tillväxtverket' THEN 2 WHEN 'Almi' THEN 3 ELSE 4 END, LENGTH(COALESCE(${grants.description}, '')) ASC`)
    .limit(limit);

  stats.total = rows.length;
  console.log(`Found ${rows.length} grants needing enrichment`);

  for (let i = 0; i < rows.length; i++) {
    const grant = rows[i];
    console.log(`[${i + 1}/${rows.length}] "${grant.title}" (${grant.sourceName})`);

    const rawText = extractTextFromRawData(grant.rawData as Record<string, unknown> | null);

    if (rawText) {
      await db.update(grants)
        .set({ description: rawText, updatedAt: new Date() })
        .where(eq(grants.id, grant.id));
      stats.enrichedFromRawData++;
      console.log(`  ✓ Enriched from raw_data (${rawText.length} chars)`);
      continue;
    }

    const aiDescription = await enrichWithAI(grant.title, grant.sourceName, grant.url);

    if (aiDescription) {
      await db.update(grants)
        .set({ description: aiDescription, updatedAt: new Date() })
        .where(eq(grants.id, grant.id));
      stats.enrichedFromAI++;
      console.log(`  ✓ Enriched with AI (${aiDescription.length} chars)`);
    } else {
      stats.failed++;
      console.log(`  ✗ Failed to enrich`);
    }

    await sleep(1000);
  }

  console.log(`\nResults: ${stats.enrichedFromRawData} from raw_data, ${stats.enrichedFromAI} from AI, ${stats.failed} failed, ${stats.skipped} skipped`);
  return stats;
}

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith("--limit"));
let limit = 50;
if (limitArg) {
  const idx = args.indexOf(limitArg);
  if (limitArg.includes("=")) {
    limit = parseInt(limitArg.split("=")[1], 10);
  } else if (args[idx + 1]) {
    limit = parseInt(args[idx + 1], 10);
  }
}

console.log(`Starting grant description enrichment (limit: ${limit})...`);
enrichShortDescriptions(limit)
  .then((stats) => {
    console.log("\nDone!", JSON.stringify(stats, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
