import Anthropic from "@anthropic-ai/sdk";
import type { Grant, Company, ApplicationSection } from "@shared/schema";
import { findRelevantContentBlocks } from "./contentLibrary";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface SectionTemplate {
  key: string;
  title: string;
  description: string;
  maxWords: number;
  evaluationCriteria: string;
}

export interface GrantTemplate {
  sourceKey: string;
  label: string;
  sections: SectionTemplate[];
}

export interface ProjectData {
  projectDescription: string;
  projectGoals: string;
  projectBudget: number;
  requestedAmount: number;
  previousExperience?: string;
}

export interface GeneratedApplication {
  sections: ApplicationSection[];
  warnings: string[];
  overallScore: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostSEK: number;
  };
}

const GRANT_TEMPLATES: Record<string, GrantTemplate> = {
  vinnova: {
    sourceKey: "vinnova",
    label: "Vinnova",
    sections: [
      {
        key: "background_and_need",
        title: "Bakgrund och behov",
        description: "Beskriv problemet eller behovet som projektet adresserar",
        maxWords: 500,
        evaluationCriteria: "Relevans för svensk innovation, tydlig problembeskrivning, marknadsstorlek",
      },
      {
        key: "project_description",
        title: "Projektbeskrivning",
        description: "Beskriv vad projektet ska göra och hur",
        maxWords: 800,
        evaluationCriteria: "Teknisk genomförbarhet, innovationsnivå (TRL), metodik",
      },
      {
        key: "expected_results",
        title: "Förväntade resultat och effekter",
        description: "Vilka konkreta resultat förväntas och vilken samhällsnytta skapas",
        maxWords: 400,
        evaluationCriteria: "Mätbara resultat, samhällsnytta, kommersialiseringspotential",
      },
      {
        key: "team_and_capacity",
        title: "Projektparter och kapacitet",
        description: "Beskriv teamet och deras relevanta erfarenhet",
        maxWords: 300,
        evaluationCriteria: "Teamets kompetens, samarbeten, relevant erfarenhet",
      },
      {
        key: "budget_motivation",
        title: "Budget och motivering",
        description: "Specificera kostnader och motivera dem",
        maxWords: 300,
        evaluationCriteria: "Kostnadseffektivitet, realistisk budget, medfinansiering",
      },
    ],
  },
  tillvaxtverket: {
    sourceKey: "tillvaxtverket",
    label: "Tillväxtverket",
    sections: [
      {
        key: "company_description",
        title: "Företagsbeskrivning",
        description: "Beskriv företaget, dess verksamhet och marknadsposition",
        maxWords: 400,
        evaluationCriteria: "Företagets mognad, marknadsvalidering, tillväxtpotential",
      },
      {
        key: "project_purpose",
        title: "Projektets syfte och mål",
        description: "Vad ska projektet uppnå och varför är det viktigt",
        maxWords: 500,
        evaluationCriteria: "Koppling till regionala tillväxtmål, potential för jobbskapande",
      },
      {
        key: "implementation_plan",
        title: "Genomförandeplan",
        description: "Hur ska projektet genomföras, tidplan och milstolpar",
        maxWords: 600,
        evaluationCriteria: "Realistisk tidplan, tydliga milstolpar, riskhantering",
      },
      {
        key: "sustainability",
        title: "Hållbarhet och långsiktighet",
        description: "Hur säkras resultaten efter projektets slut",
        maxWords: 300,
        evaluationCriteria: "Långsiktig hållbarhet, miljömässig hållbarhet",
      },
    ],
  },
  energimyndigheten: {
    sourceKey: "energimyndigheten",
    label: "Energimyndigheten",
    sections: [
      {
        key: "project_summary",
        title: "Projektsammanfattning",
        description: "Kort översikt av projektet och dess energirelevans",
        maxWords: 300,
        evaluationCriteria: "Koppling till energiomställning, tydlighet",
      },
      {
        key: "problem_and_solution",
        title: "Problem och lösning",
        description: "Vilket energirelaterat problem löser projektet och hur",
        maxWords: 600,
        evaluationCriteria: "Energibesparingspotential, innovationshöjd, teknisk mognad",
      },
      {
        key: "expected_impact",
        title: "Förväntad effekt",
        description: "Kvantifiera förväntade energi- och klimateffekter",
        maxWords: 400,
        evaluationCriteria: "Mätbar energibesparing, CO2-reduktion, skalbarhet",
      },
      {
        key: "team_and_budget",
        title: "Team och budget",
        description: "Projektteam, kompetenser och budgetmotivering",
        maxWords: 400,
        evaluationCriteria: "Relevant kompetens, kostnadseffektivitet",
      },
    ],
  },
  "innovasjon-norge": {
    sourceKey: "innovasjon-norge",
    label: "Innovasjon Norge",
    sections: [
      {
        key: "project_description",
        title: "Prosjektbeskrivelse",
        description: "Beskriv prosjektet, dets mål og gjennomføringsplan",
        maxWords: 600,
        evaluationCriteria: "Innovasjonshøyde, gjennomførbarhet, tydelig prosjektplan",
      },
      {
        key: "market_potential",
        title: "Markedspotensial",
        description: "Beskriv markedsmulighetene og konkurransefortrinn",
        maxWords: 500,
        evaluationCriteria: "Markedsstørrelse, konkurranseanalyse, vekstpotensial",
      },
      {
        key: "team",
        title: "Team og kompetanse",
        description: "Beskriv teamet og relevant erfaring",
        maxWords: 400,
        evaluationCriteria: "Teamets kompetanse, relevant erfaring, kapasitet",
      },
      {
        key: "budget",
        title: "Budsjett",
        description: "Detaljert kostnadsplan og finansieringsplan",
        maxWords: 400,
        evaluationCriteria: "Kostnadseffektivitet, realistisk budsjett, egenfinansiering",
      },
      {
        key: "implementation_plan",
        title: "Gjennomføringsplan",
        description: "Tidsplan, milepæler og leveranser",
        maxWords: 400,
        evaluationCriteria: "Realistisk tidsplan, tydelige milepæler, risikovurdering",
      },
    ],
  },
  forskningsradet: {
    sourceKey: "forskningsradet",
    label: "Forskningsrådet (IPN)",
    sections: [
      {
        key: "project",
        title: "Prosjekt",
        description: "Overordnet prosjektbeskrivelse med FoU-fokus",
        maxWords: 600,
        evaluationCriteria: "Forskningskvalitet, vitenskapelig metode, originalitet",
      },
      {
        key: "rd_content",
        title: "FoU-innhold",
        description: "Beskriv forsknings- og utviklingsinnholdet i detalj",
        maxWords: 800,
        evaluationCriteria: "Innovasjonshøyde, FoU-innhold, vitenskapelig tilnærming",
      },
      {
        key: "business_value",
        title: "Næringslivsnytte",
        description: "Hvordan vil resultatene komme næringslivet til gode",
        maxWords: 500,
        evaluationCriteria: "Kommersialiseringspotensial, verdiskaping, arbeidsplasser",
      },
      {
        key: "budget",
        title: "Budsjett",
        description: "Detaljert kostnadsplan med personalressurser og andre kostnader",
        maxWords: 400,
        evaluationCriteria: "Kostnadseffektivitet, riktig prosjektøkonomi",
      },
      {
        key: "timeline",
        title: "Tidsplan",
        description: "Tidsplan med arbeidspakker og milepæler",
        maxWords: 400,
        evaluationCriteria: "Gjennomførbarhet, realistisk progresjon, avhengigheter",
      },
    ],
  },
  enova: {
    sourceKey: "enova",
    label: "Enova",
    sections: [
      {
        key: "technology",
        title: "Teknologi",
        description: "Beskriv teknologien og dens innovasjonsgrad",
        maxWords: 600,
        evaluationCriteria: "Teknologisk modenhet, innovasjonshøyde, skalerbarhet",
      },
      {
        key: "energy_impact",
        title: "Energieffekt",
        description: "Kvantifiser forventet energi- og klimaeffekt",
        maxWords: 500,
        evaluationCriteria: "Energibesparing, CO2-reduksjon, bidrag til energiomstillingen",
      },
      {
        key: "economics",
        title: "Økonomi",
        description: "Økonomisk vurdering, kostnadsplan og lønnsomhet",
        maxWords: 400,
        evaluationCriteria: "Kostnadseffektivitet, lønnsomhet, finansieringsplan",
      },
      {
        key: "implementation",
        title: "Gjennomføring",
        description: "Plan for gjennomføring, milepæler og risikovurdering",
        maxWords: 400,
        evaluationCriteria: "Gjennomførbarhet, realistisk plan, risikovurdering",
      },
    ],
  },
  "business-finland": {
    sourceKey: "business-finland",
    label: "Business Finland",
    sections: [
      {
        key: "project_description",
        title: "Project Description",
        description: "Describe the project, its objectives and expected outcomes",
        maxWords: 600,
        evaluationCriteria: "Innovation level, feasibility, clear project plan",
      },
      {
        key: "innovation",
        title: "Innovation",
        description: "Describe the innovation content and competitive advantage",
        maxWords: 500,
        evaluationCriteria: "Novelty, competitive advantage, IP strategy",
      },
      {
        key: "market",
        title: "Market",
        description: "Market analysis, target customers and go-to-market strategy",
        maxWords: 500,
        evaluationCriteria: "Market size, customer validation, growth potential",
      },
      {
        key: "team_and_capabilities",
        title: "Team & Capabilities",
        description: "Team composition, expertise and relevant track record",
        maxWords: 400,
        evaluationCriteria: "Team competence, relevant experience, capacity to deliver",
      },
      {
        key: "budget",
        title: "Budget",
        description: "Detailed cost plan and funding structure",
        maxWords: 400,
        evaluationCriteria: "Cost efficiency, realistic budget, co-funding",
      },
    ],
  },
  "ely-avustus": {
    sourceKey: "ely-avustus",
    label: "ELY-avustus",
    sections: [
      {
        key: "company",
        title: "Yritys",
        description: "Kuvaus yrityksestä, sen toiminnasta ja markkinapositiosta",
        maxWords: 400,
        evaluationCriteria: "Yrityksen kypsyys, markkinavalidointi, kasvupotentiaali",
      },
      {
        key: "project",
        title: "Hanke",
        description: "Hankkeen kuvaus, tavoitteet ja toteutussuunnitelma",
        maxWords: 600,
        evaluationCriteria: "Innovatiivisuus, toteutettavuus, selkeä hankesuunnitelma",
      },
      {
        key: "impact",
        title: "Vaikutukset",
        description: "Odotetut vaikutukset liiketoimintaan ja laajemmin",
        maxWords: 400,
        evaluationCriteria: "Mitattavat tulokset, yhteiskunnallinen vaikuttavuus, skaalautuvuus",
      },
      {
        key: "budget",
        title: "Budjetti",
        description: "Yksityiskohtainen kustannusarvio ja rahoitussuunnitelma",
        maxWords: 400,
        evaluationCriteria: "Kustannustehokkuus, realistinen budjetti, omarahoitusosuus",
      },
    ],
  },
  generic: {
    sourceKey: "generic",
    label: "Generell",
    sections: [
      {
        key: "executive_summary",
        title: "Sammanfattning",
        description: "Kort översikt av projektet och finansieringsansökan",
        maxWords: 300,
        evaluationCriteria: "Tydlighet, övertygande argumentation, differentiering",
      },
      {
        key: "problem_and_solution",
        title: "Problem och lösning",
        description: "Vilket problem löser projektet och hur",
        maxWords: 600,
        evaluationCriteria: "Problemvalidering, unik lösning, marknadsanpassning",
      },
      {
        key: "impact",
        title: "Förväntad effekt",
        description: "Mätbara resultat och bredare samhällsnytta",
        maxWords: 400,
        evaluationCriteria: "Kvantifierad effekt, hållbarhet, skalbarhet",
      },
      {
        key: "team",
        title: "Team",
        description: "Varför detta team kan leverera",
        maxWords: 300,
        evaluationCriteria: "Relevant expertis, erfarenhet, engagemang",
      },
      {
        key: "budget",
        title: "Budgetöversikt",
        description: "Hur medlen ska användas",
        maxWords: 300,
        evaluationCriteria: "Effektivitet, transparens, hävstång av bidragsmedel",
      },
    ],
  },
};

