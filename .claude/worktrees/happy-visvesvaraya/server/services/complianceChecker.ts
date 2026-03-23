import Anthropic from "@anthropic-ai/sdk";
import type { Grant, Company, ApplicationSection, ComplianceReport } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

function getEvaluationCriteria(source: string): string {
  const sourceLower = source.toLowerCase();

  const criteria: Record<string, string> = {
    vinnova: `
Vinnova evaluates on 4 criteria (equal weight):
1. RELEVANCE: Does the project address important challenges? Is there a clear societal or economic need? Is the timing right?
2. SCIENTIFIC/TECHNICAL QUALITY: Is the approach innovative? Is the methodology sound? What is the current TRL and what TRL will be reached?
3. FEASIBILITY: Is the team competent? Is the plan realistic? Are risks identified and managed? Is the budget reasonable?
4. IMPACT: What are the expected results? How will results be used and spread? What is the commercialization plan? What is the potential for Swedish competitiveness?

Common rejection reasons: vague impact statements, budget not justified line-by-line, team lacks relevant competence, no evidence of market need, too early stage for the call, collaboration requirements not met.`,

    tillväxtverket: `
Tillväxtverket evaluates on:
1. NEED AND PROBLEM: Is there a documented market failure? Why can't the market solve this alone?
2. REGIONAL IMPACT: Does the project create jobs in the region? Does it strengthen regional competitiveness? Is there a clear connection to regional strategy?
3. ADDITIONALITY: Would the project happen without the grant? Can the company co-finance (typically 50%+)?
4. SUSTAINABILITY: Will results last beyond the project? Environmental impact?

Common rejection reasons: insufficient regional connection, no co-financing plan, project could be funded commercially, unclear job creation numbers.`,

    energimyndigheten: `
Energimyndigheten evaluates on:
1. ENERGY RELEVANCE: Clear connection to Swedish energy transition goals
2. INNOVATION LEVEL: Is this genuinely new? What is TRL?
3. COMMERCIAL POTENTIAL: Path to market within 5 years?
4. TEAM: Energy sector competence, relevant partners
5. ENVIRONMENTAL BENEFIT: Quantified CO2 reduction potential (tonnes/year)

Common rejection reasons: no quantified energy savings, missing industry partner, TRL too high (basic research) or too low (already commercial).`,

    generic: `
Standard grant evaluation criteria:
1. Problem/need clearly defined with evidence
2. Solution is innovative and feasible
3. Team has relevant expertise and capacity
4. Budget is realistic and well-justified
5. Expected outcomes are measurable and significant
6. Sustainability plan beyond the grant period
7. Compliance with all eligibility requirements`,
  };

  if (sourceLower.includes("vinnova")) return criteria.vinnova;
  if (sourceLower.includes("tillväxtverket") || sourceLower.includes("tillvaxtverket"))
    return criteria.tillväxtverket;
  if (sourceLower.includes("energimyndigheten")) return criteria.energimyndigheten;

  return criteria.generic;
}

function buildCompliancePrompt(
  grant: { title: string; sourceName: string; description: string; amountMax?: string | null },
  applicationText: string,
  evaluationCriteria: string,
  company: { companyName: string; industry?: string | null; employees?: number | null; location?: string | null }
): string {
  return `Review this grant application for compliance and quality.

GRANT:
Title: ${grant.title}
Funder: ${grant.sourceName}
Description: ${grant.description?.substring(0, 500) || 'Not provided'}
Max amount: ${grant.amountMax ? `${grant.amountMax} SEK` : 'Not specified'}

OFFICIAL EVALUATION CRITERIA:
${evaluationCriteria}

APPLICANT COMPANY:
${company.companyName} | ${company.industry || 'Not specified'} | ${company.employees || '?'} employees | ${company.location || 'Sweden'}

APPLICATION TEXT:
${applicationText}

Review each section of the application against the evaluation criteria.
Be specific — quote or reference actual text from the application when identifying issues.
Focus on what will actually affect the evaluation score, not stylistic preferences.

Respond with JSON only (no markdown, no code fences):
{
  "overallScore": <0-100>,
  "readinessLevel": "not_ready" | "needs_work" | "almost_ready" | "ready",
  "estimatedSuccessRate": "Low (15-25%)" | "Medium (35-55%)" | "High (65-80%)",
  "criticalIssues": [
    "Specific critical issue that will cause rejection"
  ],
  "improvements": [
    "High-impact improvement with specific action"
  ],
  "strengths": [
    "What the application does well"
  ],
  "sections": [
    {
      "sectionKey": "exact_section_key_from_input",
      "sectionTitle": "Section Title",
      "score": <0-100>,
      "issues": [
        {
          "severity": "critical" | "major" | "minor",
          "issue": "What is wrong or missing",
          "criterion": "Which evaluation criterion this affects",
          "fix": "Specific action to fix this"
        }
      ],
      "suggestions": [
        "Optional improvement that would strengthen this section"
      ]
    }
  ]
}`;
}

function buildFallbackReport(sections: ApplicationSection[]): ComplianceReport {
  return {
    overallScore: 0,
    readinessLevel: "not_ready",
    sections: sections.map((s) => ({
      sectionKey: s.sectionKey,
      sectionTitle: s.sectionTitle,
      score: 0,
      issues: [
        {
          severity: "critical" as const,
          issue: "Could not analyze this section",
          criterion: "N/A",
          fix: "Please try running the compliance check again",
        },
      ],
      suggestions: [],
    })),
    criticalIssues: ["Compliance check failed — please try again"],
    improvements: [],
    strengths: [],
    estimatedSuccessRate: "Unknown",
    checkedAt: new Date().toISOString(),
  };
}

export async function checkCompliance(
  grant: Grant,
  sections: ApplicationSection[],
  company: Company
): Promise<ComplianceReport> {
  const applicationText = sections
    .map((s) => `## ${s.sectionTitle} [key: ${s.sectionKey}]\n${s.content}`)
    .join("\n\n");

  if (!applicationText.trim() || sections.length === 0) {
    return buildFallbackReport(sections);
  }

  const evaluationCriteria = getEvaluationCriteria(grant.sourceName);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 3000,
    system: `You are a senior grant evaluator with 15+ years experience reviewing applications for ${grant.sourceName}. You know exactly what makes applications succeed or fail. Be specific, honest, and constructive. Always respond with valid JSON only — no markdown formatting, no code fences, just the raw JSON object.`,
    messages: [
      {
        role: "user",
        content: buildCompliancePrompt(grant, applicationText, evaluationCriteria, company),
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  try {
    let jsonText = text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const result = JSON.parse(jsonText) as ComplianceReport;
    result.checkedAt = new Date().toISOString();

    if (!result.readinessLevel) {
      if (result.overallScore >= 85) result.readinessLevel = "ready";
      else if (result.overallScore >= 70) result.readinessLevel = "almost_ready";
      else if (result.overallScore >= 50) result.readinessLevel = "needs_work";
      else result.readinessLevel = "not_ready";
    }

    return result;
  } catch {
    console.error("Failed to parse compliance report JSON:", text.substring(0, 200));
    return buildFallbackReport(sections);
  }
}
