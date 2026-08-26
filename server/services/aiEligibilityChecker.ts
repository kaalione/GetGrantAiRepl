import { anthropic } from "../lib/anthropic";
import type { Grant, Company, EligibilityCheckResult, EligibilityCriterion } from "@shared/schema";
import { checkEligibility as checkStructuredEligibility } from "./eligibilityChecker";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isCacheValid(checkedAt: Date | null): boolean {
  if (!checkedAt) return false;
  return Date.now() - new Date(checkedAt).getTime() < CACHE_TTL_MS;
}

export async function runEligibilityCheck(
  grant: Grant,
  company: Company
): Promise<{ result: EligibilityCheckResult; source: string }> {
  const structuredResult = checkStructuredEligibility(company, grant);

  if (structuredResult.checksCompleted > 0) {
    const converted = convertLegacyToNew(structuredResult);

    if (converted.score >= 70 || converted.blockers.length > 0 || structuredResult.checksCompleted >= 3) {
      return { result: converted, source: "structured" };
    }

    try {
      const aiResult = await checkWithAI(grant, company);
      const merged = mergeResults(converted, aiResult);
      return { result: merged, source: "mixed" };
    } catch (e) {
      console.error("AI eligibility check failed, using structured only:", e);
      return { result: converted, source: "structured" };
    }
  }

  try {
    const aiResult = await checkWithAI(grant, company);
    return { result: aiResult, source: "ai" };
  } catch (e) {
    console.error("AI eligibility check failed entirely:", e);
    return {
      result: {
        verdict: "unknown",
        score: 50,
        criteria: [],
        summary: "Kunde inte bedöma behörighet. Kontrollera bidragskraven manuellt.",
        blockers: [],
        warnings: [],
        strengths: [],
      },
      source: "none",
    };
  }
}

function convertLegacyToNew(legacy: ReturnType<typeof checkStructuredEligibility>): EligibilityCheckResult {
  const criteria: EligibilityCriterion[] = legacy.checks.map((c) => ({
    name: formatCriterionName(c.criterion),
    requirement: c.requiredValue || c.details,
    companyValue: c.companyValue || "Ej angivet",
    status: c.status === "met" ? "pass" : c.status === "not_met" ? "fail" : c.status === "partially_met" ? "warning" : "unknown",
    explanation: c.details,
  }));

  const blockers = legacy.checks
    .filter((c) => c.status === "not_met" && c.category === "hard")
    .map((c) => c.actionRequired || c.details);

  const warnings = legacy.checks
    .filter((c) => c.status === "unknown" || c.status === "partially_met")
    .map((c) => c.actionRequired || c.details);

  const strengths = legacy.checks
    .filter((c) => c.status === "met")
    .map((c) => c.details);

  let verdict: EligibilityCheckResult["verdict"];
  if (legacy.overallStatus === "eligible") verdict = "eligible";
  else if (legacy.overallStatus === "not_eligible") verdict = "ineligible";
  else if (legacy.overallStatus === "almost_eligible") verdict = "partial";
  else verdict = "unknown";

  let summary = "";
  if (verdict === "eligible") {
    summary = `Ditt företag uppfyller de krav som kan kontrolleras.${warnings.length > 0 ? ` Kontrollera: ${warnings[0]}` : ""}`;
  } else if (verdict === "ineligible") {
    summary = `Ditt företag uppfyller troligen inte kraven. ${blockers[0] || ""}`;
  } else if (verdict === "partial") {
    summary = `Ditt företag kan vara behörigt, men det finns oklarheter att kontrollera.`;
  } else {
    summary = "Kunde inte avgöra behörighet med tillgänglig information. Fyll i din företagsprofil för bättre resultat.";
  }

  return {
    verdict,
    score: legacy.score,
    criteria,
    summary,
    blockers,
    warnings,
    strengths,
  };
}

