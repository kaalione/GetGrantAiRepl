import { Router } from "express";
import { db } from "../db";
import {
  grantProjects,
  projectMilestones,
  projectReports,
  projectBudgetCategories,
  projectExpenses,
  projectTeamMembers,
  projectActivityLog,
  projectDocuments,
  projectRisks,
  applications,
  grants,
  companies,
} from "@shared/schema";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { isAuthenticated } from "../auth";

const router = Router();

async function logActivity(projectId: string, userId: string, userName: string, activityType: string, description: string, metadata: any = {}) {
  await db.insert(projectActivityLog).values({ projectId, userId, userName, activityType, description, metadata });
}

async function verifyProjectOwnership(projectId: string, userId: string) {
  const [project] = await db.select().from(grantProjects).where(and(eq(grantProjects.id, projectId), eq(grantProjects.userId, userId))).limit(1);
  return project || null;
}

function getUserName(req: any): string {
  return ((req.user?.claims?.given_name || '') + ' ' + (req.user?.claims?.family_name || '')).trim() || 'Unknown User';
}

function computeRiskScore(probability: string, impact: string): number {
  const levels: Record<string, number> = { low: 1, medium: 2, high: 3 };
  return (levels[probability] || 1) * (levels[impact] || 1);
}

const BUDGET_TEMPLATES: Record<string, { category: string; categoryLabel: string; percentage: number }[]> = {
  vinnova: [
    { category: 'personnel', categoryLabel: 'Personnel', percentage: 60 },
    { category: 'equipment', categoryLabel: 'Equipment & Infrastructure', percentage: 15 },
    { category: 'external_services', categoryLabel: 'External Services/Subcontractors', percentage: 10 },
    { category: 'overhead', categoryLabel: 'Overhead', percentage: 15 },
  ],
  tillvaxtverket: [
    { category: 'personnel', categoryLabel: 'Personnel', percentage: 50 },
    { category: 'equipment', categoryLabel: 'Equipment', percentage: 10 },
    { category: 'external_services', categoryLabel: 'External Services', percentage: 15 },
    { category: 'travel', categoryLabel: 'Travel', percentage: 5 },
    { category: 'overhead', categoryLabel: 'Overhead', percentage: 10 },
    { category: 'dissemination', categoryLabel: 'Dissemination', percentage: 10 },
  ],
  energimyndigheten: [
    { category: 'personnel', categoryLabel: 'Personnel', percentage: 55 },
    { category: 'equipment', categoryLabel: 'Equipment', percentage: 15 },
    { category: 'subcontractors', categoryLabel: 'Subcontractors', percentage: 10 },
    { category: 'materials', categoryLabel: 'Materials', percentage: 5 },
    { category: 'travel', categoryLabel: 'Travel', percentage: 5 },
    { category: 'overhead', categoryLabel: 'Overhead', percentage: 10 },
  ],
  generic: [
    { category: 'personnel', categoryLabel: 'Personnel', percentage: 0 },
    { category: 'equipment', categoryLabel: 'Equipment', percentage: 0 },
    { category: 'travel', categoryLabel: 'Travel & Subsistence', percentage: 0 },
    { category: 'subcontractors', categoryLabel: 'Subcontractors', percentage: 0 },
    { category: 'materials', categoryLabel: 'Materials & Consumables', percentage: 0 },
    { category: 'dissemination', categoryLabel: 'Dissemination & Communication', percentage: 0 },
    { category: 'overhead', categoryLabel: 'Overhead', percentage: 0 },
    { category: 'other', categoryLabel: 'Other', percentage: 0 },
  ],
};

const DEFAULT_MILESTONES: Record<string, string[]> = {
  vinnova: ['Kickoff meeting', '6-month progress report', '12-month interim report', 'Final report & presentation'],
  tillvaxtverket: ['Project start documentation', 'Midterm review', 'Final report', 'Outcome documentation'],
  generic: ['Project kickoff', 'Interim milestone', 'Final report'],
};

// ====== 2.9 / 2.1 Dashboard (must be before :id routes) ======
router.get("/api/projects/dashboard", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;

    const projects = await db.select().from(grantProjects).where(eq(grantProjects.userId, userId));
    const activeProjects = projects.filter(p => p.status === 'active');
    const totalApprovedAmountSek = projects.reduce((sum, p) => sum + (p.approvedAmountSek || 0), 0);

    const projectIds = projects.map(p => p.id);
    let totalSpentSek = 0;
    let urgentItems: any[] = [];
    let upcomingDeadlines: any[] = [];
    let recentActivity: any[] = [];

    if (projectIds.length > 0) {
      const allCategories = await db.select().from(projectBudgetCategories).where(inArray(projectBudgetCategories.projectId, projectIds));
      totalSpentSek = allCategories.reduce((sum, c) => sum + (c.spentAmountSek || 0), 0);

      const now = new Date();
      const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const milestones = await db.select().from(projectMilestones).where(and(inArray(projectMilestones.projectId, projectIds), eq(projectMilestones.status, 'pending')));
      const overdueMilestones = milestones.filter(m => new Date(m.dueDate) < now);
      const upcomingMilestones = milestones.filter(m => {
        const d = new Date(m.dueDate);
        return d >= now && d <= twoWeeks;
      });

      overdueMilestones.forEach(m => urgentItems.push({ type: 'overdue_milestone', id: m.id, projectId: m.projectId, title: m.title, dueDate: m.dueDate }));

      const reports = await db.select().from(projectReports).where(and(inArray(projectReports.projectId, projectIds), eq(projectReports.status, 'upcoming')));
      const overdueReports = reports.filter(r => r.dueDate && new Date(r.dueDate) < now);
      overdueReports.forEach(r => urgentItems.push({ type: 'overdue_report', id: r.id, projectId: r.projectId, title: r.title, dueDate: r.dueDate }));

      const upcomingReports = reports.filter(r => {
        if (!r.dueDate) return false;
        const d = new Date(r.dueDate);
        return d >= now && d <= twoWeeks;
      });

      upcomingDeadlines = [
        ...upcomingMilestones.map(m => ({ type: 'milestone', id: m.id, projectId: m.projectId, title: m.title, dueDate: m.dueDate })),
        ...upcomingReports.map(r => ({ type: 'report', id: r.id, projectId: r.projectId, title: r.title, dueDate: r.dueDate })),
      ].sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

      recentActivity = await db.select().from(projectActivityLog)
        .where(inArray(projectActivityLog.projectId, projectIds))
        .orderBy(desc(projectActivityLog.createdAt))
        .limit(10);
    }

    res.json({
      totalProjects: projects.length,
      activeProjects: activeProjects.length,
      totalApprovedAmountSek,
      totalSpentSek,
      urgentItems,
      recentActivity,
      upcomingDeadlines,
    });
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    res.status(500).json({ error: "Failed to fetch dashboard" });
  }
});

