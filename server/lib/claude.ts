import Anthropic from "@anthropic-ai/sdk";
import type { Grant, Company } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface GenerationResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostSEK: number;
}

export async function generateApplication(
  grant: Grant,
  company: Company,
  previousApplications?: string[]
): Promise<GenerationResult> {
  const system = `Du är expert på svenska företagsbidrag och finansieringsmöjligheter.
Din uppgift är att skriva en övertygande ansökan baserat på:
- Företagets information och styrkor
- Bidragets krav och fokusområden
- Tidigare godkända ansökningar (om tillgängliga)

Skriv professionellt på svenska med tydlig struktur. Använd konkreta exempel och siffror när möjligt.
Undvik generiska påståenden - var specifik för just detta företag och bidrag.`;

  const eligibilityCriteria = grant.eligibilityCriteria 
    ? JSON.stringify(grant.eligibilityCriteria, null, 2) 
    : "Inga specifika krav angivna";
  
  const applicationRequirements = grant.applicationRequirements
    ? JSON.stringify(grant.applicationRequirements, null, 2)
    : "Inga specifika krav på ansökan angivna";

  const prompt = `
FÖRETAGSINFORMATION:
Namn: ${company.companyName}
Organisationsnummer: ${company.orgNumber || "Ej angivet"}
Bransch: ${company.industry || "Ej angivet"}
Antal anställda: ${company.employees || "Ej angivet"}
Omsättning: ${company.revenue ? `${Number(company.revenue).toLocaleString("sv-SE")} SEK` : "Ej angivet"}
Grundat: ${company.foundedYear || "Ej angivet"}
Plats: ${company.location || "Ej angivet"}
Beskrivning: ${company.description || "Ingen beskrivning tillgänglig"}

BIDRAG ATT SÖKA:
Namn: ${grant.title}
Källa: ${grant.sourceName}
Beskrivning: ${grant.description}
Bidragsbelopp: ${formatAmount(grant.amountMin, grant.amountMax)}
Deadline: ${grant.deadline ? new Date(grant.deadline).toLocaleDateString("sv-SE") : "Ej angivet"}
Målgrupp: ${grant.targetGroup?.join(", ") || "Ej specificerat"}
Nyckelord: ${grant.keywords?.join(", ") || "Inga"}

BEHÖRIGHETSKRAV:
${eligibilityCriteria}

ANSÖKNINGSKRAV:
${applicationRequirements}

${previousApplications?.length ? `\nEXEMPEL PÅ GODKÄNDA ANSÖKNINGAR:\n${previousApplications.join("\n\n---\n\n")}` : ""}

Skriv en komplett ansökan som:
1. Tydligt visar hur företaget uppfyller bidragets krav
2. Är övertygande och välformulerad med konkreta exempel
3. Följer strukturen som krävs för denna typ av ansökan
4. Är på korrekt svenska utan AI-känsla
5. Inkluderar relevanta rubriker och avsnitt

Börja med en sammanfattning, följt av detaljerade avsnitt för varje kravområde.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4000,
    system: system,
    messages: [{ role: "user", content: prompt }],
  });

  const textContent = message.content.find((c) => c.type === "text");
  const content = textContent?.type === "text" ? textContent.text : "";

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  
  const estimatedCostSEK = calculateCost(inputTokens, outputTokens);

  return {
    content,
    inputTokens,
    outputTokens,
    estimatedCostSEK,
  };
}

function formatAmount(min: string | null, max: string | null): string {
  if (!min && !max) return "Ej angivet";
  if (min && max) {
    return `${Number(min).toLocaleString("sv-SE")} - ${Number(max).toLocaleString("sv-SE")} SEK`;
  }
  if (max) return `Upp till ${Number(max).toLocaleString("sv-SE")} SEK`;
  return `Från ${Number(min).toLocaleString("sv-SE")} SEK`;
}

function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCostPerMillion = 3; // $3 per 1M input tokens for claude-sonnet-4-5
  const outputCostPerMillion = 15; // $15 per 1M output tokens for claude-sonnet-4-5
  const usdToSek = 10.5; // Approximate exchange rate

  const inputCost = (inputTokens / 1_000_000) * inputCostPerMillion;
  const outputCost = (outputTokens / 1_000_000) * outputCostPerMillion;
  
  return Number(((inputCost + outputCost) * usdToSek).toFixed(2));
}