function formatCriterionName(key: string): string {
  const labels: Record<string, string> = {
    org_type: "Organisationstyp",
    company_size: "Företagsstorlek",
    revenue: "Omsättning",
    geography: "Geografi",
    sector: "Bransch",
    company_age: "Företagsålder",
    collaboration: "Samarbete",
    co_financing: "Medfinansiering",
  };
  return labels[key] || key;
}

async function checkWithAI(grant: Grant, company: Company): Promise<EligibilityCheckResult> {
  const prompt = `Analysera om detta företag är behörigt för detta bidrag.

BIDRAG:
Titel: ${grant.title}
Källa: ${grant.sourceName}
Beskrivning: ${(grant.description || "").slice(0, 2000)}
Behörighetskrav: ${grant.eligibilityCriteria ? JSON.stringify(grant.eligibilityCriteria).slice(0, 1500) : "Ej specificerat"}
Max belopp: ${grant.amountMax || "Ej specificerat"}

FÖRETAG:
Namn: ${company.companyName}
Bransch: ${company.industry || "Ej angivet"}
Anställda: ${company.employees || "Ej angivet"}
Omsättning: ${company.revenue ? Number(company.revenue).toLocaleString("sv-SE") + " SEK" : "Ej angivet"}
Plats: ${company.location || "Ej angivet"}
Organisationstyp: ${company.orgType || "Ej angivet"}
Grundat: ${company.foundedYear || "Ej angivet"}
Beskrivning: ${(company.description || "").slice(0, 500)}
Fokusområden: ${company.focusAreas?.join(", ") || "Ej angivet"}

Svara med enbart giltig JSON i denna struktur:
{
  "verdict": "eligible" | "partial" | "ineligible" | "unknown",
  "score": 0-100,
  "criteria": [
    {
      "name": "kriteriets namn",
      "requirement": "vad bidraget kräver",
      "companyValue": "företagets värde",
      "status": "pass" | "fail" | "warning" | "unknown",
      "explanation": "1 mening förklaring på svenska"
    }
  ],
  "summary": "1-2 meningar på svenska",
  "blockers": ["hårda hinder som diskvalificerar"],
  "warnings": ["mjuka varningar att kontrollera"],
  "strengths": ["styrkor i ansökan"]
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
    system: "Du är en svensk bidragsexpert. Analysera om företaget uppfyller bidragskraven. Svara ENBART med giltig JSON, ingen prosa.",
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in AI response");

  const parsed = JSON.parse(jsonMatch[0]) as EligibilityCheckResult;
  parsed.verdict = ["eligible", "partial", "ineligible", "unknown"].includes(parsed.verdict) ? parsed.verdict : "unknown";
  parsed.score = Math.max(0, Math.min(100, parsed.score || 50));
  parsed.criteria = parsed.criteria || [];
  parsed.summary = parsed.summary || "";
  parsed.blockers = parsed.blockers || [];
  parsed.warnings = parsed.warnings || [];
  parsed.strengths = parsed.strengths || [];
  return parsed;
}

function mergeResults(structured: EligibilityCheckResult, ai: EligibilityCheckResult): EligibilityCheckResult {
  const structuredKeys = new Set(structured.criteria.map((c) => c.name.toLowerCase()));
  const additionalCriteria = ai.criteria.filter((c) => !structuredKeys.has(c.name.toLowerCase()));

  return {
    verdict: structured.blockers.length > 0 ? "ineligible" : ai.verdict,
    score: structured.blockers.length > 0
      ? structured.score
      : Math.round(structured.score * 0.6 + ai.score * 0.4),
    criteria: [...structured.criteria, ...additionalCriteria],
    summary: ai.summary || structured.summary,
    blockers: [...new Set([...structured.blockers, ...ai.blockers])],
    warnings: [...new Set([...structured.warnings, ...ai.warnings])],
    strengths: [...new Set([...structured.strengths, ...ai.strengths])],
  };
}