// ====== 2.1 Project CRUD ======
router.get("/api/projects", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const projects = await db.select().from(grantProjects).where(eq(grantProjects.userId, userId)).orderBy(desc(grantProjects.createdAt));

    const projectIds = projects.map(p => p.id);
    if (projectIds.length === 0) return res.json([]);

    const [allMilestones, allReports, allCategories] = await Promise.all([
      db.select().from(projectMilestones).where(inArray(projectMilestones.projectId, projectIds)),
      db.select().from(projectReports).where(inArray(projectReports.projectId, projectIds)),
      db.select().from(projectBudgetCategories).where(inArray(projectBudgetCategories.projectId, projectIds)),
    ]);

    const now = new Date();

    const enriched = projects.map(project => {
      const milestones = allMilestones.filter(m => m.projectId === project.id);
      const reports = allReports.filter(r => r.projectId === project.id);
      const categories = allCategories.filter(c => c.projectId === project.id);

      const milestonesTotal = milestones.length;
      const milestonesCompleted = milestones.filter(m => m.status === 'completed').length;
      const percentComplete = milestonesTotal > 0 ? Math.round((milestonesCompleted / milestonesTotal) * 100) : 0;

      const totalBudgetedSek = categories.reduce((sum, c) => sum + c.budgetedAmountSek, 0);
      const totalSpentSek = categories.reduce((sum, c) => sum + (c.spentAmountSek || 0), 0);
      const percentSpent = totalBudgetedSek > 0 ? Math.round((totalSpentSek / totalBudgetedSek) * 100) : 0;
      const isOverBudget = totalSpentSek > totalBudgetedSek;

      const pendingMilestones = milestones
        .filter(m => m.status !== 'completed' && m.status !== 'waived')
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      const nextMs = pendingMilestones[0] || null;

      const upcomingReports = reports.filter(r => r.status === 'upcoming' && r.dueDate).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
      const nextRpt = upcomingReports[0] || null;

      function computeDaysUntil(dateStr: string) {
        const diff = new Date(dateStr).getTime() - now.getTime();
        return Math.ceil(diff / (24 * 60 * 60 * 1000));
      }

      let urgencyLevel: 'critical' | 'warning' | 'ok' = 'ok';
      const overdueMilestones = pendingMilestones.filter(m => new Date(m.dueDate) < now);
      const overdueReports = upcomingReports.filter(r => r.dueDate && new Date(r.dueDate) < now);
      if (overdueMilestones.length > 0 || overdueReports.length > 0) {
        urgencyLevel = 'critical';
      } else if (nextMs && computeDaysUntil(nextMs.dueDate) < 7) {
        urgencyLevel = 'warning';
      }

      return {
        ...project,
        progress: { milestonesTotal, milestonesCompleted, percentComplete },
        budget: { totalBudgetedSek, totalSpentSek, percentSpent, isOverBudget },
        nextMilestone: nextMs ? {
          title: nextMs.title,
          dueDate: nextMs.dueDate,
          daysUntilDue: computeDaysUntil(nextMs.dueDate),
          isOverdue: new Date(nextMs.dueDate) < now,
        } : null,
        nextReport: nextRpt ? {
          title: nextRpt.title,
          dueDate: nextRpt.dueDate!,
          daysUntilDue: computeDaysUntil(nextRpt.dueDate!),
        } : null,
        urgencyLevel,
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.post("/api/projects", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);

    const userCompanies = await db.select().from(companies).where(eq(companies.userId, userId)).limit(1);
    const companyId = req.body.companyId || userCompanies[0]?.id || userId;

    const [project] = await db.insert(grantProjects).values({ ...req.body, userId, companyId }).returning();
    await logActivity(project.id, userId, userName, 'project_created', `Project "${project.title}" created`);

    res.json(project);
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

router.get("/api/projects/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [milestones, reports, budgetCategories, teamMembers, recentActivity, documents, risks] = await Promise.all([
      db.select().from(projectMilestones).where(eq(projectMilestones.projectId, project.id)).orderBy(asc(projectMilestones.order)),
      db.select().from(projectReports).where(eq(projectReports.projectId, project.id)).orderBy(asc(projectReports.dueDate)),
      db.select().from(projectBudgetCategories).where(eq(projectBudgetCategories.projectId, project.id)).orderBy(asc(projectBudgetCategories.order)),
      db.select().from(projectTeamMembers).where(eq(projectTeamMembers.projectId, project.id)),
      db.select().from(projectActivityLog).where(eq(projectActivityLog.projectId, project.id)).orderBy(desc(projectActivityLog.createdAt)).limit(20),
      db.select().from(projectDocuments).where(eq(projectDocuments.projectId, project.id)).orderBy(desc(projectDocuments.createdAt)),
      db.select().from(projectRisks).where(eq(projectRisks.projectId, project.id)).orderBy(desc(projectRisks.riskScore)),
    ]);

    res.json({ ...project, milestones, reports, budgetCategories, teamMembers, recentActivity, documents, risks });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

router.put("/api/projects/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const changedFields = Object.keys(req.body).filter(k => (req.body as any)[k] !== (project as any)[k]);

    const [updated] = await db.update(grantProjects)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(grantProjects.id, project.id))
      .returning();

    await logActivity(project.id, userId, userName, 'project_updated', `Project updated: ${changedFields.join(', ')}`, { changedFields });

    res.json(updated);
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ error: "Failed to update project" });
  }
});

