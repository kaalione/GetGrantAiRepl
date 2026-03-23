import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { grants } from "@shared/schema";
import { eq, isNull, and, or, sql, inArray } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface EligibilityCriteria {
  company_types: string[];
  company_sizes: {
    min_employees: number | null;
    max_employees: number | null;
    size_category: string[];
    description: string;
  };
  revenue: {
    max_turnover_msek: number | null;
    max_balance_msek: number | null;
    description: string;
  };
  geography: {
    regions: string[];
    counties: string[];
    eu_countries: boolean;
    description: string;
  };
  sectors: string[];
  company_age: {
    min_years: number | null;
    max_years: number | null;
    description: string;
  };
  collaboration_required: {
    required: boolean;
    partner_types: string[];
    description: string;
  };
  other_requirements: string[];
  who_cannot_apply: string[];
  funding_details: {
    min_amount: number | null;
    max_amount: number | null;
    co_financing_required: boolean;
    co_financing_percentage: number | null;
    description: string;
  };
  confidence_score: number;
  extraction_date: string;
  extraction_source: string;
  source_text_used: string;
}

const EXTRACTION_PROMPT = `You extract eligibility criteria from Swedish/Nordic grant descriptions.
Return ONLY valid JSON — no explanation, no markdown, no preamble.

SCHEMA (all fields required — use the EXACT structure below):
{
  "company_types": string[],
  "company_sizes": {
    "min_employees": number|null,
    "max_employees": number|null,
    "size_category": string[],
    "description": string
  },
  "revenue": {
    "max_turnover_msek": number|null,
    "max_balance_msek": number|null,
    "description": string
  },
  "geography": {
    "regions": string[],
    "counties": string[],
    "eu_countries": boolean,
    "description": string
  },
  "sectors": string[],
  "company_age": {
    "min_years": number|null,
    "max_years": number|null,
    "description": string
  },
  "collaboration_required": {
    "required": boolean,
    "partner_types": string[],
    "description": string
  },
  "other_requirements": string[],
  "who_cannot_apply": string[],
  "funding_details": {
    "min_amount": number|null,
    "max_amount": number|null,
    "co_financing_required": boolean,
    "co_financing_percentage": number|null,
    "description": string
  },
  "confidence_score": number,
  "extraction_source": string,
  "source_text_used": string
}

FIELD GUIDELINES:
- company_types: e.g. ["aktiebolag","ekonomisk_forening"]. Use [] if all org types eligible.
  Valid values: aktiebolag, handelsbolag, enskild_firma, kommanditbolag,
  ekonomisk_forening, ideell_forening, stiftelse, kommun, region,
  statlig_myndighet, universitet, forskningsinstitut, privatperson
- company_sizes.size_category: ["micro","small","medium","large"]. Use [] if no restriction.
- geography.regions: Swedish region names, or ["hela_sverige"], ["eu"], ["norden"]. Use [] if unclear.
- geography.eu_countries: true if open to EU-wide applicants.
- sectors: Industry sectors explicitly mentioned. Use [] if open to all.
  Valid values: tech, cleantech, energy, manufacturing, agriculture, food,
  health, life_science, culture, creative, transport, construction, digital,
  ai, space, defense, education, social, environment, forestry, maritime, tourism, retail
- description fields: Brief summary of what was found. Use "" if nothing relevant.
- source_text_used: Copy the most relevant sentence about eligibility (max 200 chars).
- extraction_source: "eligibility_criteria", "description", or "combined".

CONFIDENCE SCORE CALIBRATION:
  0.9–1.0: Explicit eligibility section with clear size limits, sector, geography, company type.
  0.7–0.89: Most key fields present. Some ambiguity in one or two fields.
  0.5–0.69: Partial information. Key fields inferred from context, not explicitly stated.
  0.3–0.49: Very little eligibility detail. Only geography or org type clear.
  0.1–0.29: Almost no extractable eligibility. Description is a stub or title echo.
  0.0: Cannot extract anything useful. Return valid JSON with null/[] for all fields.

IMPORTANT RULES:
- Never guess. If a field is not mentioned, use null (numbers) or [] (arrays) or "" (strings).
- "Svenska företag" / "Swedish companies" → geography.regions = ["hela_sverige"], company_types = [].
- "SME" / "SMF" → company_sizes.size_category = ["micro","small","medium"], max_employees = 249.
- "Startup" → company_sizes.size_category = ["micro","small"], company_age.max_years = 5.
- Text may be in Swedish OR English. Handle both languages.
- Swedish vocabulary: behörig=eligible, sökande=applicant, företag=company,
  omsättning=revenue, anställda=employees, bidrag=grant, stöd=support.
- Return [] not null for array fields. Return null not 0 for unmentioned numbers.
- If the text is just a title echo or navigation stub, set confidence_score to 0.0.`;