function resolveTemplate(grant: Grant): GrantTemplate {
  const src = grant.sourceName.toLowerCase();
  if (src.includes("vinnova")) return GRANT_TEMPLATES.vinnova;
  if (src.includes("tillväxtverket") || src.includes("tillvaxtverket"))
    return GRANT_TEMPLATES.tillvaxtverket;
  if (src.includes("energimyndigheten")) return GRANT_TEMPLATES.energimyndigheten;
  if (src.includes("innovasjon norge") || src.includes("innovasjon_norge"))
    return GRANT_TEMPLATES["innovasjon-norge"];
  if (src.includes("forskningsrådet") || src.includes("forskningsradet"))
    return GRANT_TEMPLATES.forskningsradet;
  if (src.includes("enova")) return GRANT_TEMPLATES.enova;
  if (src.includes("business finland")) return GRANT_TEMPLATES["business-finland"];
  if (src.includes("ely") || src.includes("ely-keskus"))
    return GRANT_TEMPLATES["ely-avustus"];
  return GRANT_TEMPLATES.generic;
}

export function getTemplateForGrant(grant: Grant): GrantTemplate {
  return resolveTemplate(grant);
}

export function getTemplateBySource(sourceKey: string): GrantTemplate {
  return GRANT_TEMPLATES[sourceKey] || GRANT_TEMPLATES.generic;
}