router.delete("/api/projects/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    await db.update(grantProjects)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(grantProjects.id, project.id));

    await logActivity(project.id, userId, userName, 'project_cancelled', `Project "${project.title}" cancelled`);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

router.post("/api/projects/from-application/:applicationId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);

    const [application] = await db.select().from(applications).where(eq(applications.id, req.params.applicationId)).limit(1);
    if (!application) return res.status(404).json({ error: "Application not found" });

    const [company] = await db.select().from(companies)
      .where(and(eq(companies.id, application.companyId!), eq(companies.userId, userId)))
      .limit(1);
    if (!company) return res.status(403).json({ error: "Not authorized" });

    let grant = null;
    if (application.grantId) {
      const [g] = await db.select().from(grants).where(eq(grants.id, application.grantId)).limit(1);
      grant = g || null;
    }

    const funder = grant?.sourceName?.toLowerCase() || 'generic';
    const funderKey = funder.includes('vinnova') ? 'vinnova' :
      funder.includes('tillväxtverket') || funder.includes('tillvaxtverket') ? 'tillvaxtverket' :
      funder.includes('energimyndigheten') ? 'energimyndigheten' : 'generic';

    const approvedAmount = application.approvedAmount ? parseInt(application.approvedAmount) : null;

    const [project] = await db.insert(grantProjects).values({
      userId,
      applicationId: application.id,
      grantId: application.grantId || undefined,
      companyId: company.id,
      title: grant?.title || 'Untitled Project',
      funder: grant?.sourceName || 'Unknown',
      approvedAmountSek: approvedAmount,
      status: 'active',
      healthStatus: 'on_track',
    }).returning();

    const milestoneNames = DEFAULT_MILESTONES[funderKey] || DEFAULT_MILESTONES.generic;
    const startDate = new Date();
    for (let i = 0; i < milestoneNames.length; i++) {
      const monthsOffset = Math.round(((i + 1) / milestoneNames.length) * 12);
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + monthsOffset);
      await db.insert(projectMilestones).values({
        projectId: project.id,
        title: milestoneNames[i],
        order: i,
        dueDate: dueDate.toISOString().split('T')[0],
        status: 'pending',
      });
    }

    if (approvedAmount && approvedAmount > 0) {
      const template = BUDGET_TEMPLATES[funderKey] || BUDGET_TEMPLATES.generic;
      for (let i = 0; i < template.length; i++) {
        const t = template[i];
        const budgetedAmount = t.percentage > 0 ? Math.round(approvedAmount * t.percentage / 100) : 0;
        await db.insert(projectBudgetCategories).values({
          projectId: project.id,
          category: t.category,
          categoryLabel: t.categoryLabel,
          budgetedAmountSek: budgetedAmount,
          order: i,
        });
      }
    }

    await logActivity(project.id, userId, userName, 'project_created', `Project created from application`, { applicationId: application.id });

    res.json(project);
  } catch (error) {
    console.error("Error creating project from application:", error);
    res.status(500).json({ error: "Failed to create project from application" });
  }
});

// ====== 2.2 Milestones ======
router.post("/api/projects/:id/milestones", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [milestone] = await db.insert(projectMilestones).values({ ...req.body, projectId: project.id }).returning();
    await logActivity(project.id, userId, userName, 'milestone_created', `Milestone "${milestone.title}" created`);

    res.json(milestone);
  } catch (error) {
    console.error("Error creating milestone:", error);
    res.status(500).json({ error: "Failed to create milestone" });
  }
});

router.put("/api/projects/:id/milestones/:milestoneId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [existing] = await db.select().from(projectMilestones)
      .where(and(eq(projectMilestones.id, req.params.milestoneId), eq(projectMilestones.projectId, project.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Milestone not found" });

    const [updated] = await db.update(projectMilestones)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(projectMilestones.id, existing.id))
      .returning();

    if (req.body.status && req.body.status !== existing.status) {
      await logActivity(project.id, userId, userName, 'milestone_status_changed', `Milestone "${existing.title}" status changed from ${existing.status} to ${req.body.status}`, { oldStatus: existing.status, newStatus: req.body.status });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating milestone:", error);
    res.status(500).json({ error: "Failed to update milestone" });
  }
});

router.post("/api/projects/:id/milestones/:milestoneId/complete", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [milestone] = await db.select().from(projectMilestones)
      .where(and(eq(projectMilestones.id, req.params.milestoneId), eq(projectMilestones.projectId, project.id)))
      .limit(1);
    if (!milestone) return res.status(404).json({ error: "Milestone not found" });

    const updateData: any = { status: 'completed', completedAt: new Date(), updatedAt: new Date() };

    if (milestone.budgetReleaseAmountSek) {
      updateData.budgetReleasedAt = new Date();
    }

    const [updated] = await db.update(projectMilestones)
      .set(updateData)
      .where(eq(projectMilestones.id, milestone.id))
      .returning();

    const allMilestones = await db.select().from(projectMilestones).where(eq(projectMilestones.projectId, project.id));
    const completedCount = allMilestones.filter(m => m.status === 'completed').length;
    const totalCount = allMilestones.length;
    const progress = totalCount > 0 ? completedCount / totalCount : 0;

    let healthStatus = project.healthStatus;
    if (progress >= 1) healthStatus = 'completed';
    else if (progress > 0.5) healthStatus = 'on_track';

    await db.update(grantProjects).set({ healthStatus, updatedAt: new Date() }).where(eq(grantProjects.id, project.id));

    await logActivity(project.id, userId, userName, 'milestone_completed', `Milestone "${milestone.title}" completed`, {
      budgetReleased: milestone.budgetReleaseAmountSek || 0,
    });

    res.json(updated);
  } catch (error) {
    console.error("Error completing milestone:", error);
    res.status(500).json({ error: "Failed to complete milestone" });
  }
});

router.delete("/api/projects/:id/milestones/:milestoneId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [milestone] = await db.select().from(projectMilestones)
      .where(and(eq(projectMilestones.id, req.params.milestoneId), eq(projectMilestones.projectId, project.id)))
      .limit(1);
    if (!milestone) return res.status(404).json({ error: "Milestone not found" });
    if (milestone.status !== 'pending') return res.status(400).json({ error: "Can only delete pending milestones" });

    await db.delete(projectMilestones).where(eq(projectMilestones.id, milestone.id));
    await logActivity(project.id, userId, userName, 'milestone_deleted', `Milestone "${milestone.title}" deleted`);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting milestone:", error);
    res.status(500).json({ error: "Failed to delete milestone" });
  }
});

