import { anthropic } from "../lib/anthropic";
import { db } from "../db";
import {
  grantProjects,
  projectMilestones,
  projectReports,
  projectBudgetCategories,
  projectExpenses,
  projectTeamMembers,
  projectActivityLog,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

const FUNDER_REPORT_STYLES: Record<string, string> = {
  vinnova: `
    Vinnova progress reports should:
    - Be written in Swedish
    - Use formal but clear language
    - Structure: Sammanfattning → Genomförda aktiviteter → Resultat → 
      Avvikelser och åtgärder → Nästa period → Ekonomisk redovisning
    - Reference the original project goals and show measurable progress
    - Use TRL (Technology Readiness Level) language for technical projects
    - Quantify outputs wherever possible (number of tests, prototypes, users, etc.)
    - Keep to 2-4 pages for progress reports, 5-8 for interim/final
  `,
  tillvaxtverket: `
    Tillväxtverket reports should:
    - Be written in Swedish
    - Focus on regional impact and job creation
    - Structure: Projektöversikt → Aktiviteter → Effekter och resultat → 
      Ekonomisk redovisning → Fortsatt arbete
    - Include concrete numbers: jobs created/secured, companies reached,
      participants trained, etc.
    - Reference the regional development strategy alignment
    - Highlight sustainability aspects
  `,
  energimyndigheten: `
    Energimyndigheten reports should:
    - Be written in Swedish
    - Focus on energy efficiency, sustainability, and climate impact
    - Structure: Sammanfattning → Teknisk beskrivning → Resultat och analys → 
      Energi- och klimateffekter → Ekonomisk uppföljning → Fortsättning
    - Include energy metrics: kWh saved, CO2 reduction, efficiency improvements
    - Reference Swedish energy policy goals
    - Include technical data and measurements where available
  `,
  generic: `
    Write a professional progress report:
    - Use Swedish language
    - Structure: Sammanfattning → Genomförda aktiviteter → Resultat → 
      Ekonomisk redovisning → Planerade aktiviteter
    - Be specific and factual
    - Include quantifiable results where possible
  `,
};

function detectFunderStyle(funder: string): string {
  const f = funder.toLowerCase();
  if (f.includes("vinnova")) return "vinnova";
  if (f.includes("tillväxtverket") || f.includes("tillvaxtverket")) return "tillvaxtverket";
  if (f.includes("energimyndigheten")) return "energimyndigheten";
  return "generic";
}

export async function generateReportDraft(
  projectId: string,
  reportId: string,
  options: {
    includeFinancials?: boolean;
    customInstructions?: string;
  } = {}
): Promise<{
  content: string;
  executiveSummary: string;
  financialSummary?: string;
  generatedAt: string;
}> {
  const [project] = await db.select().from(grantProjects).where(eq(grantProjects.id, projectId)).limit(1);
  if (!project) throw new Error("Project not found");

  const [report] = await db.select().from(projectReports).where(eq(projectReports.id, reportId)).limit(1);
  if (!report) throw new Error("Report not found");

  const milestones = await db.select().from(projectMilestones)
    .where(eq(projectMilestones.projectId, projectId))
    .orderBy(projectMilestones.order);

  const budgetCategories = await db.select().from(projectBudgetCategories)
    .where(eq(projectBudgetCategories.projectId, projectId));

  const team = await db.select().from(projectTeamMembers)
    .where(eq(projectTeamMembers.projectId, projectId));

  const recentActivity = await db.select().from(projectActivityLog)
    .where(eq(projectActivityLog.projectId, projectId))
    .orderBy(desc(projectActivityLog.createdAt))
    .limit(30);

  const funderStyle = detectFunderStyle(project.funder);
  const styleGuide = FUNDER_REPORT_STYLES[funderStyle] || FUNDER_REPORT_STYLES.generic;

  const completedMilestones = milestones.filter(m => m.status === "completed");
  const inProgressMilestones = milestones.filter(m => m.status === "in_progress");
  const pendingMilestones = milestones.filter(m => m.status === "pending" || m.status === "delayed");

  const totalBudgeted = budgetCategories.reduce((sum, c) => sum + (c.budgetedAmountSek || 0), 0);
  const totalSpent = budgetCategories.reduce((sum, c) => sum + (c.spentAmountSek || 0), 0);

  const prompt = `You are an expert grant report writer for Swedish funders. Generate a ${report.reportType} report.

STYLE GUIDE:
${styleGuide}

PROJECT INFORMATION:
- Project: ${project.title}
- Funder: ${project.funder}
- Approved amount: ${project.approvedAmountSek ? project.approvedAmountSek.toLocaleString("sv-SE") + " SEK" : "Not specified"}
- Reference: ${project.grantAgreementRef || "N/A"}
- Period: ${project.projectStartDate || "N/A"} to ${project.projectEndDate || "N/A"}
- Health status: ${project.healthStatus}

REPORT DETAILS:
- Report type: ${report.reportType}
- Report title: ${report.title}
- Reporting period: ${report.periodStart || "N/A"} to ${report.periodEnd || "N/A"}

MILESTONES STATUS:
Completed (${completedMilestones.length}/${milestones.length}):
${completedMilestones.map(m => `  ✓ ${m.title}${m.completedAt ? ` (completed ${new Date(m.completedAt).toLocaleDateString("sv-SE")})` : ""}`).join("\n") || "  None"}

In progress (${inProgressMilestones.length}):
${inProgressMilestones.map(m => `  → ${m.title} (due: ${m.dueDate})`).join("\n") || "  None"}

Upcoming/Delayed (${pendingMilestones.length}):
${pendingMilestones.map(m => `  ○ ${m.title} (due: ${m.dueDate})${m.status === "delayed" ? " [DELAYED]" : ""}`).join("\n") || "  None"}

${options.includeFinancials !== false ? `
BUDGET OVERVIEW:
Total budgeted: ${totalBudgeted.toLocaleString("sv-SE")} SEK
Total spent: ${totalSpent.toLocaleString("sv-SE")} SEK (${totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0}%)

By category:
${budgetCategories.map(c => `  ${c.categoryLabel || c.category}: ${(c.spentAmountSek || 0).toLocaleString("sv-SE")} / ${c.budgetedAmountSek.toLocaleString("sv-SE")} SEK`).join("\n") || "  No budget categories defined"}
` : ""}

TEAM:
${team.map(m => `  ${m.name} — ${m.role}${m.allocationPercentage ? ` (${m.allocationPercentage}%)` : ""}`).join("\n") || "  No team members listed"}

RECENT ACTIVITIES:
${recentActivity.slice(0, 15).map(a => `  ${a.createdAt ? new Date(a.createdAt).toLocaleDateString("sv-SE") : ""}: ${a.description}`).join("\n") || "  No recent activities"}

${options.customInstructions ? `\nADDITIONAL INSTRUCTIONS FROM USER:\n${options.customInstructions}` : ""}

TASK:
Generate a complete ${report.reportType} report. Output the report in markdown format.

Also generate separately:
1. An executive summary (2-3 paragraphs)
${options.includeFinancials !== false ? "2. A financial summary section" : ""}

Format your response as JSON:
{
  "content": "full report in markdown",
  "executiveSummary": "executive summary text",
  ${options.includeFinancials !== false ? '"financialSummary": "financial summary text"' : ""}
}

Output ONLY the JSON, no surrounding text.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const textContent = response.content.find((c) => c.type === "text");
  const rawText = textContent?.type === "text" ? textContent.text.trim() : "{}";

  let parsed: any;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    parsed = {
      content: rawText,
      executiveSummary: "",
      financialSummary: "",
    };
  }

  const generatedAt = new Date().toISOString();

  await db.update(projectReports)
    .set({
      content: parsed.content || "",
      executiveSummary: parsed.executiveSummary || "",
      financialSummary: parsed.financialSummary || "",
      aiGenerated: true,
      aiGeneratedAt: new Date(),
      status: report.status === "upcoming" ? "drafting" : report.status,
      updatedAt: new Date(),
    })
    .where(eq(projectReports.id, reportId));

  return {
    content: parsed.content || "",
    executiveSummary: parsed.executiveSummary || "",
    financialSummary: parsed.financialSummary || undefined,
    generatedAt,
  };
}
