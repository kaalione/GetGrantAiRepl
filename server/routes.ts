import type { Express } from "express";
import type { Server } from "http";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import express from "express";
import { storage } from "./storage";
import { insertGrantSchema, insertCompanySchema, insertApplicationSchema, insertScraperSourceSchema, insertScraperLogSchema, users, grantAlerts, companies, type Grant, type GrantAlert, type Company } from "@shared/schema";
import { z } from "zod";
import { generateApplication } from "./lib/claude";
import { generateStructuredApplication, regenerateSection, getTemplateForGrant, getTemplateBySource, getAllTemplates, type ProjectData } from "./services/applicationWriter";
import { calculateSemanticMatch } from "./lib/semantic-matching";
import { generateMatchExplanation } from "./services/matchExplanation";
import { isAuthenticated } from "./replit_integrations/auth";
import { semanticAnalysisLimiter, aiGenerationLimiter } from "./middleware/rate-limit";
import { createCheckoutSession, createCustomerPortalSession, getUserSubscription, updateUserSubscription, PRICE_IDS } from "./services/stripe";
import { getStripePublishableKey } from "./lib/stripeClient";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { requirePlan } from "./middleware/plan-check";
import { APP_URL } from "./lib/appUrl";
import collaborationRoutes from "./routes/collaboration";
import contentLibraryRoutes from "./routes/contentLibrary";
import projectRoutes from "./routes/projects";
import successFeeRoutes from "./routes/successFee";
import partnerRoutes, { whitelabelConfigRouter } from "./routes/partners";
import partnerDomainRoutes from "./routes/partnerDomain";
import partnerAdminRoutes from "./routes/partnerAdmin";
import { validatePartnerApiKey } from "./middleware/partnerApiAuth";
import onboardingRoutes from "./routes/onboarding";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.use("/api", collaborationRoutes);
  app.use(contentLibraryRoutes);
  app.use(projectRoutes);
  app.use("/api/success-fee", successFeeRoutes);
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  app.use("/api/partners", validatePartnerApiKey, partnerRoutes);
  app.use("/api/partner", validatePartnerApiKey, partnerRoutes);
  app.use("/api/partner", validatePartnerApiKey, partnerDomainRoutes);
  app.use("/api", whitelabelConfigRouter);
  app.use("/api", partnerAdminRoutes);
  app.use("/api", onboardingRoutes);
  
  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // User status (for onboarding flow)
  app.get("/api/user/status", async (req: any, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    try {
      const userId = req.user?.claims?.sub;
      const expiresAt = req.user?.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const isValidSession = userId && req.isAuthenticated?.() && expiresAt && now <= expiresAt;
      if (!isValidSession) {
        if (userId && req.session) {
          req.session.destroy(() => {});
        }
        return res.json({ isNewUser: true, hasCompany: false, isAuthenticated: false });
      }
      
      const companies = await storage.getCompaniesByUserId(userId);
      const hasCompany = companies.length > 0;

      let onboardingSkippedOrCompleted = false;
      if (!hasCompany) {
        const { onboardingSessions } = await import("@shared/schema");
        const { eq, and, or, isNotNull } = await import("drizzle-orm");
        const sessions = await db.select({ id: onboardingSessions.id })
          .from(onboardingSessions)
          .where(
            and(
              eq(onboardingSessions.userId, userId),
              or(
                isNotNull(onboardingSessions.completedAt),
                isNotNull(onboardingSessions.skippedAt)
              )
            )
          )
          .limit(1);
        onboardingSkippedOrCompleted = sessions.length > 0;
      }
      
      let profileCompletion = 0;
      if (hasCompany) {
        const company = companies[0];
        const fields = [
          company.companyName, company.orgNumber, company.industry,
          company.employees, company.revenue, company.foundedYear,
          company.description, company.location,
        ];
        profileCompletion = Math.round((fields.filter(Boolean).length / fields.length) * 100);
      }

      let resumeOnboardingSessionId: string | null = null;
      if (hasCompany && profileCompletion < 40) {
        const { onboardingSessions: obSessions } = await import("@shared/schema");
        const { eq: eqOp, and: andOp, isNull } = await import("drizzle-orm");
        const activeSessions = await db.select({ id: obSessions.id })
          .from(obSessions)
          .where(
            andOp(
              eqOp(obSessions.userId, userId),
              isNull(obSessions.completedAt),
              isNull(obSessions.skippedAt)
            )
          )
          .limit(1);
        if (activeSessions.length > 0) {
          resumeOnboardingSessionId = activeSessions[0].id;
        }
      }

      const [userRecord] = await db.select().from(users).where(eq(users.id, userId));
      const userPlan = userRecord?.plan || "free";

      res.json({
        isNewUser: !hasCompany && !onboardingSkippedOrCompleted,
        hasCompany,
        isAuthenticated: true,
        userId,
        profileCompletion,
        resumeOnboardingSessionId,
        plan: userPlan,
        freeApplicationUsed: userRecord?.freeApplicationUsed || false,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user status" });
    }
  });

  // User profile completion (for dashboard progress)
  app.get("/api/user/profile-completion", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companies = await storage.getCompaniesByUserId(userId);
      
      if (companies.length === 0) {
        return res.json({ percentage: 0, missing: ['company'] });
      }
      
      const company = companies[0];
      let completed = 0;
      let total = 8;
      const missing: string[] = [];
      
      if (company.companyName) completed++; else missing.push('companyName');
      if (company.orgNumber) completed++; else missing.push('orgNumber');
      if (company.industry) completed++; else missing.push('industry');
      if (company.employees) completed++; else missing.push('employees');
      if (company.revenue) completed++; else missing.push('revenue');
      if (company.foundedYear) completed++; else missing.push('foundedYear');
      if (company.description) completed++; else missing.push('description');
      if (company.location) completed++; else missing.push('location');
      
      res.json({
        percentage: Math.round((completed / total) * 100),
        missing,
        company,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile completion" });
    }
  });

  // Onboarding progress - tracks user milestones for progress tracker (DB-persisted)
  app.get("/api/user/onboarding-progress", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companies = await storage.getCompaniesByUserId(userId);
      const hasCompany = companies.length > 0;
      const company = companies[0];
      
      const existing = await storage.getUserProgress(userId);
      const updates: any = {};
      
      if (hasCompany) {
        updates.profileCreated = true;
        if (!existing?.profileCreatedAt) updates.profileCreatedAt = company.createdAt || new Date();
        
        const fields = [company.companyName, company.orgNumber, company.industry, company.employees, company.revenue, company.foundedYear, company.description, company.location];
        const filledCount = fields.filter(f => f !== null && f !== undefined && f !== '' && f !== 0).length;
        const completionPct = Math.round((filledCount / fields.length) * 100);
        if (completionPct >= 90) {
          updates.profileCompleted = true;
          if (!existing?.profileCompletedAt) updates.profileCompletedAt = new Date();
        }
      }
      
      const applications = hasCompany 
        ? await storage.getApplicationsByUserId(userId) 
        : [];
      
      if (applications.length > 0) {
        updates.firstGrantViewed = true;
        if (!existing?.firstGrantViewedAt) updates.firstGrantViewedAt = new Date();
      }
      
      const hasGeneratedApp = applications.some(app => app.generatedContent && app.generatedContent.length > 0);
      if (hasGeneratedApp) {
        updates.firstApplicationGenerated = true;
        if (!existing?.firstApplicationAt) updates.firstApplicationAt = new Date();
      }
      
      const hasSubmitted = applications.some(app => app.status === 'submitted' || app.status === 'under_review' || app.status === 'approved');
      if (hasSubmitted) {
        updates.firstApplicationSubmitted = true;
        if (!existing?.firstSubmissionAt) updates.firstSubmissionAt = new Date();
      }
      
      const progress = await storage.upsertUserProgress(userId, updates);
      
      const milestones = [
        { key: 'profileCreated', completed: !!progress.profileCreated, completedAt: progress.profileCreatedAt },
        { key: 'profileCompleted', completed: !!progress.profileCompleted, completedAt: progress.profileCompletedAt },
        { key: 'firstGrantViewed', completed: !!progress.firstGrantViewed, completedAt: progress.firstGrantViewedAt },
        { key: 'firstAIAnalysisRun', completed: !!progress.firstAIAnalysisRun, completedAt: progress.firstAIAnalysisAt },
        { key: 'firstApplicationGenerated', completed: !!progress.firstApplicationGenerated, completedAt: progress.firstApplicationAt },
        { key: 'firstApplicationSubmitted', completed: !!progress.firstApplicationSubmitted, completedAt: progress.firstSubmissionAt },
      ];
      
      const completedCount = milestones.filter(m => m.completed).length;
      
      res.json({
        ...progress,
        milestones,
        completedCount,
        totalSteps: milestones.length,
        companyCreated: !!progress.profileCreated,
        firstMatchViewed: !!progress.firstGrantViewed,
        firstApplicationGenerated: !!progress.firstApplicationGenerated,
      });
    } catch (error) {
      console.error("Progress error:", error);
      res.status(500).json({ error: "Failed to fetch onboarding progress" });
    }
  });

  // GET notification preferences
  app.get("/api/notifications/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      let prefs = await storage.getNotificationPreferences(userId);
      if (!prefs) {
        prefs = await storage.upsertNotificationPreferences(userId, {});
      }
      res.json(prefs);
    } catch (error) {
      console.error("Get notification preferences error:", error);
      res.status(500).json({ error: "Failed to fetch notification preferences" });
    }
  });

  // PATCH notification preferences
  app.patch("/api/notifications/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const allowedFields = [
        'emailNotificationsEnabled', 'newGrantsEnabled', 'newGrantsFrequency',
        'newGrantsMinMatchScore', 'deadlineRemindersEnabled', 'deadlineReminderDays',
        'weeklyDigestEnabled', 'weeklyDigestDay', 'preferredHour'
      ];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }
      const prefs = await storage.upsertNotificationPreferences(userId, updates);
      res.json(prefs);
    } catch (error) {
      console.error("Update notification preferences error:", error);
      res.status(500).json({ error: "Failed to update notification preferences" });
    }
  });

  app.post("/api/notifications/push-subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { subscription } = req.body;
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: "Invalid push subscription object" });
      }
      const prefs = await storage.upsertNotificationPreferences(userId, {
        pushEnabled: true,
        pushSubscription: subscription,
      });
      res.json({ success: true, pushEnabled: prefs.pushEnabled });
    } catch (error) {
      console.error("Push subscribe error:", error);
      res.status(500).json({ error: "Failed to save push subscription" });
    }
  });

  app.delete("/api/notifications/push-subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const prefs = await storage.upsertNotificationPreferences(userId, {
        pushEnabled: false,
        pushSubscription: null,
      });
      res.json({ success: true, pushEnabled: prefs.pushEnabled });
    } catch (error) {
      console.error("Push unsubscribe error:", error);
      res.status(500).json({ error: "Failed to remove push subscription" });
    }
  });

  // POST test email notification
  app.post("/api/notifications/test", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userEmail = req.user?.claims?.email;
      const userName = req.user?.claims?.first_name || '';
      
      if (!userEmail) {
        return res.status(400).json({ error: "No email address found for your account" });
      }

      const { sendEmail } = await import('./lib/resend');
      
      await sendEmail({
        to: userEmail,
        subject: 'GetGrant.ai - Test Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #3b82f6;">Test Email fr&aring;n GetGrant.ai</h1>
            <p>Hej ${userName || 'där'}!</p>
            <p>Detta &auml;r ett test-email f&ouml;r att bekr&auml;fta att dina email-notiser fungerar.</p>
            <p>Om du ser detta meddelande &auml;r allt korrekt konfigurerat!</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">
              GetGrant.ai - AI-driven bidragsplattform f&ouml;r svenska f&ouml;retag
            </p>
          </div>
        `,
      });

      res.json({ success: true, message: "Test email sent successfully" });
    } catch (error) {
      console.error("Send test email error:", error);
      res.status(500).json({ error: "Failed to send test email" });
    }
  });

  // Top matches for user (for onboarding and dashboard)
  app.get("/api/grants/top-matches", async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.query.companyId as string | undefined;
      
      let company = null;
      
      if (companyId && userId) {
        const requestedCompany = await storage.getCompany(companyId);
        if (requestedCompany && requestedCompany.userId === userId) {
          company = requestedCompany;
        }
      } else if (userId) {
        const companies = await storage.getCompaniesByUserId(userId);
        company = companies[0] || null;
      }
      
      const grants = await storage.getGrantsFiltered({ status: 'open' });
      
      if (!company) {
        const topGrants = grants.slice(0, 5).map(g => ({
          ...g,
          matchScore: Math.floor(Math.random() * 20) + 70,
        }));
        return res.json(topGrants);
      }
      
      const scoredGrants = grants.map(grant => {
        let score = 50;
        
        if (grant.keywords && company.industry) {
          const grantKeywords = grant.keywords as string[];
          const companyIndustry = company.industry.toLowerCase();
          const matches = grantKeywords.filter(k => 
            companyIndustry.includes(k.toLowerCase()) || 
            k.toLowerCase().includes(companyIndustry)
          );
          score += matches.length * 10;
        }
        
        if (grant.targetGroup) {
          const targetGroups = grant.targetGroup as string[];
          if (targetGroups.includes('sme') && (company.employees || 0) < 250) score += 15;
          if (targetGroups.includes('startup') && (company.employees || 0) < 50) score += 10;
        }
        
        return { ...grant, matchScore: Math.min(score, 99) };
      });
      
      const topGrants = scoredGrants
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 5);
      
      res.json(topGrants);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch top matches" });
    }
  });

  // Grant sources (for filters)
  app.get("/api/grants/sources", async (req, res) => {
    try {
      const sources = await storage.getUniqueGrantSources();
      res.json(sources);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch grant sources" });
    }
  });

  // Upcoming deadlines API
  app.get("/api/grants/deadlines/upcoming", async (req: any, res) => {
    try {
      const allGrants = await storage.getGrants();
      const now = new Date();
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
      
      const upcomingGrants = allGrants
        .filter(g => {
          if (!g.deadline || g.status !== 'open') return false;
          const deadline = new Date(g.deadline);
          return deadline >= now && deadline <= twoWeeksFromNow;
        })
        .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
      
      res.json(upcomingGrants);
    } catch (error) {
      console.error('Fetch upcoming deadlines error:', error);
      res.status(500).json({ error: 'Failed to fetch upcoming deadline grants' });
    }
  });

  // Grants routes
  app.get("/api/grants", async (req, res) => {
    try {
      const { source, status, deadlineDays, amountMin, amountMax, search, matchProfile, market } = req.query;
      
      const hasFilters = source || status || deadlineDays || amountMin || amountMax || search;
      
      let allGrants: Grant[];
      if (hasFilters) {
        const filters = {
          source: source as string | undefined,
          status: status as string | undefined,
          deadlineDays: deadlineDays ? parseInt(deadlineDays as string, 10) : undefined,
          amountMin: amountMin ? parseFloat(amountMin as string) : undefined,
          amountMax: amountMax ? parseFloat(amountMax as string) : undefined,
          search: search as string | undefined,
        };
        allGrants = await storage.getGrantsFiltered(filters);
      } else {
        allGrants = await storage.getGrants();
      }

      if (market && typeof market === 'string') {
        allGrants = allGrants.filter(g => (g as any).market === market || !(g as any).market);
      }

      const userId = (req as any).user?.claims?.sub;
      if (matchProfile === 'true' && userId) {
        const userCompanies = await storage.getCompaniesByUserId(userId);
        const company = userCompanies[0];
        if (company) {
          const now = new Date();
          const nordicMaxOffsetMs = 3 * 3600000;
          const todayNordic = new Date(now.getTime() + nordicMaxOffsetMs);
          const cutoffDate = todayNordic.toISOString().slice(0, 10);

          const filtered = allGrants.filter((grant) => {
            if (grant.deadline) {
              const deadlineDate = new Date(grant.deadline).toISOString().slice(0, 10);
              if (deadlineDate <= cutoffDate) return false;
            }

            const criteria = grant.eligibilityCriteria as Record<string, unknown> | null;
            if (!criteria || !criteria.company_types) return true;

            let matches = 0;
            let totalChecks = 0;

            if (Array.isArray(criteria.company_types) && criteria.company_types.length > 0) {
              totalChecks++;
              const compType = (company.orgType || '').toLowerCase();
              if (criteria.company_types.some((t: string) => 
                compType.includes(t.toLowerCase()) || t.toLowerCase().includes('alla') || t.toLowerCase().includes('all')
              )) matches++;
            }

            const geo = criteria.geography as { regions?: string[]; counties?: string[]; description?: string } | undefined;
            if (geo && (geo.regions?.length || geo.counties?.length)) {
              totalChecks++;
              const companyLocation = (company.location || '').toLowerCase();
              if (!companyLocation || 
                  geo.regions?.some((r: string) => r.toLowerCase().includes('hela sverige') || r.toLowerCase().includes('all') || companyLocation.includes(r.toLowerCase())) ||
                  geo.counties?.some((c: string) => companyLocation.includes(c.toLowerCase()))
              ) matches++;
            }

            if (Array.isArray(criteria.sectors) && criteria.sectors.length > 0) {
              totalChecks++;
              const companyIndustry = (company.industry || '').toLowerCase();
              if (!companyIndustry ||
                  criteria.sectors.some((s: string) => 
                    companyIndustry.includes(s.toLowerCase()) || s.toLowerCase().includes('alla') || s.toLowerCase().includes('all')
                  )
              ) matches++;
            }

            if (totalChecks === 0) return true;
            return matches > 0;
          });
          const lightFiltered = filtered.map(({ rawData, ...rest }) => rest);
          res.json(lightFiltered);
          return;
        }
      }

      const lightGrants = allGrants.map(({ rawData, ...rest }) => rest);
      res.json(lightGrants);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch grants" });
    }
  });

  // ============ ELIGIBILITY CHECKER ROUTES ============

  app.get("/api/grants/eligibility-overview", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userCompanies = await storage.getCompaniesByUserId(userId);
      const company = userCompanies[0];

      if (!company) {
        return res.json({ eligible: [], almost: [], not_eligible: [], counts: { eligible: 0, almost: 0, not_eligible: 0 } });
      }

      const { hashProfile } = await import("./utils/profileHash");
      const currentHash = hashProfile(company);

      const { checkEligibility } = await import("./services/eligibilityChecker");
      const allGrants = await storage.getGrants();
      const openGrants = allGrants.filter((g: any) => g.status === "open").slice(0, 200);

      const cachedChecks = await storage.getEligibilityChecksByCompanyAndHash(company.id, currentHash);
      const cachedGrantIds = new Set(cachedChecks.map(c => c.grantId));

      const coverageRatio = openGrants.length > 0 ? cachedChecks.length / openGrants.length : 0;
      const isCacheHit = coverageRatio >= 0.95;

      let allResults: any[] = [];

      if (isCacheHit) {
        allResults = cachedChecks.map(c => ({
          grantId: c.grantId,
          grantTitle: openGrants.find(g => g.id === c.grantId)?.title || '',
          source: openGrants.find(g => g.id === c.grantId)?.sourceName || '',
          deadline: openGrants.find(g => g.id === c.grantId)?.deadline,
          score: c.score,
          checksPassed: (c.result as any)?.checksPassed || 0,
          checksTotal: (c.result as any)?.checksCompleted || 0,
          nextSteps: ((c.result as any)?.nextSteps || []).slice(0, 1),
          overallStatus: c.verdict,
        }));
      } else {
        for (const check of cachedChecks) {
          const grant = openGrants.find(g => g.id === check.grantId);
          if (!grant) continue;
          allResults.push({
            grantId: check.grantId,
            grantTitle: grant.title,
            source: grant.sourceName,
            deadline: grant.deadline,
            score: check.score,
            checksPassed: (check.result as any)?.checksPassed || 0,
            checksTotal: (check.result as any)?.checksCompleted || 0,
            nextSteps: ((check.result as any)?.nextSteps || []).slice(0, 1),
            overallStatus: check.verdict,
          });
        }

        const uncachedGrants = openGrants.filter(g => !cachedGrantIds.has(g.id));
        for (const grant of uncachedGrants) {
          const result = checkEligibility(company, grant);
          if (result.overallStatus === "unknown") continue;

          try {
            await storage.upsertEligibilityCheck({
              grantId: grant.id,
              companyId: company.id,
              verdict: result.overallStatus,
              score: result.score,
              result: { verdict: result.overallStatus as any, score: result.score, criteria: result.criteria || [], summary: result.summary || '', blockers: result.blockers || [], warnings: result.warnings || [], strengths: result.strengths || [] },
              source: 'structured',
              profileHash: currentHash,
            });
          } catch {}

          allResults.push({
            grantId: grant.id,
            grantTitle: grant.title,
            source: grant.sourceName,
            deadline: grant.deadline,
            score: result.score,
            checksPassed: result.checksPassed,
            checksTotal: result.checksCompleted,
            nextSteps: result.nextSteps.slice(0, 1),
            overallStatus: result.overallStatus,
          });
        }
      }

      const eligible = allResults.filter(r => r.overallStatus === "eligible").sort((a, b) => b.score - a.score);
      const almost = allResults.filter(r => r.overallStatus === "almost_eligible").sort((a, b) => b.score - a.score);
      const notEligible = allResults.filter(r => r.overallStatus !== "eligible" && r.overallStatus !== "almost_eligible");

      res.set('X-Cache', isCacheHit ? 'HIT' : 'MISS');
      res.json({
        eligible,
        almost,
        not_eligible: notEligible,
        counts: {
          eligible: eligible.length,
          almost: almost.length,
          not_eligible: notEligible.length,
        },
      });
      // TODO: run full recheck nightly via cron
    } catch (error) {
      console.error("Eligibility overview error:", error);
      res.status(500).json({ error: "Failed to get eligibility overview" });
    }
  });

  app.get("/api/grants/:id/eligibility", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userCompanies = await storage.getCompaniesByUserId(userId);
      const company = userCompanies[0];

      if (!company) {
        return res.status(400).json({ error: "Skapa en företagsprofil först" });
      }

      const grant = await storage.getGrant(req.params.id);
      if (!grant) {
        return res.status(404).json({ error: "Bidrag hittades inte" });
      }

      const { checkEligibility } = await import("./services/eligibilityChecker");
      const result = checkEligibility(company, grant);
      res.json(result);
    } catch (error) {
      console.error("Eligibility check error:", error);
      res.status(500).json({ error: "Failed to check eligibility" });
    }
  });

  app.get("/api/grants/:id/explain-match", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userCompanies = await storage.getCompaniesByUserId(userId);
      if (!userCompanies.length) {
        return res.json({ explanation: null, cached: false });
      }
      const company = userCompanies[0];
      const cached = await storage.getMatchExplanation(req.params.id, company.id);
      if (cached) {
        return res.json({
          explanation: { headline: cached.headline, reasons: cached.reasons, bestFitAspect: cached.bestFitAspect, matchScore: cached.matchScore },
          cached: true,
          createdAt: cached.createdAt,
        });
      }
      res.json({ explanation: null, cached: false });
    } catch (error) {
      console.error("Get match explanation error:", error);
      res.status(500).json({ error: "Failed to get match explanation" });
    }
  });

  app.post("/api/grants/:id/explain-match", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userCompanies = await storage.getCompaniesByUserId(userId);
      if (!userCompanies.length) {
        return res.status(400).json({ error: "No company profile found" });
      }
      const company = userCompanies[0];
      const grant = await storage.getGrant(req.params.id);
      if (!grant) {
        return res.status(404).json({ error: "Grant not found" });
      }

      const matchScore = req.body.matchScore ?? 50;

      if (matchScore < 40) {
        return res.json({
          explanation: {
            headline: grant.sourceType === 'eu' ? 'Low match — review criteria before applying' : 'Låg matchning — granska kriterierna innan ansökan',
            reasons: [],
            bestFitAspect: grant.sourceType === 'eu' ? 'Limited alignment' : 'Begränsad överensstämmelse',
            matchScore,
          },
          cached: false,
        });
      }

      const existing = await storage.getMatchExplanation(grant.id, company.id);
      if (existing && !req.body.forceRefresh) {
        return res.json({
          explanation: { headline: existing.headline, reasons: existing.reasons, bestFitAspect: existing.bestFitAspect, matchScore: existing.matchScore },
          cached: true,
          createdAt: existing.createdAt,
        });
      }

      const result = await generateMatchExplanation(grant, company, matchScore);

      const saved = await storage.upsertMatchExplanation({
        grantId: grant.id,
        companyId: company.id,
        matchScore,
        headline: result.headline,
        reasons: result.reasons,
        bestFitAspect: result.bestFitAspect,
      });

      res.json({
        explanation: { headline: saved.headline, reasons: saved.reasons, bestFitAspect: saved.bestFitAspect, matchScore: saved.matchScore },
        cached: false,
        createdAt: saved.createdAt,
      });
    } catch (error) {
      console.error("Generate match explanation error:", error);
      res.status(500).json({ error: "Failed to generate match explanation" });
    }
  });

  app.get("/api/grants/:id/eligibility-check", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userCompanies = await storage.getCompaniesByUserId(userId);
      const company = userCompanies[0];

      if (!company) {
        return res.json({ cached: false, result: null });
      }

      const { isCacheValid } = await import("./services/aiEligibilityChecker");
      const cached = await storage.getEligibilityCheck(req.params.id, company.id);

      if (cached && isCacheValid(cached.checkedAt)) {
        return res.json({ cached: true, result: cached.result, checkedAt: cached.checkedAt, source: cached.source });
      }

      return res.json({ cached: false, result: null });
    } catch (error) {
      console.error("Get eligibility check error:", error);
      res.status(500).json({ error: "Failed to get eligibility check" });
    }
  });

  app.post("/api/grants/:id/eligibility-check", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userCompanies = await storage.getCompaniesByUserId(userId);
      const company = userCompanies[0];

      if (!company) {
        return res.status(400).json({ error: "Skapa en företagsprofil först" });
      }

      const grant = await storage.getGrant(req.params.id);
      if (!grant) {
        return res.status(404).json({ error: "Bidrag hittades inte" });
      }

      const { isCacheValid, runEligibilityCheck } = await import("./services/aiEligibilityChecker");
      const forceRefresh = req.body?.forceRefresh === true;

      if (!forceRefresh) {
        const cached = await storage.getEligibilityCheck(grant.id, company.id);
        if (cached && isCacheValid(cached.checkedAt)) {
          return res.json({ result: cached.result, checkedAt: cached.checkedAt, source: cached.source, cached: true });
        }
      }

      const { result, source } = await runEligibilityCheck(grant, company);

      const saved = await storage.upsertEligibilityCheck({
        grantId: grant.id,
        companyId: company.id,
        verdict: result.verdict,
        score: result.score,
        result,
        source,
      });

      res.json({ result: saved.result, checkedAt: saved.checkedAt, source: saved.source, cached: false });
    } catch (error) {
      console.error("Eligibility check error:", error);
      res.status(500).json({ error: "Failed to run eligibility check" });
    }
  });

  app.get("/api/grants/:id", async (req, res) => {
    try {
      const grant = await storage.getGrant(req.params.id);
      if (!grant) {
        return res.status(404).json({ error: "Grant not found" });
      }
      res.json(grant);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch grant" });
    }
  });

  app.post("/api/grants", async (req, res) => {
    try {
      const data = insertGrantSchema.parse(req.body);
      const grant = await storage.createGrant(data);
      res.status(201).json(grant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create grant" });
    }
  });

  app.patch("/api/grants/:id", async (req, res) => {
    try {
      const data = insertGrantSchema.partial().parse(req.body);
      const grant = await storage.updateGrant(req.params.id, data);
      if (!grant) {
        return res.status(404).json({ error: "Grant not found" });
      }
      res.json(grant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update grant" });
    }
  });

  app.delete("/api/grants/:id", async (req, res) => {
    try {
      await storage.deleteGrant(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete grant" });
    }
  });

  // Companies routes (protected - require authentication)
  app.get("/api/companies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companies = await storage.getCompaniesByUserId(userId);
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      // Check ownership - company must belong to current user
      if (company.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.post("/api/company/research", isAuthenticated, async (req: any, res) => {
    try {
      const { input } = req.body;

      if (!input || input.trim().length < 3) {
        return res.status(400).json({ error: "Ange en webbadress eller organisationsnummer" });
      }

      const { researchCompany } = await import("./services/companyResearch");
      const profile = await researchCompany(input);
      res.json({ success: true, profile });
    } catch (error) {
      console.error("Company research failed:", error);
      res.status(500).json({ error: "Kunde inte analysera företaget. Försök igen." });
    }
  });

  app.post("/api/companies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const data = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany({ ...data, userId });
      try {
        await storage.upsertUserProgress(userId, { profileCreated: true, profileCreatedAt: new Date() });
      } catch (e) { /* progress tracking is non-critical */ }
      res.status(201).json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create company" });
    }
  });

  app.patch("/api/companies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const existing = await storage.getCompany(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Company not found" });
      }
      // Strict ownership check - company must belong to current user
      if (existing.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const data = insertCompanySchema.partial().parse(req.body);
      const company = await storage.updateCompany(req.params.id, data);
      try {
        if (company) {
          const fields = [company.companyName, company.orgNumber, company.industry, company.employees, company.revenue, company.foundedYear, company.description, company.location];
          const filledCount = fields.filter(f => f !== null && f !== undefined && f !== '' && f !== 0).length;
          if (Math.round((filledCount / fields.length) * 100) >= 90) {
            await storage.upsertUserProgress(userId, { profileCompleted: true, profileCompletedAt: new Date() });
          }
        }
      } catch (e) { /* progress tracking is non-critical */ }
      try {
        await storage.deleteEligibilityChecksByCompany(req.params.id);
      } catch (e) { /* cache invalidation is non-critical */ }
      res.json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.put("/api/companies/market", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { market } = req.body;
      if (!market || !['se', 'no', 'fi'].includes(market)) {
        return res.status(400).json({ error: "Invalid market. Must be 'se', 'no', or 'fi'" });
      }
      const companies = await storage.getCompaniesByUserId(userId);
      if (companies.length > 0) {
        const company = companies[0];
        await storage.updateCompany(company.id, { market });
      }
      res.json({ success: true, market });
    } catch (error) {
      res.status(500).json({ error: "Failed to update market" });
    }
  });

  app.delete("/api/companies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const existing = await storage.getCompany(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Company not found" });
      }
      // Strict ownership check - company must belong to current user
      if (existing.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      await storage.deleteCompany(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete company" });
    }
  });

  // Applications routes (protected - require authentication)
  app.get("/api/applications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const applications = await storage.getApplicationsByUserId(userId);
      res.json(applications);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch applications" });
    }
  });

  // Helper function for fail-closed ownership verification
  async function verifyCompanyOwnership(companyId: string | null, userId: string): Promise<{ allowed: boolean; error?: string }> {
    if (!companyId) {
      return { allowed: false, error: "Company ID is required" };
    }
    const company = await storage.getCompany(companyId);
    if (!company) {
      return { allowed: false, error: "Company not found" };
    }
    if (company.userId !== userId) {
      return { allowed: false, error: "Access denied" };
    }
    return { allowed: true };
  }

  app.get("/api/applications/templates", isAuthenticated, async (_req: any, res) => {
    try {
      res.json(getAllTemplates());
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/applications/templates/:grantId", isAuthenticated, async (req: any, res) => {
    try {
      const grant = await storage.getGrant(req.params.grantId);
      if (!grant) {
        return res.status(404).json({ error: "Grant not found" });
      }
      const template = getTemplateForGrant(grant);
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  app.get("/api/applications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const application = await storage.getApplication(req.params.id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      // Fail-closed: require valid company ownership
      const ownership = await verifyCompanyOwnership(application.companyId, userId);
      if (!ownership.allowed) {
        return res.status(403).json({ error: ownership.error || "Access denied" });
      }
      res.json(application);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch application" });
    }
  });

  app.post("/api/applications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const data = insertApplicationSchema.parse(req.body);
      // Fail-closed: require valid company ownership
      const ownership = await verifyCompanyOwnership(data.companyId ?? null, userId);
      if (!ownership.allowed) {
        return res.status(403).json({ error: ownership.error || "Access denied" });
      }
      const application = await storage.createApplication(data);
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create application" });
    }
  });

  app.patch("/api/applications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const existing = await storage.getApplication(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Application not found" });
      }
      // Fail-closed: require valid company ownership
      const ownership = await verifyCompanyOwnership(existing.companyId, userId);
      if (!ownership.allowed) {
        return res.status(403).json({ error: ownership.error || "Access denied" });
      }
      const data = insertApplicationSchema.partial().parse(req.body);
      const application = await storage.updateApplication(req.params.id, data);
      res.json(application);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update application" });
    }
  });

  // Update application status (separate endpoint for explicit status management)
  const statusUpdateSchema = z.object({
    status: z.enum(['draft', 'ready', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn']),
    submissionMethod: z.enum(['bidragai', 'manual', 'external']).optional(),
    approvedAmount: z.string().regex(/^\d+(\.\d+)?$/, "Must be a valid number").optional(),
  });

  app.patch("/api/applications/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const existing = await storage.getApplication(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Application not found" });
      }
      // Fail-closed: require valid company ownership
      const ownership = await verifyCompanyOwnership(existing.companyId, userId);
      if (!ownership.allowed) {
        return res.status(403).json({ error: ownership.error || "Access denied" });
      }
      
      const validation = statusUpdateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }
      
      const { status, submissionMethod, approvedAmount } = validation.data;
      
      const updateData: any = { 
        status,
        statusUpdatedAt: new Date(),
      };
      
      // Set submittedAt when status changes to submitted
      if (status === 'submitted' && !existing.submittedAt) {
        updateData.submittedAt = new Date();
        if (submissionMethod) {
          updateData.submissionMethod = submissionMethod;
        }
      }
      
      // Set approved amount when status is approved (coerce to numeric)
      if (status === 'approved' && approvedAmount) {
        updateData.approvedAmount = parseFloat(approvedAmount);
      }
      
      const application = await storage.updateApplication(req.params.id, updateData);
      try {
        if (status === 'submitted') {
          await storage.upsertUserProgress(userId, { firstApplicationSubmitted: true, firstSubmissionAt: new Date() });
          const { extractContentBlocks, saveExtractedBlocks } = await import("./services/contentLibrary");
          const [company] = await db.select().from(companies).where(eq(companies.userId, userId)).limit(1);
          if (company && application && application.sections && application.sections.length > 0) {
            extractContentBlocks(application as any, company).then(async (blocks) => {
              if (blocks.length > 0 && application) {
                await saveExtractedBlocks(blocks, application.id, userId, company.id);
              }
            }).catch((e) => console.error("Auto-extraction failed:", e));
          }
        }
      } catch (e) { /* progress tracking is non-critical */ }
      res.json(application);
    } catch (error) {
      res.status(500).json({ error: "Failed to update application status" });
    }
  });

  app.delete("/api/applications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const existing = await storage.getApplication(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Application not found" });
      }
      // Fail-closed: require valid company ownership
      const ownership = await verifyCompanyOwnership(existing.companyId, userId);
      if (!ownership.allowed) {
        return res.status(403).json({ error: ownership.error || "Access denied" });
      }
      await storage.deleteApplication(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete application" });
    }
  });

  // AI Application Generation (protected + rate limited)
  // Free users get 1 trial application; after that they need Pro
  app.post("/api/applications/generate", isAuthenticated, aiGenerationLimiter, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;

      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
      const userPlan = currentUser?.plan || "free";

      if (userPlan === "free") {
        if (currentUser?.freeApplicationUsed) {
          return res.status(402).json({
            error: "Free trial used",
            message: "Du har använt din gratis ansökan. Uppgradera för obegränsad tillgång.",
            upgradeUrl: "/priser",
            currentPlan: "free",
            requiredPlan: "pro",
            freeTrialUsed: true,
          });
        }
      }

      const { grantId, companyId, matchScore, projectData: projectInput } = req.body;
      
      if (!grantId || !companyId) {
        return res.status(400).json({ error: "grantId and companyId are required" });
      }
      
      const grant = await storage.getGrant(grantId);
      if (!grant) {
        return res.status(404).json({ error: "Grant not found" });
      }
      
      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      
      if (company.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (projectInput?.projectDescription) {
        const project: ProjectData = {
          projectDescription: projectInput.projectDescription,
          projectGoals: projectInput.projectGoals || "",
          projectBudget: Number(projectInput.projectBudget) || 0,
          requestedAmount: Number(projectInput.requestedAmount) || 0,
          previousExperience: projectInput.previousExperience || "",
        };

        const result = await generateStructuredApplication(grant, company, project, companyId);
        
        const combinedContent = result.sections
          .map(s => `## ${s.sectionTitle}\n\n${s.content}`)
          .join("\n\n");

        const application = await storage.createApplication({
          companyId,
          grantId,
          generatedContent: combinedContent,
          sections: result.sections,
          companySnapshot: {
            companyName: company.companyName,
            industry: company.industry,
            employees: company.employees,
            location: company.location,
            revenue: company.revenue,
            description: company.description,
          },
          projectData: project as unknown as Record<string, unknown>,
          overallScore: result.overallScore,
          warnings: result.warnings,
          aiModelUsed: "claude-sonnet-4-5-20250929",
          matchScore: matchScore?.toString() || null,
          status: "draft",
        });
        
        try {
          await storage.upsertUserProgress(userId, { 
            firstGrantViewed: true, firstGrantViewedAt: new Date(),
            firstApplicationGenerated: true, firstApplicationAt: new Date() 
          });
        } catch (e) { /* progress tracking is non-critical */ }

        if (userPlan === "free") {
          await db.update(users).set({ freeApplicationUsed: true }).where(eq(users.id, userId));
        }

        return res.status(201).json({
          application,
          tokenUsage: result.tokenUsage,
          isFreeTrial: userPlan === "free",
        });
      }

      const result = await generateApplication(grant, company);
      
      const application = await storage.createApplication({
        companyId,
        grantId,
        generatedContent: result.content,
        aiModelUsed: "claude-sonnet-4-5-20250929",
        matchScore: matchScore?.toString() || null,
        status: "draft",
      });
      
      try {
        await storage.upsertUserProgress(userId, { 
          firstGrantViewed: true, firstGrantViewedAt: new Date(),
          firstApplicationGenerated: true, firstApplicationAt: new Date() 
        });
      } catch (e) { /* progress tracking is non-critical */ }

      if (userPlan === "free") {
        await db.update(users).set({ freeApplicationUsed: true }).where(eq(users.id, userId));
      }

      res.status(201).json({
        application,
        isFreeTrial: userPlan === "free",
        tokenUsage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostSEK: result.estimatedCostSEK,
        },
      });
    } catch (error) {
      console.error("Application generation error:", error);
      res.status(500).json({ 
        error: "Failed to generate application",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.put("/api/applications/:id/section/:sectionKey", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { id, sectionKey } = req.params;
      const { content } = req.body;

      if (!content && content !== "") {
        return res.status(400).json({ error: "content is required" });
      }

      const application = await storage.getApplication(id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const company = application.companyId ? await storage.getCompany(application.companyId) : null;
      if (company && company.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const sections = (application.sections as any[]) || [];
      const sectionIndex = sections.findIndex((s: any) => s.sectionKey === sectionKey);
      if (sectionIndex === -1) {
        return res.status(404).json({ error: "Section not found" });
      }

      sections[sectionIndex] = {
        ...sections[sectionIndex],
        content,
        wordCount: content.split(/\s+/).filter(Boolean).length,
      };

      const combinedContent = sections
        .map((s: any) => `## ${s.sectionTitle}\n\n${s.content}`)
        .join("\n\n");

      const updated = await storage.updateApplication(id, {
        sections: sections as any,
        generatedContent: combinedContent,
        updatedAt: new Date(),
      });

      res.json(updated);
    } catch (error) {
      console.error("Section update error:", error);
      res.status(500).json({ error: "Failed to update section" });
    }
  });

  app.post("/api/applications/:id/regenerate-section", isAuthenticated, requirePlan("pro"), aiGenerationLimiter, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { id } = req.params;
      const { sectionKey, instructions } = req.body;

      if (!sectionKey) {
        return res.status(400).json({ error: "sectionKey is required" });
      }

      const application = await storage.getApplication(id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const company = application.companyId ? await storage.getCompany(application.companyId) : null;
      if (company && company.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const grant = application.grantId ? await storage.getGrant(application.grantId) : null;
      if (!grant) {
        return res.status(404).json({ error: "Grant not found" });
      }

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const projectData = (application.projectData || {}) as any;
      const project: ProjectData = {
        projectDescription: projectData.projectDescription || "",
        projectGoals: projectData.projectGoals || "",
        projectBudget: Number(projectData.projectBudget) || 0,
        requestedAmount: Number(projectData.requestedAmount) || 0,
        previousExperience: projectData.previousExperience || "",
      };

      const result = await regenerateSection(
        grant,
        company,
        project,
        sectionKey,
        instructions || "Improve this section",
        application.companyId || undefined
      );

      const sections = (application.sections as any[]) || [];
      const sectionIndex = sections.findIndex((s: any) => s.sectionKey === sectionKey);
      if (sectionIndex !== -1) {
        sections[sectionIndex] = result.section;
      } else {
        sections.push(result.section);
      }

      const combinedContent = sections
        .map((s: any) => `## ${s.sectionTitle}\n\n${s.content}`)
        .join("\n\n");

      const updated = await storage.updateApplication(id, {
        sections: sections as any,
        generatedContent: combinedContent,
        updatedAt: new Date(),
      });

      res.json({
        application: updated,
        regeneratedSection: result.section,
        tokenUsage: result.tokenUsage,
      });
    } catch (error) {
      console.error("Section regeneration error:", error);
      res.status(500).json({
        error: "Failed to regenerate section",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // AI Semantic Matching (protected + rate limited)
  app.post("/api/grants/match", isAuthenticated, requirePlan("pro"), semanticAnalysisLimiter, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { grantId, companyId } = req.body;
      
      if (!grantId || !companyId) {
        return res.status(400).json({ error: "grantId and companyId are required" });
      }
      
      const grant = await storage.getGrant(grantId);
      if (!grant) {
        return res.status(404).json({ error: "Grant not found" });
      }
      
      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      
      // Verify company ownership before performing analysis
      if (company.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Calculate semantic match using Claude AI
      const semanticMatch = await calculateSemanticMatch(company, grant);
      
      try {
        await storage.upsertUserProgress(userId, { firstAIAnalysisRun: true, firstAIAnalysisAt: new Date() });
      } catch (e) { /* progress tracking is non-critical */ }
      res.json({
        grantId,
        companyId,
        score: semanticMatch.score,
        reasoning: semanticMatch.reasoning,
        strengths: semanticMatch.strengths,
        concerns: semanticMatch.concerns,
        tokenUsage: {
          inputTokens: semanticMatch.inputTokens,
          outputTokens: semanticMatch.outputTokens,
          estimatedCostSEK: semanticMatch.estimatedCostSEK,
        },
      });
    } catch (error) {
      console.error("Semantic matching error:", error);
      res.status(500).json({ 
        error: "Failed to calculate match",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Scraper Sources routes
  app.get("/api/scraper-sources", async (req, res) => {
    try {
      const sources = await storage.getScraperSources();
      res.json(sources);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scraper sources" });
    }
  });

  app.get("/api/scraper-sources/:id", async (req, res) => {
    try {
      const source = await storage.getScraperSource(req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Scraper source not found" });
      }
      res.json(source);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scraper source" });
    }
  });

  app.post("/api/scraper-sources", async (req, res) => {
    try {
      const data = insertScraperSourceSchema.parse(req.body);
      const source = await storage.createScraperSource(data);
      res.status(201).json(source);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create scraper source" });
    }
  });

  app.patch("/api/scraper-sources/:id", async (req, res) => {
    try {
      const data = insertScraperSourceSchema.partial().parse(req.body);
      const source = await storage.updateScraperSource(req.params.id, data);
      if (!source) {
        return res.status(404).json({ error: "Scraper source not found" });
      }
      res.json(source);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update scraper source" });
    }
  });

  app.delete("/api/scraper-sources/:id", async (req, res) => {
    try {
      await storage.deleteScraperSource(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete scraper source" });
    }
  });

  // Run scraper immediately
  app.post("/api/scraper-sources/:id/run", async (req, res) => {
    try {
      const sourceId = req.params.id;
      
      // Validate source ID is a valid UUID to prevent injection
      if (!UUID_REGEX.test(sourceId)) {
        return res.status(400).json({ error: "Invalid source ID format" });
      }
      
      const source = await storage.getScraperSource(sourceId);
      if (!source) {
        return res.status(404).json({ error: "Scraper source not found" });
      }

      // Create a log entry to indicate the scrape is starting
      const log = await storage.createScraperLog({
        sourceId: source.id,
        status: "running",
        grantsFound: 0,
      });

      // Update last scraped time on the source
      await storage.updateScraperSource(source.id, {
        lastScraped: new Date(),
      });

      // Trigger the Python scraper asynchronously using spawn (no shell)
      const scraperPath = path.join(process.cwd(), 'scrapers', 'main.py');
      const pythonProcess = spawn('python3', [scraperPath, '--source-id', source.id], {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      // Set timeout to kill process if it takes too long
      const timeout = setTimeout(() => {
        pythonProcess.kill('SIGTERM');
      }, 120000); // 2 minute timeout
      
      pythonProcess.on('close', async (code) => {
        clearTimeout(timeout);
        try {
          if (code !== 0) {
            console.error(`Scraper error for ${source.name} (exit code ${code}):`, stderr);
            await storage.updateScraperLog(log.id, {
              status: "failed",
              errorMessage: stderr || `Process exited with code ${code}`,
            });
          } else {
            console.log(`Scraper output for ${source.name}:`, stdout);
            // Parse stdout for grants found count
            const grantsMatch = stdout.match(/(\d+) grants found/);
            const grantsFound = grantsMatch ? parseInt(grantsMatch[1], 10) : 0;
            
            await storage.updateScraperLog(log.id, {
              status: "success",
              grantsFound,
            });
          }
        } catch (updateError) {
          console.error('Error updating scraper log:', updateError);
        }
      });
      
      pythonProcess.on('error', async (err) => {
        clearTimeout(timeout);
        console.error(`Failed to start scraper for ${source.name}:`, err.message);
        try {
          await storage.updateScraperLog(log.id, {
            status: "failed",
            errorMessage: `Failed to start scraper: ${err.message}`,
          });
        } catch (updateError) {
          console.error('Error updating scraper log:', updateError);
        }
      });

      res.status(202).json({ 
        message: "Scrape started", 
        logId: log.id,
        source: source.name 
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to start scraper" });
    }
  });

  // Scraper Logs routes
  app.get("/api/scraper-logs", async (req, res) => {
    try {
      const logs = await storage.getScraperLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scraper logs" });
    }
  });

  app.post("/api/scraper-logs", async (req, res) => {
    try {
      const data = insertScraperLogSchema.parse(req.body);
      const log = await storage.createScraperLog(data);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create scraper log" });
    }
  });

  // Cron endpoints for automation
  // POST /api/cron/scrape - Run scrapers by frequency (daily/weekly)
  // Can be triggered by external cron services like cron-job.org
  app.post("/api/cron/scrape", async (req, res) => {
    try {
      const body = req.body || {};
      const frequency = body.frequency || "daily";
      const apiKey = body.apiKey || req.headers['x-api-key'];
      
      // Require CRON_API_KEY for security - fail closed
      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }
      
      const sources = await storage.getScraperSourcesByFrequency(frequency, true);
      const results: { sourceId: string; name: string; logId: string }[] = [];
      
      for (const source of sources) {
        // Create log entry
        const log = await storage.createScraperLog({
          sourceId: source.id,
          status: "running",
          grantsFound: 0,
        });
        
        // Update last scraped time
        await storage.updateScraperSource(source.id, {
          lastScraped: new Date(),
        });
        
        // Trigger Python scraper asynchronously
        const scraperPath = path.join(process.cwd(), 'scrapers', 'main.py');
        const pythonProcess = spawn('python3', [scraperPath, '--source-id', source.id], {
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        });
        
        let stdout = '';
        let stderr = '';
        
        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        const timeout = setTimeout(() => {
          pythonProcess.kill('SIGTERM');
        }, 120000);
        
        pythonProcess.on('close', async (code) => {
          clearTimeout(timeout);
          try {
            if (code !== 0) {
              await storage.updateScraperLog(log.id, {
                status: "failed",
                errorMessage: stderr || `Process exited with code ${code}`,
              });
            } else {
              const grantsMatch = stdout.match(/(\d+) grants found/);
              const grantsFound = grantsMatch ? parseInt(grantsMatch[1], 10) : 0;
              await storage.updateScraperLog(log.id, {
                status: "success",
                grantsFound,
              });
            }
          } catch (updateError) {
            console.error('Error updating scraper log:', updateError);
          }
        });
        
        pythonProcess.on('error', async (err) => {
          clearTimeout(timeout);
          try {
            await storage.updateScraperLog(log.id, {
              status: "failed",
              errorMessage: `Failed to start scraper: ${err.message}`,
            });
          } catch (updateError) {
            console.error('Error updating scraper log:', updateError);
          }
        });
        
        results.push({ sourceId: source.id, name: source.name, logId: log.id });
      }
      
      res.json({ 
        message: `Started ${results.length} ${frequency} scrapers`,
        scrapers: results
      });
    } catch (error) {
      console.error('Cron scrape error:', error);
      res.status(500).json({ error: "Failed to run scrapers" });
    }
  });

  // POST /api/cron/scrape-slow - Run slow/heavy scrapers separately
  app.post("/api/cron/scrape-slow", async (req, res) => {
    try {
      const body = req.body || {};
      const apiKey = body.apiKey || req.headers['x-api-key'];
      
      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }
      
      const sources = await storage.getSlowScraperSources();
      const results: { sourceId: string; name: string; logId: string }[] = [];
      
      for (const source of sources) {
        const log = await storage.createScraperLog({
          sourceId: source.id,
          status: "running",
          grantsFound: 0,
        });
        
        await storage.updateScraperSource(source.id, {
          lastScraped: new Date(),
        });
        
        const scraperPath = path.join(process.cwd(), 'scrapers', 'main.py');
        const pythonProcess = spawn('python3', [scraperPath, '--source-id', source.id], {
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        });
        
        let stdout = '';
        let stderr = '';
        
        pythonProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        
        const timeout = setTimeout(() => {
          pythonProcess.kill('SIGTERM');
        }, 900000);
        
        pythonProcess.on('close', async (code: number | null) => {
          clearTimeout(timeout);
          try {
            if (code !== 0) {
              await storage.updateScraperLog(log.id, {
                status: "failed",
                errorMessage: stderr || `Process exited with code ${code}`,
              });
            } else {
              const grantsMatch = stdout.match(/(\d+) grants found/);
              const grantsFound = grantsMatch ? parseInt(grantsMatch[1], 10) : 0;
              await storage.updateScraperLog(log.id, {
                status: "success",
                grantsFound,
              });
            }
          } catch (updateError) {
            console.error('Error updating scraper log:', updateError);
          }
        });
        
        pythonProcess.on('error', async (err: Error) => {
          clearTimeout(timeout);
          try {
            await storage.updateScraperLog(log.id, {
              status: "failed",
              errorMessage: `Failed to start scraper: ${err.message}`,
            });
          } catch (updateError) {
            console.error('Error updating scraper log:', updateError);
          }
        });
        
        results.push({ sourceId: source.id, name: source.name, logId: log.id });
      }
      
      res.json({ 
        message: `Started ${results.length} slow scrapers`,
        scrapers: results
      });
    } catch (error) {
      console.error('Cron scrape-slow error:', error);
      res.status(500).json({ error: "Failed to run slow scrapers" });
    }
  });

  // POST /api/cron/notifications - Process and send notifications
  app.post("/api/cron/notifications", async (req, res) => {
    try {
      const body = req.body || {};
      const apiKey = body.apiKey || req.headers['x-api-key'];
      
      // Require CRON_API_KEY for security - fail closed
      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }
      
      const { processNewGrantNotifications, processDeadlineReminders, processAlertMatches } = await import('./lib/notifications');
      
      const newGrantResults = await processNewGrantNotifications();
      const deadlineResults = await processDeadlineReminders();
      const alertResults = await processAlertMatches();
      
      res.json({
        message: "Notifications processed",
        newGrants: {
          sent: newGrantResults.sent,
          errors: newGrantResults.errors,
        },
        deadlineReminders: {
          sent: deadlineResults.sent,
          errors: deadlineResults.errors,
        },
        alertMatches: {
          sent: alertResults.sent,
          errors: alertResults.errors,
        },
      });
    } catch (error) {
      console.error('Cron notifications error:', error);
      res.status(500).json({ error: "Failed to process notifications" });
    }
  });

  app.post("/api/cron/close-expired", async (req, res) => {
    try {
      const body = req.body || {};
      const apiKey = body.apiKey || req.headers['x-api-key'];
      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }

      const { db } = await import('./db');
      const { grants } = await import('@shared/schema');
      const { sql, and, lt } = await import('drizzle-orm');
      const result = await db
        .update(grants)
        .set({ status: 'closed', updatedAt: new Date() })
        .where(
          and(
            sql`${grants.status} IN ('open', 'upcoming')`,
            lt(grants.deadline, new Date())
          )
        )
        .returning({ id: grants.id });

      res.json({ message: "Expired grants closed", count: result.length });
    } catch (error) {
      console.error('Cron close-expired error:', error);
      res.status(500).json({ error: "Failed to close expired grants" });
    }
  });

  // POST /api/cron/enrich-descriptions - Enrich short grant descriptions
  app.post("/api/cron/enrich-descriptions", async (req, res) => {
    try {
      const body = req.body || {};
      const apiKey = body.apiKey || req.headers['x-api-key'];

      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }

      const { enrichShortDescriptions } = await import('./scripts/enrich-short-descriptions');
      const limit = body.limit || 20;
      const stats = await enrichShortDescriptions(limit);

      res.json({
        message: "Description enrichment completed",
        ...stats,
      });
    } catch (error) {
      console.error("Cron enrich-descriptions error:", error);
      res.status(500).json({ error: "Failed to enrich descriptions" });
    }
  });

  // POST /api/cron/weekly-digest - Send weekly digest emails (run once per week)
  app.post("/api/cron/weekly-digest", async (req, res) => {
    try {
      const body = req.body || {};
      const apiKey = body.apiKey || req.headers['x-api-key'];
      
      // Require CRON_API_KEY for security - fail closed
      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }
      
      const { processWeeklyDigest } = await import('./lib/notifications');
      
      const digestResults = await processWeeklyDigest();
      
      res.json({
        message: "Weekly digest processed",
        weeklyDigest: {
          sent: digestResults.sent,
          errors: digestResults.errors,
        },
      });
    } catch (error) {
      console.error('Cron weekly digest error:', error);
      res.status(500).json({ error: "Failed to process weekly digest" });
    }
  });

  // POST /api/cron/success-fee-maintenance — Auto-expire stale agreements + send payment reminders
  app.post("/api/cron/success-fee-maintenance", async (req, res) => {
    try {
      const body = req.body || {};
      const apiKey = body.apiKey || req.headers['x-api-key'];

      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }

      const { expireStaleAgreements, getOrCreateSettings } = await import('./services/successFee');
      const { sendPaymentReminderEmail } = await import('./lib/successFeeEmails');
      const { db } = await import('./db');
      const { successFeeAgreements, users } = await import('@shared/schema');
      const { eq, and, lt, isNull, or: drizzleOr } = await import('drizzle-orm');

      const settings = await getOrCreateSettings();

      const expiredCount = await expireStaleAgreements(settings.autoExpireMonths || 18);

      const now = new Date();
      const reminderCutoff = new Date();
      reminderCutoff.setDate(reminderCutoff.getDate() + 7);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const dueInvoices = await db.select().from(successFeeAgreements)
        .where(and(
          eq(successFeeAgreements.status, 'fee_invoiced'),
          lt(successFeeAgreements.invoiceDueDate, reminderCutoff.toISOString().split('T')[0]),
          drizzleOr(
            isNull(successFeeAgreements.reminderSentAt),
            lt(successFeeAgreements.reminderSentAt, sevenDaysAgo)
          )
        ));

      let remindersSent = 0;
      for (const agreement of dueInvoices) {
        try {
          const [user] = await db.select().from(users).where(eq(users.id, agreement.userId));
          if (user?.email && agreement.invoiceDueDate) {
            const daysUntilDue = Math.ceil((new Date(agreement.invoiceDueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            await sendPaymentReminderEmail(user.email, agreement, daysUntilDue);
            await db.update(successFeeAgreements).set({
              reminderSentAt: new Date(),
              reminderCount: (agreement.reminderCount || 0) + 1,
              updatedAt: new Date(),
            }).where(eq(successFeeAgreements.id, agreement.id));
            remindersSent++;
          }
        } catch (emailErr) {
          console.error(`Failed to send reminder for agreement ${agreement.id}:`, emailErr);
        }
      }

      res.json({
        message: "Success fee maintenance completed",
        expiredAgreements: expiredCount,
        remindersSent,
        dueInvoicesFound: dueInvoices.length,
      });
    } catch (error) {
      console.error('Cron success-fee-maintenance error:', error);
      res.status(500).json({ error: "Failed to run success fee maintenance" });
    }
  });

  // POST /api/cron/project-health — Daily project health check (run at 07:00 Stockholm time)
  app.post("/api/cron/project-health", async (req, res) => {
    try {
      const body = req.body || {};
      const apiKey = body.apiKey || req.headers['x-api-key'];

      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }

      const { db } = await import('./db');
      const { grantProjects, projectMilestones, projectReports, projectBudgetCategories, projectRisks, users } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');

      const activeProjects = await db.select().from(grantProjects).where(eq(grantProjects.status, 'active'));

      let updated = 0;
      let alertsSent = 0;

      for (const project of activeProjects) {
        const [milestones, reports, categories, risks] = await Promise.all([
          db.select().from(projectMilestones).where(eq(projectMilestones.projectId, project.id)),
          db.select().from(projectReports).where(eq(projectReports.projectId, project.id)),
          db.select().from(projectBudgetCategories).where(eq(projectBudgetCategories.projectId, project.id)),
          db.select().from(projectRisks).where(and(eq(projectRisks.projectId, project.id), eq(projectRisks.status, 'open'))),
        ]);

        const now = new Date();
        const issues: string[] = [];
        const recommendations: string[] = [];

        const overdueMilestones = milestones.filter(m =>
          m.status !== 'completed' && m.status !== 'waived' && new Date(m.dueDate) < now
        );
        if (overdueMilestones.length > 0) {
          issues.push(`${overdueMilestones.length} overdue milestone(s): ${overdueMilestones.map(m => m.title).join(', ')}`);
          recommendations.push('Update delayed milestones with new expected completion dates');
        }

        const overdueReports = reports.filter(r =>
          r.status !== 'submitted' && r.status !== 'approved' && r.dueDate && new Date(r.dueDate) < now
        );
        if (overdueReports.length > 0) {
          issues.push(`${overdueReports.length} overdue report(s): ${overdueReports.map(r => r.title).join(', ')}`);
          recommendations.push('Submit overdue reports as soon as possible');
        }

        if (project.projectStartDate && project.projectEndDate) {
          const totalDays = Math.ceil((new Date(project.projectEndDate).getTime() - new Date(project.projectStartDate).getTime()) / 86400000);
          const elapsedDays = Math.ceil((now.getTime() - new Date(project.projectStartDate).getTime()) / 86400000);
          const expectedBurnPercent = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;
          const totalBudgeted = categories.reduce((sum, c) => sum + (c.budgetedAmountSek || 0), 0);
          const totalSpent = categories.reduce((sum, c) => sum + (c.spentAmountSek || 0), 0);
          const actualBurnPercent = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

          if (actualBurnPercent > expectedBurnPercent * 1.25) {
            issues.push(`Budget burn rate is ${Math.round(actualBurnPercent)}% but project is only ${Math.round(expectedBurnPercent)}% through its timeline`);
            recommendations.push('Review spending — at current rate, budget may run out before project end');
          }
        }

        const highRisks = risks.filter(r => (r.riskScore || 0) >= 6);
        if (highRisks.length > 0) {
          issues.push(`${highRisks.length} high-severity open risk(s)`);
        }

        let healthStatus = 'on_track';
        if (overdueReports.length > 0 || overdueMilestones.length > 1) {
          healthStatus = 'delayed';
        } else if (overdueMilestones.length === 1 || issues.length > 0) {
          healthStatus = 'at_risk';
        }

        if (healthStatus !== project.healthStatus) {
          await db.update(grantProjects)
            .set({ healthStatus, updatedAt: new Date() })
            .where(eq(grantProjects.id, project.id));
          updated++;
        }

        if (issues.length > 0) {
          try {
            const [user] = await db.select().from(users).where(eq(users.id, project.userId));
            if (user?.email) {
              const { Resend } = await import('resend');
              const resend = new Resend(process.env.RESEND_API_KEY);
              await resend.emails.send({
                from: 'GetGrant.ai <notifications@getgrant.ai>',
                to: user.email,
                subject: `⚠️ Åtgärd krävs — ${project.title}`,
                html: `
                  <h2>${project.title} behöver din uppmärksamhet</h2>
                  <ul>${issues.map(i => `<li>${i}</li>`).join('')}</ul>
                  <p><strong>Rekommendationer:</strong></p>
                  <ul>${recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
                  <p><a href="https://getgrant.ai/projekt/${project.id}">Öppna projekt →</a></p>
                  <p style="color:#999;font-size:12px">GetGrant.ai Project Tracker</p>
                `,
              });
              alertsSent++;
            }
          } catch (emailErr) {
            console.error(`Failed to send health alert for project ${project.id}:`, emailErr);
          }
        }
      }

      res.json({
        message: "Project health check completed",
        projectsChecked: activeProjects.length,
        healthUpdated: updated,
        alertsSent,
      });
    } catch (error) {
      console.error('Cron project-health error:', error);
      res.status(500).json({ error: "Failed to run project health check" });
    }
  });

  // ============ ADMIN USERS ROUTES ============

  app.get("/api/admin/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    try {
      const allUsers = await db.select().from(users).orderBy(sql`${users.createdAt} DESC`);
      res.json(allUsers);
    } catch (error) {
      console.error('Admin users error:', error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/users/stats", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [stats] = await db.select({
        totalUsers: sql<number>`count(*)::int`,
        activeLast7Days: sql<number>`count(case when ${users.lastLoginAt} > ${sevenDaysAgo} then 1 end)::int`,
        activeLast30Days: sql<number>`count(case when ${users.lastLoginAt} > ${thirtyDaysAgo} then 1 end)::int`,
        neverLoggedIn: sql<number>`count(case when ${users.lastLoginAt} is null then 1 end)::int`,
        freeUsers: sql<number>`count(case when ${users.plan} = 'free' or ${users.plan} is null then 1 end)::int`,
        proUsers: sql<number>`count(case when ${users.plan} = 'pro' then 1 end)::int`,
        enterpriseUsers: sql<number>`count(case when ${users.plan} = 'enterprise' then 1 end)::int`,
      }).from(users);

      res.json(stats);
    } catch (error) {
      console.error('Admin users stats error:', error);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  // ============ AI ELIGIBILITY EXTRACTION ROUTES ============

  app.get("/api/admin/eligibility/status", async (req, res) => {
    try {
      const apiKey = req.query.apiKey as string || req.headers['x-api-key'] as string;
      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }

      const { getEligibilityStatus } = await import('./services/eligibilityExtractor');
      const status = await getEligibilityStatus();
      res.json(status);
    } catch (error) {
      console.error('Eligibility status error:', error);
      res.status(500).json({ error: "Failed to get eligibility status" });
    }
  });

  app.post("/api/admin/eligibility/extract", async (req, res) => {
    try {
      const body = req.body || {};
      const apiKey = body.apiKey || req.headers['x-api-key'];

      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }

      const {
        batchSize = 3,
        delayMs = 15000,
        onlyOpen = true,
        forceReprocess = false,
        maxGrants = 50,
      } = body;

      const { processAllGrants } = await import('./services/eligibilityExtractor');

      processAllGrants({
        batchSize,
        delayBetweenBatchesMs: delayMs,
        onlyOpen,
        forceReprocess,
        maxGrants,
      }).then(result => {
        console.log('Eligibility extraction completed:', result);
      }).catch(error => {
        console.error('Eligibility extraction failed:', error);
      });

      res.json({
        message: 'Eligibility extraction started in background',
        settings: { batchSize, delayMs, onlyOpen, forceReprocess, maxGrants },
      });
    } catch (error) {
      console.error('Eligibility extraction error:', error);
      res.status(500).json({ error: "Failed to start eligibility extraction" });
    }
  });

  app.post("/api/admin/eligibility/extract/:grantId", async (req, res) => {
    try {
      const body = req.body || {};
      const apiKey = body.apiKey || req.headers['x-api-key'];

      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }

      const { grantId } = req.params;
      const { extractAndSaveForGrant } = await import('./services/eligibilityExtractor');
      const result = await extractAndSaveForGrant(grantId);

      if (result.success) {
        res.json({ success: true, criteria: result.criteria });
      } else {
        res.status(result.error === "Grant not found" ? 404 : 400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Single grant extraction error:', error);
      res.status(500).json({ error: "Failed to extract eligibility" });
    }
  });

  app.post("/api/cron/extract-eligibility", async (req, res) => {
    try {
      const body = req.body || {};
      const apiKey = body.apiKey || req.headers['x-api-key'];

      const cronKey = process.env.CRON_API_KEY;
      if (!cronKey) {
        return res.status(503).json({ error: "Cron API not configured. Set CRON_API_KEY environment variable." });
      }
      if (apiKey !== cronKey) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }

      const { processAllGrants } = await import('./services/eligibilityExtractor');

      const batchSize = body.batchSize || 3;
      const delayBetweenBatchesMs = body.delayBetweenBatchesMs || 15000;
      const maxGrants = body.maxGrants || 50;
      const prioritySources = body.prioritySources || [];

      const result = await processAllGrants({
        batchSize,
        delayBetweenBatchesMs,
        onlyOpen: true,
        forceReprocess: false,
        maxGrants,
        prioritySources,
      });

      res.json({
        success: true,
        result,
        message: `Processed ${result.processed} grants (${result.successful} successful)`,
      });
    } catch (error) {
      console.error('Cron eligibility extraction error:', error);
      res.status(500).json({ error: "Failed to process eligibility extraction" });
    }
  });

  // ============ BILLING & SUBSCRIPTION ROUTES ============
  
  // Get Stripe publishable key for frontend
  app.get("/api/billing/config", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error('Failed to get Stripe config:', error);
      res.status(500).json({ error: "Failed to get payment configuration" });
    }
  });

  // Get user subscription status
  app.get("/api/billing/subscription", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const subscription = await getUserSubscription(userId);
      res.json(subscription || { plan: 'free' });
    } catch (error) {
      console.error('Failed to get subscription:', error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });

  // Create checkout session
  app.post("/api/billing/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userEmail = req.user?.claims?.email;
      const { plan } = req.body;

      if (!userId || !userEmail) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      if (!['pro', 'enterprise'].includes(plan)) {
        return res.status(400).json({ error: "Invalid plan. Must be 'pro' or 'enterprise'" });
      }

      const baseUrl = APP_URL;
      
      const session = await createCheckoutSession(
        userId,
        userEmail,
        plan,
        `${baseUrl}/dashboard?checkout=success`,
        `${baseUrl}/priser?checkout=canceled`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Checkout error:', error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  });

  // Create customer portal session (for managing subscription)
  app.post("/api/billing/portal", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ error: "No active subscription found" });
      }

      const baseUrl = APP_URL;
      
      const session = await createCustomerPortalSession(
        user.stripeCustomerId,
        `${baseUrl}/dashboard`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Portal error:', error);
      res.status(500).json({ error: error.message || "Failed to create portal session" });
    }
  });

  // ============ COMPLIANCE CHECK ROUTES ============
  app.post("/api/applications/:id/compliance-check", isAuthenticated, aiGenerationLimiter, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const application = await storage.getApplication(req.params.id);

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const ownership = await verifyCompanyOwnership(application.companyId, userId);
      if (!ownership.allowed) {
        return res.status(403).json({ error: ownership.error || "Access denied" });
      }

      if (!application.sections || (application.sections as any[]).length === 0) {
        return res.status(400).json({ error: "Application has no sections to check" });
      }

      if (!application.grantId || !application.companyId) {
        return res.status(400).json({ error: "Application missing grant or company" });
      }

      const grant = await storage.getGrant(application.grantId);
      const company = await storage.getCompany(application.companyId);

      if (!grant || !company) {
        return res.status(404).json({ error: "Grant or company not found" });
      }

      const { checkCompliance } = await import("./services/complianceChecker");
      const report = await checkCompliance(grant, application.sections as any, company);

      await storage.updateApplication(req.params.id, {
        complianceReport: report as any,
        complianceCheckedAt: new Date(),
      } as any);

      res.json(report);
    } catch (error: any) {
      console.error("Compliance check error:", error);
      res.status(500).json({ error: error.message || "Compliance check failed" });
    }
  });

  app.get("/api/applications/:id/compliance-check", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const application = await storage.getApplication(req.params.id);

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const ownership = await verifyCompanyOwnership(application.companyId, userId);
      if (!ownership.allowed) {
        return res.status(403).json({ error: ownership.error || "Access denied" });
      }

      if (!application.complianceReport) {
        return res.status(404).json({ error: "No compliance report available" });
      }

      res.json(application.complianceReport);
    } catch (error: any) {
      console.error("Get compliance report error:", error);
      res.status(500).json({ error: "Failed to get compliance report" });
    }
  });

  // ============ EXPORT ROUTES ============
  // Export application as DOCX (requires Pro plan)
  app.get("/api/applications/:id/export/docx", isAuthenticated, requirePlan("pro"), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const application = await storage.getApplication(req.params.id);
      
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      const ownership = await verifyCompanyOwnership(application.companyId, userId);
      if (!ownership.allowed) {
        return res.status(403).json({ error: ownership.error || "Access denied" });
      }

      if (!application.companyId) {
        return res.status(400).json({ error: "Application has no associated company" });
      }

      const grant = await storage.getGrant(application.grantId!);
      const company = await storage.getCompany(application.companyId);

      if (!grant || !company) {
        return res.status(404).json({ error: "Grant or company not found" });
      }

      const { exportToDocx } = await import('./services/export');
      
      const buffer = await exportToDocx({
        grantTitle: grant.title,
        companyName: company.companyName,
        content: application.generatedContent || '',
        sections: application.sections as any,
        generatedAt: application.createdAt || new Date(),
      });

      const filename = `ansokan-${grant.title.replace(/[^a-z0-9åäö]/gi, '-').toLowerCase()}.docx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      
      res.send(buffer);
    } catch (error) {
      console.error('Export DOCX error:', error);
      res.status(500).json({ error: "Export failed" });
    }
  });

  // Export application as PDF (requires Pro plan)
  app.get("/api/applications/:id/export/pdf", isAuthenticated, requirePlan("pro"), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const application = await storage.getApplication(req.params.id);
      
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      const ownership = await verifyCompanyOwnership(application.companyId, userId);
      if (!ownership.allowed) {
        return res.status(403).json({ error: ownership.error || "Access denied" });
      }

      if (!application.companyId) {
        return res.status(400).json({ error: "Application has no associated company" });
      }

      const grant = await storage.getGrant(application.grantId!);
      const company = await storage.getCompany(application.companyId);

      if (!grant || !company) {
        return res.status(404).json({ error: "Grant or company not found" });
      }

      const { exportToPdf } = await import('./services/export');
      
      const buffer = await exportToPdf({
        grantTitle: grant.title,
        companyName: company.companyName,
        content: application.generatedContent || '',
        sections: application.sections as any,
        generatedAt: application.createdAt || new Date(),
      });

      const filename = `ansokan-${grant.title.replace(/[^a-z0-9åäö]/gi, '-').toLowerCase()}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      
      res.send(buffer);
    } catch (error) {
      console.error('Export PDF error:', error);
      res.status(500).json({ error: "Export failed" });
    }
  });

  // ===== Calendar Events =====

  app.get("/api/calendar/events", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const startParam = req.query.start as string || new Date().toISOString();
      const endParam = req.query.end as string || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const sources = req.query.sources as string || 'all';

      const startDate = new Date(startParam);
      const endDate = new Date(endParam);

      const bookmarkGrantIds = new Set<string>();
      const eventGrants: Array<{ grant: Grant; isBookmarked: boolean; matchScore: number }> = [];

      if (sources === 'all' || sources === 'bookmarks') {
        const bookmarks = await storage.getBookmarksByUserId(userId);
        for (const bm of bookmarks) {
          const grant = await storage.getGrant(bm.grantId);
          if (grant && grant.deadline) {
            const d = new Date(grant.deadline);
            if (d >= startDate && d <= endDate && grant.status !== 'closed') {
              bookmarkGrantIds.add(grant.id);
              eventGrants.push({ grant, isBookmarked: true, matchScore: 0 });
            }
          }
        }
      }

      if (sources === 'all' || sources === 'matches') {
        const userCompanies = await storage.getCompaniesByUserId(userId);
        if (userCompanies.length > 0) {
          const allGrants = await storage.getGrants();
          for (const grant of allGrants) {
            if (!grant.deadline || bookmarkGrantIds.has(grant.id)) continue;
            if (grant.status === 'closed') continue;
            const d = new Date(grant.deadline);
            if (d < startDate || d > endDate) continue;
            const company = userCompanies[0];
            let score = 0;
            const grantIndustry = (grant.keywords || []).join(' ').toLowerCase();
            const companyIndustry = (company.industry || '').toLowerCase();
            if (companyIndustry && grantIndustry.includes(companyIndustry)) score += 30;
            const grantTargets = (grant.targetGroup || []).map(t => t.toLowerCase());
            if (grantTargets.length === 0 || grantTargets.includes('alla')) score += 20;
            const grantLocation = (grant.description || '').toLowerCase();
            const companyLocation = (company.location || '').toLowerCase();
            if (companyLocation && grantLocation.includes(companyLocation)) score += 15;
            if (grant.sourceName) score += 10;
            score = Math.min(score, 100);
            if (score >= 20) {
              eventGrants.push({ grant, isBookmarked: false, matchScore: score });
            }
          }
        }
      }

      const now = new Date();
      const events = eventGrants.map(({ grant, isBookmarked, matchScore }) => {
        const deadline = new Date(grant.deadline!);
        const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        let urgency: 'urgent' | 'medium' | 'upcoming' = 'upcoming';
        if (daysUntil <= 7) urgency = 'urgent';
        else if (daysUntil <= 30) urgency = 'medium';

        return {
          id: grant.id,
          title: grant.title,
          deadline: grant.deadline,
          daysUntil,
          urgency,
          source: grant.sourceName,
          amount: grant.amountMax,
          matchScore,
          isBookmarked,
          url: grant.url,
        };
      }).sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

      const summary = {
        urgent: events.filter(e => e.urgency === 'urgent').length,
        thisMonth: events.filter(e => {
          const d = new Date(e.deadline!);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length,
        nextMonth: events.filter(e => {
          const d = new Date(e.deadline!);
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);
          return d >= nextMonth && d < monthAfter;
        }).length,
      };

      res.json({ events, summary });
    } catch (error) {
      console.error('Calendar events error:', error);
      res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
  });

  // ===== Grant Bookmarks =====

  app.get("/api/bookmarks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookmarks = await storage.getBookmarksByUserId(userId);
      const bookmarksWithGrants = await Promise.all(
        bookmarks.map(async (bookmark) => {
          const grant = await storage.getGrant(bookmark.grantId);
          return { ...bookmark, grant };
        })
      );
      res.json(bookmarksWithGrants.filter(b => b.grant));
    } catch (error) {
      console.error('Get bookmarks error:', error);
      res.status(500).json({ error: 'Failed to fetch bookmarks' });
    }
  });

  app.get("/api/bookmarks/check/:grantId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookmarked = await storage.isBookmarked(userId, req.params.grantId);
      res.json({ bookmarked });
    } catch (error) {
      console.error('Check bookmark error:', error);
      res.status(500).json({ error: 'Failed to check bookmark' });
    }
  });

  app.post("/api/bookmarks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { grantId, notes } = req.body;
      if (!grantId) {
        return res.status(400).json({ error: 'Grant ID is required' });
      }
      const existing = await storage.isBookmarked(userId, grantId);
      if (existing) {
        return res.status(400).json({ error: 'Already bookmarked' });
      }
      const bookmark = await storage.createBookmark({
        userId,
        grantId,
        notes: notes || null,
      });
      res.json(bookmark);
    } catch (error) {
      console.error('Create bookmark error:', error);
      res.status(500).json({ error: 'Failed to create bookmark' });
    }
  });

  app.delete("/api/bookmarks/:grantId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.deleteBookmark(userId, req.params.grantId);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete bookmark error:', error);
      res.status(500).json({ error: 'Failed to remove bookmark' });
    }
  });

  // ===== Grant Alerts =====

  const { grantMatchesAlert, computeMatchScore } = await import('./lib/alert-matching');

  async function checkAlertAgainstExistingGrants(alert: GrantAlert) {
    try {
      const allGrants = await storage.getGrants();
      const openGrants = allGrants.filter(g => g.status === 'open');

      let company: Company | null = null;
      if (alert.companyId) {
        company = (await storage.getCompany(alert.companyId)) || null;
      }

      for (const grant of openGrants) {
        if (grantMatchesAlert(grant, alert)) {
          const matchScore = computeMatchScore(company, grant);

          if (matchScore >= (alert.minMatchScore || 60)) {
            const exists = await storage.hasAlertMatch(alert.id, grant.id);
            if (!exists) {
              await storage.createAlertMatch({
                alertId: alert.id,
                grantId: grant.id,
                matchScore,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Check alert against grants error:', error);
    }
  }

  app.get("/api/alerts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userAlerts = await storage.getAlertsByUserId(userId);

      const alertsWithCounts = await Promise.all(
        userAlerts.map(async (alert) => {
          const matches = await storage.getAlertMatches(alert.id);
          const unnotified = await storage.getUnnotifiedAlertMatches(alert.id);
          return {
            ...alert,
            matchCount: matches.length,
            unnotifiedMatches: unnotified.length,
          };
        })
      );

      res.json(alertsWithCounts);
    } catch (error) {
      console.error('Get alerts error:', error);
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });

  app.post("/api/alerts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, keywords, sources, minAmount, maxAmount, industries, minMatchScore, companyId, notifyImmediately, includeInDigest } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const alert = await storage.createAlert({
        userId,
        companyId: companyId || null,
        name: name.trim(),
        keywords: keywords && keywords.length > 0 ? keywords : null,
        sources: sources && sources.length > 0 ? sources : null,
        minAmount: minAmount || null,
        maxAmount: maxAmount || null,
        industries: industries && industries.length > 0 ? industries : null,
        minMatchScore: minMatchScore || 60,
        notifyImmediately: notifyImmediately !== false,
        includeInDigest: includeInDigest !== false,
      });

      await checkAlertAgainstExistingGrants(alert);

      res.json(alert);
    } catch (error) {
      console.error('Create alert error:', error);
      res.status(500).json({ error: 'Failed to create alert' });
    }
  });

  app.patch("/api/alerts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const alertId = req.params.id;

      const existing = await storage.getAlert(alertId);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      const allowedFields = ['name', 'active', 'keywords', 'sources', 'minAmount', 'maxAmount', 'industries', 'minMatchScore', 'notifyImmediately', 'includeInDigest', 'companyId'];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const alert = await storage.updateAlert(alertId, updates);
      res.json(alert);
    } catch (error) {
      console.error('Update alert error:', error);
      res.status(500).json({ error: 'Failed to update alert' });
    }
  });

  app.delete("/api/alerts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const alertId = req.params.id;

      const existing = await storage.getAlert(alertId);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      await storage.deleteAlert(alertId);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete alert error:', error);
      res.status(500).json({ error: 'Failed to delete alert' });
    }
  });

  app.get("/api/alerts/:id/matches", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const alertId = req.params.id;

      const alert = await storage.getAlert(alertId);
      if (!alert || alert.userId !== userId) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      const matches = await storage.getAlertMatches(alertId);

      const matchesWithGrants = await Promise.all(
        matches.map(async (match) => {
          const grant = await storage.getGrant(match.grantId);
          return { ...match, grant };
        })
      );

      res.json(matchesWithGrants.filter(m => m.grant));
    } catch (error) {
      console.error('Get alert matches error:', error);
      res.status(500).json({ error: 'Failed to fetch matches' });
    }
  });

  app.get("/api/grant-sources", async (_req, res) => {
    try {
      const sources = await storage.getUniqueGrantSources();
      res.json(sources);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sources' });
    }
  });

  // ============ ADMIN ELIGIBILITY COVERAGE & RE-EXTRACTION ============

  async function isAdminUser(req: any): Promise<boolean> {
    const userId = req.user?.claims?.sub;
    if (!userId) return false;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user?.plan === 'enterprise' || user?.email === 'admin@getgrant.ai';
  }

  app.get("/api/admin/eligibility/coverage", async (req: any, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    if (!(await isAdminUser(req))) return res.status(403).json({ error: "Admin access required" });
    try {
      const stats = await db.execute(sql`
        SELECT
          source_name,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE structured_eligibility IS NOT NULL
            AND (structured_eligibility->>'confidence_score')::float >= 0.3
          ) AS high_conf,
          COUNT(*) FILTER (WHERE structured_eligibility IS NULL) AS not_extracted,
          COUNT(*) FILTER (
            WHERE structured_eligibility IS NOT NULL
            AND (structured_eligibility->>'confidence_score')::float < 0.3
          ) AS low_conf,
          ROUND(100.0 * COUNT(*) FILTER (
            WHERE structured_eligibility IS NOT NULL
            AND (structured_eligibility->>'confidence_score')::float >= 0.3
          ) / COUNT(*), 0) AS pct_good
        FROM grants
        WHERE status IN ('open', 'upcoming')
        GROUP BY source_name
        ORDER BY pct_good ASC, not_extracted DESC
      `);
      res.json(stats.rows);
    } catch (error) {
      console.error("Failed to get eligibility coverage:", error);
      res.status(500).json({ error: "Failed to get coverage stats" });
    }
  });

  app.post("/api/admin/eligibility/reextract-low-confidence", async (req: any, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    if (!(await isAdminUser(req))) return res.status(403).json({ error: "Admin access required" });
    try {
      const threshold = req.body.threshold ?? 0.3;
      const sourceName = req.body.sourceName;
      const maxGrants = req.body.maxGrants ?? 100;

      const conditions = [
        inArray(grants.status, ["open", "upcoming"]),
        sql`${grants.structuredEligibility} IS NOT NULL`,
        sql`(${grants.structuredEligibility}->>'confidence_score')::float < ${threshold}`,
      ];
      if (sourceName) {
        conditions.push(eq(grants.sourceName, sourceName));
      }

      const grantsToRetry = await db
        .select({ id: grants.id, title: grants.title })
        .from(grants)
        .where(and(...conditions))
        .limit(maxGrants);

      if (grantsToRetry.length === 0) {
        return res.json({ queued: 0, message: "No grants match criteria" });
      }

      res.json({ queued: grantsToRetry.length, message: "Re-extraction started in background" });

      const { extractAndSaveForGrant } = await import('./services/eligibilityExtractor');
      (async () => {
        let success = 0, failed = 0;
        for (const g of grantsToRetry) {
          try {
            const result = await extractAndSaveForGrant(g.id);
            if (result.success) success++;
            else failed++;
            await new Promise(r => setTimeout(r, 2000));
          } catch {
            failed++;
          }
        }
        console.log(`[Re-extraction] Complete: ${success} success, ${failed} failed out of ${grantsToRetry.length}`);
      })();
    } catch (error) {
      console.error("Failed to start re-extraction:", error);
      res.status(500).json({ error: "Failed to start re-extraction" });
    }
  });

  // ============ ADMIN MATCHING TEST ROUTES ============

  app.get("/api/admin/matching-test", async (req: any, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    if (!(await isAdminUser(req))) return res.status(403).json({ error: "Admin access required" });
    try {
      const filePath = path.join(process.cwd(), "scripts", "matching-test-results.json");
      if (!fs.existsSync(filePath)) {
        return res.json({ status: "not_run", message: "Run test first" });
      }
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      res.json(data);
    } catch (error) {
      console.error("Failed to read matching test results:", error);
      res.status(500).json({ error: "Failed to read test results" });
    }
  });

  app.post("/api/admin/matching-test/run", async (req: any, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    if (!(await isAdminUser(req))) return res.status(403).json({ error: "Admin access required" });
    try {
      const child = spawn("npx", ["tsx", "scripts/test-matching-quality.ts"], {
        cwd: process.cwd(),
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      res.json({ status: "running" });
    } catch (error) {
      console.error("Failed to start matching test:", error);
      res.status(500).json({ error: "Failed to start test" });
    }
  });

  return httpServer;
}