router.post("/api/projects/:id/milestones/reorder", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "orderedIds array required" });

    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(projectMilestones)
        .set({ order: i, updatedAt: new Date() })
        .where(and(eq(projectMilestones.id, orderedIds[i]), eq(projectMilestones.projectId, project.id)));
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error reordering milestones:", error);
    res.status(500).json({ error: "Failed to reorder milestones" });
  }
});

// ====== 2.3 Reports ======
router.get("/api/projects/:id/reports", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const reports = await db.select().from(projectReports)
      .where(eq(projectReports.projectId, project.id))
      .orderBy(asc(projectReports.dueDate));

    res.json(reports);
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

router.post("/api/projects/:id/reports", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [report] = await db.insert(projectReports).values({ ...req.body, projectId: project.id }).returning();
    await logActivity(project.id, userId, userName, 'report_created', `Report "${report.title}" created`);

    res.json(report);
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ error: "Failed to create report" });
  }
});

router.put("/api/projects/:id/reports/:reportId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [existing] = await db.select().from(projectReports)
      .where(and(eq(projectReports.id, req.params.reportId), eq(projectReports.projectId, project.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Report not found" });

    const [updated] = await db.update(projectReports)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(projectReports.id, existing.id))
      .returning();

    if (req.body.status && req.body.status !== existing.status) {
      await logActivity(project.id, userId, userName, 'report_status_changed', `Report "${existing.title}" status changed to ${req.body.status}`, { oldStatus: existing.status, newStatus: req.body.status });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({ error: "Failed to update report" });
  }
});

router.post("/api/projects/:id/reports/:reportId/submit", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [report] = await db.select().from(projectReports)
      .where(and(eq(projectReports.id, req.params.reportId), eq(projectReports.projectId, project.id)))
      .limit(1);
    if (!report) return res.status(404).json({ error: "Report not found" });

    const [updated] = await db.update(projectReports)
      .set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(projectReports.id, report.id))
      .returning();

    await logActivity(project.id, userId, userName, 'report_submitted', `Report "${report.title}" submitted`);

    res.json(updated);
  } catch (error) {
    console.error("Error submitting report:", error);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

router.post("/api/projects/:id/reports/:reportId/funder-response", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [report] = await db.select().from(projectReports)
      .where(and(eq(projectReports.id, req.params.reportId), eq(projectReports.projectId, project.id)))
      .limit(1);
    if (!report) return res.status(404).json({ error: "Report not found" });

    const { response, feedback } = req.body;
    const updateData: any = { updatedAt: new Date() };

    if (response === 'approved') {
      updateData.status = 'approved';
      updateData.funderApprovedAt = new Date();
      updateData.funderFeedback = feedback || null;
    } else if (response === 'rejected') {
      updateData.status = 'revision_needed';
      updateData.revisionRequestedAt = new Date();
      updateData.revisionNotes = feedback || null;
    }

    const [updated] = await db.update(projectReports)
      .set(updateData)
      .where(eq(projectReports.id, report.id))
      .returning();

    await logActivity(project.id, userId, userName, 'report_funder_response', `Report "${report.title}" ${response}`, { response, feedback });

    res.json(updated);
  } catch (error) {
    console.error("Error handling funder response:", error);
    res.status(500).json({ error: "Failed to handle funder response" });
  }
});

router.post("/api/projects/:id/reports/:reportId/generate-draft", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { includeFinancials, customInstructions } = req.body || {};
    const { generateReportDraft } = await import("../services/reportGenerator");
    const result = await generateReportDraft(project.id, req.params.reportId, {
      includeFinancials,
      customInstructions,
    });

    await logActivity(project.id, userId, userName, "report_draft_generated",
      `AI draft generated for report`, { reportId: req.params.reportId });

    res.json(result);
  } catch (error: any) {
    console.error("Error generating report draft:", error);
    res.status(500).json({ error: error.message || "Failed to generate report draft" });
  }
});

// ====== 2.4 Budget ======
router.get("/api/projects/:id/budget", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const categories = await db.select().from(projectBudgetCategories)
      .where(eq(projectBudgetCategories.projectId, project.id))
      .orderBy(asc(projectBudgetCategories.order));

    const enrichedCategories = categories.map(cat => {
      const remaining = cat.budgetedAmountSek - (cat.spentAmountSek || 0) - (cat.committedAmountSek || 0);
      const utilizationPercent = cat.budgetedAmountSek > 0 ? Math.round(((cat.spentAmountSek || 0) / cat.budgetedAmountSek) * 100) : 0;
      return { ...cat, remaining, utilizationPercent };
    });

    const totalBudgeted = categories.reduce((sum, c) => sum + c.budgetedAmountSek, 0);
    const totalSpent = categories.reduce((sum, c) => sum + (c.spentAmountSek || 0), 0);
    const totalCommitted = categories.reduce((sum, c) => sum + (c.committedAmountSek || 0), 0);
    const totalRemaining = totalBudgeted - totalSpent - totalCommitted;

    let burnRate = 0;
    if (project.projectStartDate) {
      const start = new Date(project.projectStartDate);
      const now = new Date();
      const monthsElapsed = Math.max(1, (now.getTime() - start.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
      burnRate = Math.round(totalSpent / monthsElapsed);
    }

    res.json({
      categories: enrichedCategories,
      summary: {
        totalBudgeted,
        totalSpent,
        totalCommitted,
        totalRemaining,
        burnRate,
        utilizationPercent: totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching budget:", error);
    res.status(500).json({ error: "Failed to fetch budget" });
  }
});

router.post("/api/projects/:id/budget/categories", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [category] = await db.insert(projectBudgetCategories).values({ ...req.body, projectId: project.id }).returning();
    res.json(category);
  } catch (error) {
    console.error("Error creating budget category:", error);
    res.status(500).json({ error: "Failed to create budget category" });
  }
});

router.put("/api/projects/:id/budget/categories/:categoryId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [updated] = await db.update(projectBudgetCategories)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(projectBudgetCategories.id, req.params.categoryId), eq(projectBudgetCategories.projectId, project.id)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Category not found" });
    res.json(updated);
  } catch (error) {
    console.error("Error updating budget category:", error);
    res.status(500).json({ error: "Failed to update budget category" });
  }
});