function isVinnovaMetadataOnly(eligibilityCriteria: Record<string, unknown> | null): boolean {
  if (!eligibilityCriteria) return false;
  const keys = Object.keys(eligibilityCriteria);
  const metadataKeys = ['public', 'diarienummer', 'text', 'raw_text'];
  if (keys.length <= 3 && keys.every(k => metadataKeys.includes(k))) {
    return true;
  }
  if (keys.length === 1 && keys[0] === 'text' && typeof eligibilityCriteria.text === 'string' && (eligibilityCriteria.text as string).length < 20) {
    return true;
  }
  return false;
}

function buildInputText(
  title: string,
  description: string,
  sourceName: string,
  targetGroup: string[] | null,
  keywords: string[] | null,
  amountMin: string | null,
  amountMax: string | null,
  eligibilityCriteria: Record<string, unknown> | null
): string {
  const parts: string[] = [
    `BIDRAGSTITEL: ${title}`,
    `KÄLLA: ${sourceName}`,
  ];

  const skipEligCriteria = sourceName === 'Vinnova' && isVinnovaMetadataOnly(eligibilityCriteria);

  if (eligibilityCriteria && !skipEligCriteria) {
    const eligText = typeof eligibilityCriteria === 'object'
      ? (eligibilityCriteria as any).text || (eligibilityCriteria as any).raw_text || JSON.stringify(eligibilityCriteria)
      : String(eligibilityCriteria);
    if (eligText && eligText.length > 10) {
      parts.push(`BEHÖRIGHETSKRITERIER (rå data):\n${String(eligText).substring(0, 2000)}`);
    }
  }

  if (description) {
    parts.push(`BESKRIVNING:\n${description.substring(0, 3000)}`);
  }

  if (targetGroup?.length) {
    parts.push(`MÅLGRUPP: ${targetGroup.join(', ')}`);
  }
  if (keywords?.length) {
    parts.push(`NYCKELORD: ${keywords.join(', ')}`);
  }
  if (amountMin || amountMax) {
    parts.push(`BELOPP: ${amountMin ? `Från ${amountMin}` : ''} ${amountMax ? `Till ${amountMax}` : ''} SEK`);
  }

  return parts.filter(Boolean).join('\n\n');
}