export function getAllTemplates(): Record<string, GrantTemplate> {
  return GRANT_TEMPLATES;
}

function isSwedishGrant(grant: Grant): boolean {
  const src = grant.sourceName.toLowerCase();
  const swedishAgencies = [
    "vinnova", "tillväxtverket", "tillvaxtverket", "energimyndigheten",
    "almi", "formas", "naturvårdsverket", "jordbruksverket", "boverket",
    "kulturrådet", "forte", "kk-stiftelsen", "postkodstiftelsen",
    "internetstiftelsen", "region", "länsstyrelser",
  ];
  return swedishAgencies.some((a) => src.includes(a));
}

function buildSectionPrompt(
  grant: Grant,
  company: Company,
  project: ProjectData,
  section: SectionTemplate,
  isSwedish: boolean,
  libraryBlocks?: { contentType: string; content: string }[]
): string {
  const language = isSwedish
    ? "Skriv på svenska. Använd professionellt språk utan AI-känsla."
    : "Write in English. Use professional language appropriate for grant applications.";

  const eligibilityCriteria = grant.eligibilityCriteria
    ? JSON.stringify(grant.eligibilityCriteria, null, 2)
    : "";

  return `You are an expert grant application writer. Write the "${section.title}" section for a grant application.

GRANT INFORMATION:
- Grant: ${grant.title}
- Funder: ${grant.sourceName}
- Description: ${grant.description?.substring(0, 1500) || "Not specified"}
- Max amount: ${grant.amountMax ? `${Number(grant.amountMax).toLocaleString("sv-SE")} SEK` : "Not specified"}
- Deadline: ${grant.deadline ? new Date(grant.deadline).toLocaleDateString("sv-SE") : "Not specified"}
${eligibilityCriteria ? `- Eligibility criteria: ${eligibilityCriteria.substring(0, 800)}` : ""}

COMPANY INFORMATION:
- Company: ${company.companyName}
- Sector: ${company.industry || "Not specified"}
- Description: ${company.description || "Not specified"}
- Employees: ${company.employees || "Not specified"}
- Region: ${company.location || "Not specified"}
${company.revenue ? `- Annual revenue: ${Number(company.revenue).toLocaleString("sv-SE")} SEK` : ""}
${company.foundedYear ? `- Founded: ${company.foundedYear}` : ""}

PROJECT INFORMATION:
- Project description: ${project.projectDescription}
- Goals: ${project.projectGoals}
- Total budget: ${project.projectBudget.toLocaleString("sv-SE")} SEK
- Requested amount: ${project.requestedAmount.toLocaleString("sv-SE")} SEK
${project.previousExperience ? `- Relevant experience: ${project.previousExperience}` : ""}

SECTION INSTRUCTIONS:
- Section: ${section.title}
- What to cover: ${section.description}
- Max length: ${section.maxWords} words
- Evaluation criteria: ${section.evaluationCriteria}

${libraryBlocks && libraryBlocks.length > 0 ? `
REUSABLE CONTENT FROM PREVIOUS APPLICATIONS (adapt these, don't copy verbatim):
${libraryBlocks.map(b => `[${b.contentType}]: ${b.content}`).join('\n\n')}
` : ''}
REQUIREMENTS:
- ${language}
- Be specific; use concrete numbers and examples
- Align with what grant evaluators look for
- Do NOT use generic filler — every sentence must add value
- Stay within the word limit
- Write in first person plural ("Vi planerar..." / "Our project will...")
${libraryBlocks && libraryBlocks.length > 0 ? '- If reusable content was provided, adapt it to fit this specific grant — don\'t copy verbatim' : ''}
- Output ONLY the section text, no headers or meta-commentary`;
}

function generateWarnings(
  grant: Grant,
  project: ProjectData
): string[] {
  const warnings: string[] = [];

  if (grant.amountMax) {
    const maxAmount = Number(grant.amountMax);
    if (project.requestedAmount > maxAmount) {
      warnings.push(
        `Sökt belopp (${project.requestedAmount.toLocaleString("sv-SE")} SEK) överstiger bidragets maxbelopp (${maxAmount.toLocaleString("sv-SE")} SEK)`
      );
    }
  }

  if (project.requestedAmount > project.projectBudget) {
    warnings.push("Sökt belopp överstiger den totala projektbudgeten");
  }

  if (grant.deadline) {
    const deadline = new Date(grant.deadline);
    const now = new Date();
    const daysLeft = Math.ceil(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysLeft < 0) {
      warnings.push("Ansökningsperioden har passerat");
    } else if (daysLeft <= 7) {
      warnings.push(`Bara ${daysLeft} dagar kvar till deadline`);
    }
  }

  if (grant.status === "closed") {
    warnings.push("Detta bidrag är markerat som stängt");
  }

  if (project.projectDescription.length < 100) {
    warnings.push("Projektbeskrivningen är kort — mer detalj ger bättre resultat");
  }

  return warnings;
}

function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCostPerMillion = 3;
  const outputCostPerMillion = 15;
  const usdToSek = 10.5;
  const inputCost = (inputTokens / 1_000_000) * inputCostPerMillion;
  const outputCost = (outputTokens / 1_000_000) * outputCostPerMillion;
  return Number(((inputCost + outputCost) * usdToSek).toFixed(2));
}