router.post("/api/projects/:id/budget/categories/:categoryId/expenses", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [category] = await db.select().from(projectBudgetCategories)
      .where(and(eq(projectBudgetCategories.id, req.params.categoryId), eq(projectBudgetCategories.projectId, project.id)))
      .limit(1);
    if (!category) return res.status(404).json({ error: "Category not found" });

    const [expense] = await db.insert(projectExpenses).values({
      ...req.body,
      projectId: project.id,
      categoryId: category.id,
    }).returning();

    await db.update(projectBudgetCategories)
      .set({ spentAmountSek: (category.spentAmountSek || 0) + expense.amountSek, updatedAt: new Date() })
      .where(eq(projectBudgetCategories.id, category.id));

    await logActivity(project.id, userId, userName, 'expense_added', `Expense "${expense.description}" added: ${expense.amountSek} SEK`, { expenseId: expense.id, amount: expense.amountSek, categoryId: category.id });

    res.json(expense);
  } catch (error) {
    console.error("Error adding expense:", error);
    res.status(500).json({ error: "Failed to add expense" });
  }
});

router.get("/api/projects/:id/budget/expenses", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    let query = db.select().from(projectExpenses).where(eq(projectExpenses.projectId, project.id));

    const expenses = await query.orderBy(desc(projectExpenses.createdAt));

    let filtered = expenses;
    if (req.query.categoryId) {
      filtered = filtered.filter(e => e.categoryId === req.query.categoryId);
    }
    if (req.query.startDate) {
      filtered = filtered.filter(e => e.expenseDate >= req.query.startDate);
    }
    if (req.query.endDate) {
      filtered = filtered.filter(e => e.expenseDate <= req.query.endDate);
    }
    if (req.query.isEligible !== undefined) {
      const eligible = req.query.isEligible === 'true';
      filtered = filtered.filter(e => e.isEligible === eligible);
    }

    res.json(filtered);
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

router.delete("/api/projects/:id/budget/expenses/:expenseId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [expense] = await db.select().from(projectExpenses)
      .where(and(eq(projectExpenses.id, req.params.expenseId), eq(projectExpenses.projectId, project.id)))
      .limit(1);
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    if (expense.categoryId) {
      const [category] = await db.select().from(projectBudgetCategories)
        .where(eq(projectBudgetCategories.id, expense.categoryId))
        .limit(1);
      if (category) {
        await db.update(projectBudgetCategories)
          .set({ spentAmountSek: Math.max(0, (category.spentAmountSek || 0) - expense.amountSek), updatedAt: new Date() })
          .where(eq(projectBudgetCategories.id, category.id));
      }
    }

    await db.delete(projectExpenses).where(eq(projectExpenses.id, expense.id));
    await logActivity(project.id, userId, userName, 'expense_deleted', `Expense "${expense.description}" deleted: ${expense.amountSek} SEK`, { amount: expense.amountSek });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

router.post("/api/projects/:id/budget/initialize", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { template } = req.body;
    const templateData = BUDGET_TEMPLATES[template];
    if (!templateData) return res.status(400).json({ error: "Invalid template. Use: vinnova, tillvaxtverket, energimyndigheten, generic" });

    const approvedAmount = project.approvedAmountSek || 0;
    const categories = [];

    for (let i = 0; i < templateData.length; i++) {
      const t = templateData[i];
      const budgetedAmount = t.percentage > 0 ? Math.round(approvedAmount * t.percentage / 100) : 0;
      const [cat] = await db.insert(projectBudgetCategories).values({
        projectId: project.id,
        category: t.category,
        categoryLabel: t.categoryLabel,
        budgetedAmountSek: budgetedAmount,
        order: i,
      }).returning();
      categories.push(cat);
    }

    await logActivity(project.id, userId, userName, 'budget_initialized', `Budget initialized from ${template} template`, { template });

    res.json(categories);
  } catch (error) {
    console.error("Error initializing budget:", error);
    res.status(500).json({ error: "Failed to initialize budget" });
  }
});

// ====== 2.5 Team ======
router.get("/api/projects/:id/team", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const members = await db.select().from(projectTeamMembers).where(eq(projectTeamMembers.projectId, project.id));
    res.json(members);
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({ error: "Failed to fetch team" });
  }
});

router.post("/api/projects/:id/team", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [member] = await db.insert(projectTeamMembers).values({ ...req.body, projectId: project.id }).returning();
    await logActivity(project.id, userId, userName, 'team_member_added', `Team member "${member.name}" added as ${member.role}`);

    res.json(member);
  } catch (error) {
    console.error("Error adding team member:", error);
    res.status(500).json({ error: "Failed to add team member" });
  }
});

router.put("/api/projects/:id/team/:memberId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [updated] = await db.update(projectTeamMembers)
      .set(req.body)
      .where(and(eq(projectTeamMembers.id, req.params.memberId), eq(projectTeamMembers.projectId, project.id)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Team member not found" });
    res.json(updated);
  } catch (error) {
    console.error("Error updating team member:", error);
    res.status(500).json({ error: "Failed to update team member" });
  }
});

router.delete("/api/projects/:id/team/:memberId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [member] = await db.select().from(projectTeamMembers)
      .where(and(eq(projectTeamMembers.id, req.params.memberId), eq(projectTeamMembers.projectId, project.id)))
      .limit(1);
    if (!member) return res.status(404).json({ error: "Team member not found" });

    await db.delete(projectTeamMembers).where(eq(projectTeamMembers.id, member.id));
    await logActivity(project.id, userId, userName, 'team_member_removed', `Team member "${member.name}" removed`);

    res.json({ success: true });
  } catch (error) {
    console.error("Error removing team member:", error);
    res.status(500).json({ error: "Failed to remove team member" });
  }
});

