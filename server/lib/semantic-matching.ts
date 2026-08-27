import { anthropic } from "./anthropic";
import type { Grant, Company } from "@shared/schema";

// Relevance side of the selected search profile. 'core' profiles behave as
// no profile at all (the company IS the relevance source).
export interface SemanticProfile {
  kind?: string | null;
  name?: string | null;
  description?: string | null;
  goals?: string | null;
  focusAreas?: string[] | null;
  keywords?: string[] | null;
  budgetSek?: number | null;
  timeframe?: string | null;
}

export interface SemanticMatchResult {
  score: number;
  reasoning: string;
  strengths: string[];
  concerns: string[];
  inputTokens: number;
  outputTokens: number;
  estimatedCostSEK: number;
}

export interface CombinedMatchResult {
  finalScore: number;
  basicScore: number;
  semanticScore: number;
  semantic: SemanticMatchResult;
  explanation: string;
}

export async function calculateSemanticMatch(
  company: Company,
  grant: Grant,
  profile?: SemanticProfile | null
): Promise<SemanticMatchResult> {
  const companyDescription = company.description || "";
  const companyIndustry = company.industry || "";
  const grantTitle = grant.title || "";
  const grantDescription = grant.description || "";
  const grantKeywords = grant.keywords || [];

  // A project profile splits the question in two: the COMPANY decides
  // eligibility, the PROJECT decides relevance. Without one (or with the
  // core profile) the prompt is the company-only version as before.
  const isProject = profile?.kind === "project";
  const projectSection = isProject
    ? `

PROJEKT (det företaget söker finansiering till):
Namn: ${profile!.name || "Ej angivet"}
Beskrivning: ${profile!.description || "Ej angiven"}
Mål: ${profile!.goals || "Ej angivna"}
Områden: ${(profile!.focusAreas || []).join(", ") || "Ej angivna"}
Nyckelord: ${(profile!.keywords || []).join(", ") || "Inga angivna"}
Budget: ${profile!.budgetSek ? `${Number(profile!.budgetSek).toLocaleString("sv-SE")} SEK` : "Ej angiven"}
Tidsram: ${profile!.timeframe || "Ej angiven"}`
    : "";

  const assessmentPoints = isProject
    ? `1. Hur väl PROJEKTET stämmer överens med bidragets syfte — detta avgör relevansen
2. Om FÖRETAGET uppfyller bidragets behörighetskrav (storlek, region, bolagsform, ålder)
3. Om företaget har relevanta kompetenser eller erfarenheter för att genomföra projektet
4. Eventuella risker eller hinder

VIKTIGT: Bedöm relevansen utifrån projektet, inte företagets kärnverksamhet. Ett företag kan söka bidrag till ett projekt som ligger utanför dess vanliga bransch — det är legitimt så länge behörighetskraven uppfylls och företaget kan genomföra projektet. Behörighetsbrister (fel region, fel storlek) ska däremot dra ned poängen kraftigt oavsett hur bra projektet passar.`
    : `1. Hur väl företagets verksamhet stämmer överens med bidragets syfte
2. Om företaget tillhör rätt målgrupp
3. Om det finns relevanta kompetenser eller erfarenheter
4. Eventuella risker eller hinder`;

  const prompt = `Du är en expert på svenska företagsbidrag och finansieringsmöjligheter. Analysera hur väl ${isProject ? "detta projekt" : "detta företag"} passar för detta bidrag.

FÖRETAG:
Namn: ${company.companyName}
Bransch: ${companyIndustry}
Antal anställda: ${company.employees || "Ej angivet"}
Omsättning: ${company.revenue ? `${Number(company.revenue).toLocaleString("sv-SE")} SEK` : "Ej angivet"}
Plats: ${company.location || "Ej angivet"}
Beskrivning: ${companyDescription}${projectSection}

BIDRAG:
Titel: ${grantTitle}
Källa: ${grant.sourceName}
Beskrivning: ${grantDescription}
Målgrupp: ${(grant.targetGroup || []).join(", ") || "Alla"}
Nyckelord: ${grantKeywords.join(", ") || "Inga angivna"}

Analysera matchningen noggrant och bedöm:
${assessmentPoints}

Svara med ENDAST en JSON-struktur (inga andra tecken före eller efter):
{
  "score": <number 0-100>,
  "reasoning": "<kort förklaring på svenska, max 2 meningar>",
  "strengths": ["<styrka 1>", "<styrka 2>"],
  "concerns": ["<oro 1>", "<oro 2>"]
}

Var realistisk med poängen:
- 80-100: Utmärkt matchning, företaget passar perfekt
- 60-79: Bra matchning, några mindre avvikelser
- 40-59: Delvis matchning, vissa tveksamheter
- 20-39: Svag matchning, betydande luckor
- 0-19: Dålig matchning, passar inte alls`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    const responseText = textContent?.type === "text" ? textContent.text : "";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const result = JSON.parse(jsonMatch[0]);

    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const estimatedCostSEK = calculateCost(inputTokens, outputTokens);

    return {
      score: Math.min(100, Math.max(0, result.score)),
      reasoning: result.reasoning || "Automatisk analys slutförd",
      strengths: result.strengths || [],
      concerns: result.concerns || [],
      inputTokens,
      outputTokens,
      estimatedCostSEK,
    };
  } catch (error) {
    console.error("Semantic matching error:", error);
    return {
      score: 50,
      reasoning: "Automatisk analys kunde inte genomföras",
      strengths: [],
      concerns: ["Kunde inte analysera matchningen automatiskt"],
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostSEK: 0,
    };
  }
}

function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCostPerMillion = 3;
  const outputCostPerMillion = 15;
  const usdToSek = 10.5;

  const inputCost = (inputTokens / 1_000_000) * inputCostPerMillion;
  const outputCost = (outputTokens / 1_000_000) * outputCostPerMillion;

  return Number(((inputCost + outputCost) * usdToSek).toFixed(2));
}