export async function generateStructuredApplication(
  grant: Grant,
  company: Company,
  project: ProjectData,
  companyId?: string
): Promise<GeneratedApplication> {
  const template = resolveTemplate(grant);
  const isSwedish = isSwedishGrant(grant);

  const sections: ApplicationSection[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const sectionTemplate of template.sections) {
    let libraryBlocks: { contentType: string; content: string }[] = [];
    if (companyId) {
      try {
        const blocks = await findRelevantContentBlocks(
          sectionTemplate.key,
          companyId,
          isSwedish ? "sv" : "en"
        );
        libraryBlocks = blocks.map(b => ({ contentType: b.contentType, content: b.content }));
      } catch (e) {
      }
    }

    const prompt = buildSectionPrompt(
      grant,
      company,
      project,
      sectionTemplate,
      isSwedish,
      libraryBlocks
    );

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    const content = textContent?.type === "text" ? textContent.text.trim() : "";

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    sections.push({
      sectionKey: sectionTemplate.key,
      sectionTitle: sectionTemplate.title,
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      maxWords: sectionTemplate.maxWords,
      evaluationCriteria: sectionTemplate.evaluationCriteria,
    });
  }

  const warnings = generateWarnings(grant, project);

  const allContent = sections.map((s) => s.content).join(" ");
  const totalWords = allContent.split(/\s+/).filter(Boolean).length;
  const overallScore = Math.min(
    100,
    Math.round(
      50 +
        (totalWords > 200 ? 15 : 0) +
        (warnings.length === 0 ? 20 : 0) +
        (project.previousExperience ? 10 : 0) +
        (project.projectDescription.length > 300 ? 5 : 0)
    )
  );

  return {
    sections,
    warnings,
    overallScore,
    tokenUsage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      estimatedCostSEK: calculateCost(totalInputTokens, totalOutputTokens),
    },
  };
}