router.get("/api/projects/:id/team/cost-projection", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const members = await db.select().from(projectTeamMembers).where(eq(projectTeamMembers.projectId, project.id));
    const categories = await db.select().from(projectBudgetCategories).where(eq(projectBudgetCategories.projectId, project.id));

    const personnelBudget = categories.filter(c => c.category === 'personnel').reduce((sum, c) => sum + c.budgetedAmountSek, 0);
    const personnelSpent = categories.filter(c => c.category === 'personnel').reduce((sum, c) => sum + (c.spentAmountSek || 0), 0);

    let totalMonthlyPersonnelCost = 0;
    const memberProjections = members.map(m => {
      const monthlyCost = (m.monthlyCostSek || 0) * ((m.allocationPercentage || 100) / 100);
      totalMonthlyPersonnelCost += monthlyCost;

      let totalProjectedCost = monthlyCost;
      if (m.startDate && m.endDate) {
        const months = Math.max(1, (new Date(m.endDate).getTime() - new Date(m.startDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000));
        totalProjectedCost = monthlyCost * months;
      } else if (project.projectStartDate && project.projectEndDate) {
        const months = Math.max(1, (new Date(project.projectEndDate).getTime() - new Date(project.projectStartDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000));
        totalProjectedCost = monthlyCost * months;
      }

      return { ...m, monthlyCostAdjusted: Math.round(monthlyCost), totalProjectedCost: Math.round(totalProjectedCost) };
    });

    const totalProjectedCost = memberProjections.reduce((sum, m) => sum + m.totalProjectedCost, 0);

    res.json({
      personnelBudget,
      personnelSpent,
      personnelRemaining: personnelBudget - personnelSpent,
      totalMonthlyPersonnelCost: Math.round(totalMonthlyPersonnelCost),
      totalProjectedCost,
      budgetSufficient: totalProjectedCost <= personnelBudget,
      members: memberProjections,
    });
  } catch (error) {
    console.error("Error computing cost projection:", error);
    res.status(500).json({ error: "Failed to compute cost projection" });
  }
});

// ====== 2.6 Documents ======
router.get("/api/projects/:id/documents", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const documents = await db.select().from(projectDocuments)
      .where(eq(projectDocuments.projectId, project.id))
      .orderBy(desc(projectDocuments.createdAt));

    const grouped: Record<string, typeof documents> = {};
    documents.forEach(doc => {
      const type = doc.documentType || 'other';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(doc);
    });

    res.json({ documents, grouped });
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

router.post("/api/projects/:id/documents", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [document] = await db.insert(projectDocuments).values({
      ...req.body,
      projectId: project.id,
      uploadedBy: userId,
      uploadedByName: userName,
    }).returning();

    await logActivity(project.id, userId, userName, 'document_added', `Document "${document.name}" added`);

    res.json(document);
  } catch (error) {
    console.error("Error adding document:", error);
    res.status(500).json({ error: "Failed to add document" });
  }
});

router.delete("/api/projects/:id/documents/:documentId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [document] = await db.select().from(projectDocuments)
      .where(and(eq(projectDocuments.id, req.params.documentId), eq(projectDocuments.projectId, project.id)))
      .limit(1);
    if (!document) return res.status(404).json({ error: "Document not found" });

    await db.delete(projectDocuments).where(eq(projectDocuments.id, document.id));
    await logActivity(project.id, userId, userName, 'document_deleted', `Document "${document.name}" deleted`);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// ====== 2.7 Risks ======
router.get("/api/projects/:id/risks", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const risks = await db.select().from(projectRisks)
      .where(eq(projectRisks.projectId, project.id))
      .orderBy(desc(projectRisks.riskScore));

    res.json(risks);
  } catch (error) {
    console.error("Error fetching risks:", error);
    res.status(500).json({ error: "Failed to fetch risks" });
  }
});

router.post("/api/projects/:id/risks", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const riskScore = computeRiskScore(req.body.probability || 'low', req.body.impact || 'low');

    const [risk] = await db.insert(projectRisks).values({
      ...req.body,
      projectId: project.id,
      riskScore,
    }).returning();

    await logActivity(project.id, userId, userName, 'risk_created', `Risk "${risk.title}" created (score: ${riskScore})`);

    res.json(risk);
  } catch (error) {
    console.error("Error creating risk:", error);
    res.status(500).json({ error: "Failed to create risk" });
  }
});

router.put("/api/projects/:id/risks/:riskId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [existing] = await db.select().from(projectRisks)
      .where(and(eq(projectRisks.id, req.params.riskId), eq(projectRisks.projectId, project.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Risk not found" });

    const updateData: any = { ...req.body, updatedAt: new Date() };

    if (req.body.probability || req.body.impact) {
      updateData.riskScore = computeRiskScore(req.body.probability || existing.probability || 'low', req.body.impact || existing.impact || 'low');
    }

    if (req.body.status === 'mitigated' && existing.status !== 'mitigated') {
      updateData.mitigatedAt = new Date();
    }

    const [updated] = await db.update(projectRisks)
      .set(updateData)
      .where(eq(projectRisks.id, existing.id))
      .returning();

    await logActivity(project.id, userId, userName, 'risk_updated', `Risk "${existing.title}" updated`, { oldStatus: existing.status, newStatus: req.body.status });

    res.json(updated);
  } catch (error) {
    console.error("Error updating risk:", error);
    res.status(500).json({ error: "Failed to update risk" });
  }
});

router.delete("/api/projects/:id/risks/:riskId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const [risk] = await db.select().from(projectRisks)
      .where(and(eq(projectRisks.id, req.params.riskId), eq(projectRisks.projectId, project.id)))
      .limit(1);
    if (!risk) return res.status(404).json({ error: "Risk not found" });

    await db.delete(projectRisks).where(eq(projectRisks.id, risk.id));
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting risk:", error);
    res.status(500).json({ error: "Failed to delete risk" });
  }
});