export async function extractEligibility(
  title: string,
  description: string,
  sourceName: string,
  targetGroup: string[] | null,
  keywords: string[] | null,
  amountMin: string | null,
  amountMax: string | null,
  eligibilityCriteria?: Record<string, unknown> | null
): Promise<EligibilityCriteria | null> {
  const textToAnalyze = buildInputText(
    title, description, sourceName, targetGroup, keywords, amountMin, amountMax,
    eligibilityCriteria || null
  );

  if (textToAnalyze.length < 80) {
    console.log(`  Skipping ${title} — too little text (${textToAnalyze.length} chars)`);
    return null;
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\n---\n\nTEXT ATT ANALYSERA:\n\n${textToAnalyze.substring(0, 5000)}`,
        },
      ],
    });

    const firstBlock = message.content?.[0];
    const responseText =
      firstBlock && firstBlock.type === "text" ? firstBlock.text : "";

    let cleanJson = responseText.trim();
    cleanJson = cleanJson.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");

    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`  No JSON found in response for: ${title}`);
      return null;
    }

    const criteria: EligibilityCriteria = JSON.parse(jsonMatch[0]);
    criteria.extraction_date = new Date().toISOString();
    criteria.confidence_score = Math.min(
      1,
      Math.max(0, criteria.confidence_score || 0)
    );

    if (!criteria.extraction_source) {
      criteria.extraction_source = eligibilityCriteria ? "combined" : "description";
    }

    return criteria;
  } catch (error) {
    console.error(`  Error extracting eligibility for "${title}":`, error);
    return null;
  }
}

export async function extractAndSaveForGrant(grantId: string): Promise<{
  success: boolean;
  criteria?: EligibilityCriteria;
  error?: string;
}> {
  const [grant] = await db
    .select()
    .from(grants)
    .where(eq(grants.id, grantId))
    .limit(1);

  if (!grant) {
    return { success: false, error: "Grant not found" };
  }

  const criteria = await extractEligibility(
    grant.title,
    grant.description,
    grant.sourceName,
    grant.targetGroup,
    grant.keywords,
    grant.amountMin,
    grant.amountMax,
    grant.eligibilityCriteria
  );

  if (!criteria) {
    return { success: false, error: "Could not extract eligibility (too little text or parse error)" };
  }

  await db
    .update(grants)
    .set({
      structuredEligibility: criteria as unknown as Record<string, unknown>,
      eligibilityExtractedAt: new Date(),
    })
    .where(eq(grants.id, grantId));

  return { success: true, criteria };
}

export async function processAllGrants(options?: {
  batchSize?: number;
  delayBetweenBatchesMs?: number;
  onlyOpen?: boolean;
  forceReprocess?: boolean;
  maxGrants?: number;
  prioritySources?: string[];
}): Promise<{
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
}> {
  const {
    batchSize = 3,
    delayBetweenBatchesMs = 15000,
    onlyOpen = true,
    forceReprocess = false,
    maxGrants = 50,
    prioritySources = [],
  } = options || {};

  console.log("=".repeat(60));
  console.log("AI ELIGIBILITY EXTRACTION → structured_eligibility");
  console.log(`Batch size: ${batchSize}, Delay: ${delayBetweenBatchesMs}ms, Max: ${maxGrants}`);
  if (prioritySources.length > 0) {
    console.log(`Priority sources: ${prioritySources.join(', ')}`);
  }
  console.log("=".repeat(60));

  const conditions = [];

  if (!forceReprocess) {
    conditions.push(isNull(grants.structuredEligibility));
  }

  if (onlyOpen) {
    conditions.push(inArray(grants.status, ["open", "upcoming"]));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const priorityCaseWhen = prioritySources.length > 0
    ? sql`CASE ${sql.join(prioritySources.map((s, i) => sql`WHEN source_name ILIKE ${'%' + s + '%'} THEN ${i}`), sql` `)} ELSE ${prioritySources.length} END`
    : sql`0`;

  const grantsToProcess = await db
    .select()
    .from(grants)
    .where(whereClause)
    .orderBy(
      sql`CASE WHEN ${grants.eligibilityCriteria} IS NOT NULL AND length(${grants.eligibilityCriteria}::text) > 10 THEN 0 ELSE 1 END`,
      sql`${grants.deadline} ASC NULLS LAST`
    )
    .limit(maxGrants);

  console.log(`Found ${grantsToProcess.length} grants to process`);

  let processed = 0;
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < grantsToProcess.length; i += batchSize) {
    const batch = grantsToProcess.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(grantsToProcess.length / batchSize);

    console.log(
      `\nBatch ${batchNum}/${totalBatches} (grants ${i + 1}-${i + batch.length})`
    );

    const batchPromises = batch.map(async (grant) => {
      console.log(`  Processing: ${grant.title?.substring(0, 60)}...`);

      const criteria = await extractEligibility(
        grant.title,
        grant.description,
        grant.sourceName,
        grant.targetGroup,
        grant.keywords,
        grant.amountMin,
        grant.amountMax,
        grant.eligibilityCriteria
      );

      if (criteria) {
        try {
          await db
            .update(grants)
            .set({
              structuredEligibility: criteria as unknown as Record<string, unknown>,
              eligibilityExtractedAt: new Date(),
            })
            .where(eq(grants.id, grant.id));

          console.log(
            `  ✓ Saved: ${grant.title?.substring(0, 50)} (confidence: ${criteria.confidence_score})`
          );
          successful++;
        } catch (dbError) {
          console.error(`  DB error for ${grant.title}: ${dbError}`);
          failed++;
        }
      } else {
        skipped++;
      }

      processed++;
    });

    await Promise.all(batchPromises);

    if (i + batchSize < grantsToProcess.length) {
      console.log(
        `  Waiting ${delayBetweenBatchesMs / 1000}s before next batch...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, delayBetweenBatchesMs)
      );
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("EXTRACTION COMPLETE");
  console.log(
    `Total: ${processed}, Successful: ${successful}, Failed: ${failed}, Skipped: ${skipped}`
  );
  console.log("=".repeat(60));

  return { processed, successful, failed, skipped };
}