export async function regenerateSection(
  grant: Grant,
  company: Company,
  project: ProjectData,
  sectionKey: string,
  instructions: string,
  companyId?: string
): Promise<{ section: ApplicationSection; tokenUsage: { inputTokens: number; outputTokens: number; estimatedCostSEK: number } }> {
  const template = resolveTemplate(grant);
  const sectionTemplate = template.sections.find((s) => s.key === sectionKey);
  if (!sectionTemplate) {
    throw new Error(`Unknown section: ${sectionKey}`);
  }

  const isSwedish = isSwedishGrant(grant);

  let libraryBlocks: { contentType: string; content: string }[] = [];
  if (companyId) {
    try {
      const blocks = await findRelevantContentBlocks(sectionTemplate.key, companyId, isSwedish ? "sv" : "en");
      libraryBlocks = blocks.map(b => ({ contentType: b.contentType, content: b.content }));
    } catch (e) {
    }
  }

  const basePrompt = buildSectionPrompt(grant, company, project, sectionTemplate, isSwedish, libraryBlocks);
  const prompt = `${basePrompt}\n\nADDITIONAL INSTRUCTIONS FROM THE USER:\n${instructions}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const textContent = response.content.find((c) => c.type === "text");
  const content = textContent?.type === "text" ? textContent.text.trim() : "";

  return {
    section: {
      sectionKey: sectionTemplate.key,
      sectionTitle: sectionTemplate.title,
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      maxWords: sectionTemplate.maxWords,
      evaluationCriteria: sectionTemplate.evaluationCriteria,
    },
    tokenUsage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      estimatedCostSEK: calculateCost(response.usage.input_tokens, response.usage.output_tokens),
    },
  };
}