// ====== 2.8 Activity & Health ======
router.get("/api/projects/:id/activity", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const limit = parseInt(req.query.limit as string) || 50;
    const conditions = [eq(projectActivityLog.projectId, project.id)];

    if (req.query.type) {
      conditions.push(eq(projectActivityLog.activityType, req.query.type as string));
    }

    if (req.query.before) {
      conditions.push(sql`${projectActivityLog.createdAt} < ${new Date(req.query.before as string)}`);
    }

    const activity = await db.select().from(projectActivityLog)
      .where(and(...conditions))
      .orderBy(desc(projectActivityLog.createdAt))
      .limit(limit);

    res.json(activity);
  } catch (error) {
    console.error("Error fetching activity:", error);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

router.post("/api/projects/:id/health-check", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const now = new Date();
    const issues: string[] = [];
    const recommendations: string[] = [];

    const [milestones, reports, categories, risks] = await Promise.all([
      db.select().from(projectMilestones).where(eq(projectMilestones.projectId, project.id)),
      db.select().from(projectReports).where(eq(projectReports.projectId, project.id)),
      db.select().from(projectBudgetCategories).where(eq(projectBudgetCategories.projectId, project.id)),
      db.select().from(projectRisks).where(and(eq(projectRisks.projectId, project.id), eq(projectRisks.status, 'open'))),
    ]);

    const overdueMilestones = milestones.filter(m => m.status === 'pending' && new Date(m.dueDate) < now);
    if (overdueMilestones.length > 0) {
      issues.push(`${overdueMilestones.length} overdue milestone(s)`);
      recommendations.push('Review and update overdue milestones or request deadline extensions');
    }

    const overdueReports = reports.filter(r => r.status === 'upcoming' && r.dueDate && new Date(r.dueDate) < now);
    if (overdueReports.length > 0) {
      issues.push(`${overdueReports.length} overdue report(s)`);
      recommendations.push('Prioritize submitting overdue reports to maintain funder compliance');
    }

    const totalBudgeted = categories.reduce((sum, c) => sum + c.budgetedAmountSek, 0);
    const totalSpent = categories.reduce((sum, c) => sum + (c.spentAmountSek || 0), 0);
    const burnRate = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0;

    if (burnRate > 0.9) {
      issues.push('Budget utilization above 90%');
      recommendations.push('Review remaining budget and consider requesting additional funding or reducing scope');
    } else if (burnRate > 0.75) {
      recommendations.push('Budget utilization approaching 75%, monitor spending closely');
    }

    const highRisks = risks.filter(r => (r.riskScore || 0) >= 6);
    if (highRisks.length > 0) {
      issues.push(`${highRisks.length} high-severity open risk(s)`);
      recommendations.push('Address high-severity risks with immediate mitigation actions');
    }

    let healthStatus: string;
    if (issues.length === 0) {
      healthStatus = 'on_track';
    } else if (overdueMilestones.length > 0 || overdueReports.length > 0) {
      healthStatus = 'at_risk';
    } else if (issues.length >= 3) {
      healthStatus = 'critical';
    } else {
      healthStatus = 'needs_attention';
    }

    await db.update(grantProjects)
      .set({ healthStatus, updatedAt: new Date() })
      .where(eq(grantProjects.id, project.id));

    res.json({
      healthStatus,
      issues,
      recommendations,
      metrics: {
        overdueMilestones: overdueMilestones.length,
        overdueReports: overdueReports.length,
        budgetBurnRate: Math.round(burnRate * 100),
        openHighRisks: highRisks.length,
      },
    });
  } catch (error) {
    console.error("Error running health check:", error);
    res.status(500).json({ error: "Failed to run health check" });
  }
});

router.post("/api/projects/:id/notes", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);
    const project = await verifyProjectOwnership(req.params.id, userId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { note } = req.body;
    if (!note) return res.status(400).json({ error: "Note content required" });

    const timestamp = new Date().toISOString();
    const noteEntry = `[${timestamp}] ${userName}: ${note}`;
    const updatedNotes = project.notes ? `${project.notes}\n${noteEntry}` : noteEntry;

    const [updated] = await db.update(grantProjects)
      .set({ notes: updatedNotes, updatedAt: new Date() })
      .where(eq(grantProjects.id, project.id))
      .returning();

    await logActivity(project.id, userId, userName, 'note_added', `Note added`, { note });

    res.json(updated);
  } catch (error) {
    console.error("Error adding note:", error);
    res.status(500).json({ error: "Failed to add note" });
  }
});

