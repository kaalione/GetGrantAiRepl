import type { Grant, Company } from "@shared/schema";
import { generateStructuredApplication, type ProjectData } from "../services/applicationWriter";

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
  const project: ProjectData = {
    projectDescription: company.description || grant.description?.substring(0, 500) || "",
    projectGoals: `Söka ${grant.title} för att stärka ${company.companyName}s verksamhet`,
    projectBudget: grant.amountMax ? Number(grant.amountMax) : 500000,
    requestedAmount: grant.amountMax ? Number(grant.amountMax) : 500000,
    previousExperience: previousApplications?.join("\n\n---\n\n") || undefined,
  };

  const structured = await generateStructuredApplication(grant, company, project);

  const content = structured.sections
    .map((s) => `## ${s.sectionTitle}\n\n${s.content}`)
    .join("\n\n---\n\n");

  return {
    content,
    inputTokens: structured.tokenUsage.inputTokens,
    outputTokens: structured.tokenUsage.outputTokens,
    estimatedCostSEK: structured.tokenUsage.estimatedCostSEK,
  };
}