export async function getEligibilityStatus() {
  const [totalResult] = await db
    .select({ count: sql<string>`count(*)` })
    .from(grants);

  const [withRawResult] = await db
    .select({ count: sql<string>`count(*)` })
    .from(grants)
    .where(
      sql`eligibility_criteria IS NOT NULL AND length(eligibility_criteria::text) > 5`
    );

  const [withStructuredResult] = await db
    .select({ count: sql<string>`count(*)` })
    .from(grants)
    .where(sql`structured_eligibility IS NOT NULL`);

  const [openResult] = await db
    .select({ count: sql<string>`count(*)` })
    .from(grants)
    .where(inArray(grants.status, ["open", "upcoming"]));

  const [openWithStructuredResult] = await db
    .select({ count: sql<string>`count(*)` })
    .from(grants)
    .where(
      sql`status IN ('open', 'upcoming') AND structured_eligibility IS NOT NULL`
    );

  const [avgConfidenceResult] = await db
    .select({
      avg: sql<string>`AVG((structured_eligibility->>'confidence_score')::float)`,
    })
    .from(grants)
    .where(
      sql`structured_eligibility IS NOT NULL`
    );

  const bySource = await db
    .select({
      sourceName: grants.sourceName,
      total: sql<string>`count(*)`,
      withRaw: sql<string>`count(*) FILTER (WHERE eligibility_criteria IS NOT NULL AND length(eligibility_criteria::text) > 5)`,
      withStructured: sql<string>`count(*) FILTER (WHERE structured_eligibility IS NOT NULL)`,
    })
    .from(grants)
    .where(inArray(grants.status, ["open", "upcoming"]))
    .groupBy(grants.sourceName)
    .orderBy(sql`count(*) DESC`);

  const total = parseInt(totalResult.count);
  const withRaw = parseInt(withRawResult.count);
  const withStructured = parseInt(withStructuredResult.count);
  const open = parseInt(openResult.count);
  const openWithStructured = parseInt(openWithStructuredResult.count);

  return {
    total_grants: total,
    grants_with_raw_eligibility: withRaw,
    grants_with_structured_eligibility: withStructured,
    grants_without_any: total - withRaw,
    open_grants: open,
    open_with_structured: openWithStructured,
    average_confidence: parseFloat(avgConfidenceResult.avg) || 0,
    raw_coverage_pct: total > 0 ? Math.round((withRaw / total) * 100) : 0,
    structured_coverage_pct: total > 0 ? Math.round((withStructured / total) * 100) : 0,
    by_source: bySource.map(s => ({
      source: s.sourceName,
      total: parseInt(s.total),
      raw: parseInt(s.withRaw),
      structured: parseInt(s.withStructured),
    })),
  };
}