// POST /api/dev/seed-project — Create realistic test project (development only)
router.post("/api/dev/seed-project", isAuthenticated, async (req: any, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: "Not available in production" });
  }

  try {
    const userId = req.user?.claims?.sub;
    const userName = getUserName(req);

    const userCompanies = await db.select().from(companies).where(eq(companies.userId, userId)).limit(1);
    const companyId = userCompanies[0]?.id || 'seed-company';

    const [project] = await db.insert(grantProjects).values({
      userId,
      companyId,
      title: 'Vinnova Innovationsprojekt — Smart Energi',
      funder: 'Vinnova',
      approvedAmountSek: 750000,
      grantAgreementRef: '2026-00123',
      reportingContactName: 'Anna Svensson',
      reportingContactEmail: 'anna.svensson@vinnova.se',
      funderPortalUrl: 'https://portal.vinnova.se',
      projectStartDate: '2026-03-01',
      projectEndDate: '2027-02-28',
      status: 'active',
      healthStatus: 'at_risk',
      coFundingRequired: true,
      coFundingPercentage: 50,
      coFundingAmountSek: 375000,
      notes: `[2026-03-01T10:00:00Z] ${userName}: Projekt startat, team samlat.`,
    }).returning();

    const now = new Date();
    const milestoneData = [
      { title: 'Kickoff meeting', dueDate: '2026-03-15', status: 'completed', completedAt: new Date('2026-03-15'), order: 0, deliverableType: 'presentation' },
      { title: '6-month progress report', dueDate: '2026-09-01', status: 'completed', completedAt: new Date('2026-09-05'), order: 1, deliverableType: 'report' },
      { title: 'Prototype demo', dueDate: '2026-12-01', status: 'in_progress', completedAt: null, order: 2, deliverableType: 'demo', assignedToName: 'Erik Johansson' },
      { title: '12-month interim report', dueDate: '2027-01-15', status: 'pending', completedAt: null, order: 3, deliverableType: 'report', budgetReleaseAmountSek: 200000 },
      { title: 'Final report & presentation', dueDate: '2027-02-28', status: 'pending', completedAt: null, order: 4, deliverableType: 'report' },
    ];
    for (const m of milestoneData) {
      await db.insert(projectMilestones).values({ projectId: project.id, ...m } as any);
    }

    const reportData = [
      { reportType: 'progress', title: 'Halvtidsrapport — H1 2026', dueDate: '2026-09-15', periodStart: '2026-03-01', periodEnd: '2026-08-31', status: 'submitted', submittedAt: new Date('2026-09-10') },
      { reportType: 'interim', title: 'Interimrapport — Q4 2026', dueDate: '2026-12-20', periodStart: '2026-09-01', periodEnd: '2026-12-31', status: 'upcoming', funderDeadline: '2026-12-31' },
    ];
    for (const r of reportData) {
      await db.insert(projectReports).values({ projectId: project.id, ...r } as any);
    }

    const budgetData = [
      { category: 'personnel', categoryLabel: 'Personnel', budgetedAmountSek: 450000, grantCoveredAmountSek: 225000, coFundingAmountSek: 225000, spentAmountSek: 280000, order: 0 },
      { category: 'equipment', categoryLabel: 'Utrustning', budgetedAmountSek: 112500, grantCoveredAmountSek: 56250, coFundingAmountSek: 56250, spentAmountSek: 45000, order: 1 },
      { category: 'external_services', categoryLabel: 'Externa tjänster', budgetedAmountSek: 75000, grantCoveredAmountSek: 37500, coFundingAmountSek: 37500, spentAmountSek: 30000, order: 2 },
      { category: 'overhead', categoryLabel: 'Overhead', budgetedAmountSek: 112500, grantCoveredAmountSek: 56250, coFundingAmountSek: 56250, spentAmountSek: 50000, order: 3 },
    ];
    const insertedCategories = [];
    for (const b of budgetData) {
      const [cat] = await db.insert(projectBudgetCategories).values({ projectId: project.id, ...b }).returning();
      insertedCategories.push(cat);
    }

    if (insertedCategories[0]) {
      await db.insert(projectExpenses).values([
        { projectId: project.id, categoryId: insertedCategories[0].id, description: 'Lön mars-aug 2026', amountSek: 280000, expenseDate: '2026-08-30', expenseType: 'salary' },
      ]);
    }
    if (insertedCategories[1]) {
      await db.insert(projectExpenses).values([
        { projectId: project.id, categoryId: insertedCategories[1].id, description: 'Testserver AWS', amountSek: 25000, expenseDate: '2026-04-15', expenseType: 'invoice', supplierName: 'Amazon Web Services' },
        { projectId: project.id, categoryId: insertedCategories[1].id, description: 'Sensorpaket', amountSek: 20000, expenseDate: '2026-06-01', expenseType: 'purchase', supplierName: 'Electrokit' },
      ]);
    }

    const teamData = [
      { name: 'Maria Andersson', email: 'maria@techco.se', role: 'project_manager', allocationPercentage: 80, monthlyCostSek: 55000 },
      { name: 'Erik Johansson', email: 'erik@techco.se', role: 'developer', allocationPercentage: 100, monthlyCostSek: 50000 },
      { name: 'Dr. Lisa Berg', email: 'lisa@university.se', role: 'researcher', allocationPercentage: 30, monthlyCostSek: 60000, isExternal: true },
    ];
    for (const t of teamData) {
      await db.insert(projectTeamMembers).values({ projectId: project.id, ...t });
    }

    const riskData = [
      { title: 'Leveransförsening sensorleverantör', description: 'Risk att sensorpaketen levereras senare än planerat', riskType: 'timeline', probability: 'medium', impact: 'high', riskScore: 6, status: 'open', mitigationPlan: 'Identifiera alternativ leverantör' },
      { title: 'Kompetensbrist i teamet', description: 'Risk för att specialistkompetens saknas', riskType: 'technical', probability: 'low', impact: 'medium', riskScore: 2, status: 'mitigated', mitigationPlan: 'Extern konsult anlitad', mitigatedAt: new Date('2026-05-01') },
    ];
    for (const r of riskData) {
      await db.insert(projectRisks).values({ projectId: project.id, ...r } as any);
    }

    const docData = [
      { name: 'Bidragsbeslut Vinnova 2026-00123', documentType: 'grant_agreement', fileUrl: 'https://example.com/grant-agreement.pdf', uploadedBy: userId, uploadedByName: userName },
      { name: 'Kickoff presentation', documentType: 'deliverable', fileUrl: 'https://example.com/kickoff.pptx', uploadedBy: userId, uploadedByName: userName },
      { name: 'Halvtidsrapport H1 2026', documentType: 'progress_report', fileUrl: 'https://example.com/progress-h1.pdf', uploadedBy: userId, uploadedByName: userName },
    ];
    for (const d of docData) {
      await db.insert(projectDocuments).values({ projectId: project.id, ...d });
    }

    const activityData = [
      { activityType: 'status_changed', description: 'Projekt skapat' },
      { activityType: 'member_added', description: 'Teammedlem tillagd: Maria Andersson — Projektledare' },
      { activityType: 'member_added', description: 'Teammedlem tillagd: Erik Johansson — Utvecklare' },
      { activityType: 'member_added', description: 'Teammedlem tillagd: Dr. Lisa Berg — Forskare' },
      { activityType: 'budget_updated', description: 'Budgetkategorier initierade (Vinnova-mall)' },
      { activityType: 'milestone_completed', description: 'Milstolpe slutförd: Kickoff meeting' },
      { activityType: 'document_uploaded', description: 'Dokument uppladdat: Bidragsbeslut Vinnova' },
      { activityType: 'document_uploaded', description: 'Dokument uppladdat: Kickoff presentation' },
      { activityType: 'expense_added', description: 'Kostnad registrerad: Testserver AWS — 25 000 SEK' },
      { activityType: 'expense_added', description: 'Kostnad registrerad: Sensorpaket — 20 000 SEK' },
      { activityType: 'milestone_completed', description: 'Milstolpe slutförd: 6-month progress report' },
      { activityType: 'report_submitted', description: 'Rapport inskickad: Halvtidsrapport — H1 2026' },
      { activityType: 'expense_added', description: 'Kostnad registrerad: Lön mars-aug 2026 — 280 000 SEK' },
      { activityType: 'note_added', description: 'Anteckning tillagd' },
      { activityType: 'status_changed', description: 'Hälsostatus ändrad: at_risk — överbudget i personalbudget' },
    ];
    for (let i = 0; i < activityData.length; i++) {
      const createdAt = new Date('2026-03-01');
      createdAt.setDate(createdAt.getDate() + i * 12);
      await db.insert(projectActivityLog).values({
        projectId: project.id,
        userId,
        userName,
        ...activityData[i],
        createdAt,
      });
    }

    res.json({ message: "Test project created", projectId: project.id });
  } catch (error) {
    console.error("Error seeding project:", error);
    res.status(500).json({ error: "Failed to seed project" });
  }
});

export default router;
