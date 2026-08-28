import { 
  type Grant, type InsertGrant,
  type Company, type InsertCompany,
  type Application, type InsertApplication,
  type ScraperSource, type InsertScraperSource,
  type ScraperLog, type InsertScraperLog,
  type Notification, type InsertNotification,
  type UserProgress, type InsertUserProgress,
  type NotificationPreference, type InsertNotificationPreference,
  type GrantAlert, type InsertGrantAlert,
  type AlertMatch, type InsertAlertMatch,
  type GrantBookmark, type InsertGrantBookmark,
  type EligibilityCheck, type InsertEligibilityCheck,
  type MatchExplanation, type InsertMatchExplanation,
  grants, companies, applications, scraperSources, scraperLogs, notifications, userProgress, notificationPreferences,
  grantAlerts, alertMatches, grantBookmarks, eligibilityChecks, matchExplanations
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and, or, gte, lte, gt, ilike, inArray } from "drizzle-orm";

export interface GrantFilters {
  source?: string;
  status?: string;
  deadlineDays?: number;
  amountMin?: number;
  amountMax?: number;
  keywords?: string[];
  search?: string;
}

export interface DashboardStats {
  totalGrants: number;
  openGrants: number;
  upcomingDeadlines: number;
  totalApplications: number;
  draftApplications: number;
  newGrantsThisWeek: number;
  deadlinesNext7Days: { id: string; title: string; deadline: Date; sourceName: string }[];
  notificationsSent: number;
}

export interface IStorage {
  // Grants
  getGrants(): Promise<Grant[]>;
  getGrantsFiltered(filters: GrantFilters): Promise<Grant[]>;
  getGrant(id: string): Promise<Grant | undefined>;
  createGrant(grant: InsertGrant): Promise<Grant>;
  updateGrant(id: string, grant: Partial<InsertGrant>): Promise<Grant | undefined>;
  deleteGrant(id: string): Promise<boolean>;
  getDashboardStats(): Promise<DashboardStats>;
  getUniqueGrantSources(): Promise<string[]>;

  // Companies
  getCompanies(): Promise<Company[]>;
  getCompaniesByUserId(userId: string): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<boolean>;

  // Applications
  getApplications(): Promise<Application[]>;
  getApplicationsByUserId(userId: string): Promise<Application[]>;
  getApplication(id: string): Promise<Application | undefined>;
  createApplication(application: InsertApplication): Promise<Application>;
  updateApplication(id: string, application: Partial<InsertApplication>): Promise<Application | undefined>;
  deleteApplication(id: string): Promise<boolean>;

  // Scraper Sources
  getScraperSources(): Promise<ScraperSource[]>;
  getScraperSource(id: string): Promise<ScraperSource | undefined>;
  createScraperSource(source: InsertScraperSource): Promise<ScraperSource>;
  updateScraperSource(id: string, source: Partial<InsertScraperSource>): Promise<ScraperSource | undefined>;
  deleteScraperSource(id: string): Promise<boolean>;

  // Scraper Logs
  getScraperLogs(): Promise<ScraperLog[]>;
  createScraperLog(log: InsertScraperLog): Promise<ScraperLog>;
  updateScraperLog(id: string, log: Partial<InsertScraperLog>): Promise<ScraperLog | undefined>;

  // Notifications
  getNotifications(): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  hasNotification(companyId: string, grantId: string, type: string): Promise<boolean>;
  getNotificationsSince(companyId: string, type: string, since: Date): Promise<Notification[]>;
  getGrantsCreatedSince(since: Date): Promise<Grant[]>;
  getScraperSourcesByFrequency(frequency: string, excludeSlow?: boolean): Promise<ScraperSource[]>;
  getSlowScraperSources(): Promise<ScraperSource[]>;

  // User Progress
  getUserProgress(userId: string): Promise<UserProgress | undefined>;
  upsertUserProgress(userId: string, data: Partial<InsertUserProgress>): Promise<UserProgress>;

  // Notification Preferences
  getNotificationPreferences(userId: string): Promise<NotificationPreference | undefined>;
  upsertNotificationPreferences(userId: string, data: Partial<InsertNotificationPreference>): Promise<NotificationPreference>;

  // Grant Alerts
  getAlertsByUserId(userId: string): Promise<GrantAlert[]>;
  getAlert(id: string): Promise<GrantAlert | undefined>;
  createAlert(alert: InsertGrantAlert): Promise<GrantAlert>;
  updateAlert(id: string, data: Partial<InsertGrantAlert>): Promise<GrantAlert | undefined>;
  deleteAlert(id: string): Promise<boolean>;
  getActiveAlerts(): Promise<GrantAlert[]>;

  // Alert Matches
  getAlertMatches(alertId: string): Promise<AlertMatch[]>;
  createAlertMatch(match: InsertAlertMatch): Promise<AlertMatch>;
  hasAlertMatch(alertId: string, grantId: string): Promise<boolean>;
  getUnnotifiedAlertMatches(alertId: string): Promise<AlertMatch[]>;
  markAlertMatchNotified(id: string): Promise<void>;

  // Grant Bookmarks
  getBookmarksByUserId(userId: string): Promise<GrantBookmark[]>;
  isBookmarked(userId: string, grantId: string): Promise<boolean>;
  createBookmark(bookmark: InsertGrantBookmark): Promise<GrantBookmark>;
  deleteBookmark(userId: string, grantId: string): Promise<boolean>;

  // Eligibility Checks
  getEligibilityCheck(grantId: string, companyId: string): Promise<EligibilityCheck | undefined>;
  getEligibilityChecksByCompanyAndHash(companyId: string, profileHash: string): Promise<EligibilityCheck[]>;
  upsertEligibilityCheck(data: InsertEligibilityCheck): Promise<EligibilityCheck>;
  deleteEligibilityChecksByCompany(companyId: string): Promise<void>;

  getMatchExplanation(grantId: string, companyId: string): Promise<MatchExplanation | undefined>;
  upsertMatchExplanation(data: InsertMatchExplanation): Promise<MatchExplanation>;
}


// rawData holds the full scraped source payload — 4.7 MB across the open
// grants alone, and never read by the UI. List queries select every other
// column explicitly so it never leaves the database.
const grantListColumns = {
  id: grants.id,
  title: grants.title,
  description: grants.description,
  sourceName: grants.sourceName,
  sourceType: grants.sourceType,
  url: grants.url,
  deadline: grants.deadline,
  amountMin: grants.amountMin,
  amountMax: grants.amountMax,
  eligibilityCriteria: grants.eligibilityCriteria,
  structuredEligibility: grants.structuredEligibility,
  eligibilityExtractedAt: grants.eligibilityExtractedAt,
  targetGroup: grants.targetGroup,
  keywords: grants.keywords,
  applicationRequirements: grants.applicationRequirements,
  status: grants.status,
  createdAt: grants.createdAt,
  updatedAt: grants.updatedAt,
  market: grants.market,
  language: grants.language,
} as const;

export class DatabaseStorage implements IStorage {
  // Grants
  async getGrants(): Promise<Grant[]> {
    return await db.select(grantListColumns).from(grants).orderBy(desc(grants.createdAt)) as Grant[];
  }

  async getGrantsFiltered(filters: GrantFilters): Promise<Grant[]> {
    const conditions = [];

    if (filters.source) {
      conditions.push(eq(grants.sourceName, filters.source));
    }

    if (filters.status) {
      if (filters.status.includes(',')) {
        const statuses = filters.status.split(',').map(s => s.trim());
        conditions.push(inArray(grants.status, statuses));
      } else {
        conditions.push(eq(grants.status, filters.status));
      }
      const activeStatuses = filters.status.split(',').map(s => s.trim());
      const includesActive = activeStatuses.some(s => s === 'open' || s === 'upcoming');
      if (includesActive && !filters.deadlineDays) {
        conditions.push(
          or(
            sql`${grants.deadline} IS NULL`,
            gte(grants.deadline, new Date())
          )
        );
      }
    }

    if (filters.deadlineDays) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + filters.deadlineDays);
      conditions.push(
        and(
          gte(grants.deadline, new Date()),
          lte(grants.deadline, futureDate)
        )
      );
    }

    if (filters.amountMin) {
      conditions.push(
        or(
          sql`${grants.amountMax} IS NULL`,
          gte(grants.amountMax, filters.amountMin.toString())
        )
      );
    }

    if (filters.amountMax) {
      conditions.push(
        or(
          sql`${grants.amountMin} IS NULL`,
          lte(grants.amountMin, filters.amountMax.toString())
        )
      );
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(grants.title, `%${filters.search}%`),
          ilike(grants.description, `%${filters.search}%`)
        )
      );
    }

    const orderClauses = [
      sql`CASE WHEN ${grants.status} = 'open' THEN 0 WHEN ${grants.status} = 'upcoming' THEN 1 WHEN ${grants.status} = 'closed' THEN 2 ELSE 3 END`,
      sql`${grants.deadline} ASC NULLS LAST`,
    ];

    if (conditions.length === 0) {
      return await db.select(grantListColumns).from(grants).orderBy(...orderClauses) as Grant[];
    }

    return await db
      .select(grantListColumns)
      .from(grants)
      .where(and(...conditions))
      .orderBy(...orderClauses) as Grant[];
  }

  async getGrant(id: string): Promise<Grant | undefined> {
    const [grant] = await db.select().from(grants).where(eq(grants.id, id));
    return grant;
  }

  async getDashboardStats(): Promise<DashboardStats> {
    // Only the columns the counts below actually read.
    const allGrants = await db
      .select({
        id: grants.id,
        title: grants.title,
        sourceName: grants.sourceName,
        status: grants.status,
        deadline: grants.deadline,
        createdAt: grants.createdAt,
      })
      .from(grants);
    const allApplications = await db.select().from(applications);
    const allNotifications = await db.select().from(notifications);

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const openGrants = allGrants.filter(g => g.status === "open").length;
    const upcomingDeadlines = allGrants.filter(g => {
      if (!g.deadline) return false;
      const deadline = new Date(g.deadline);
      return deadline >= now && deadline <= thirtyDaysFromNow;
    }).length;

    const newGrantsThisWeek = allGrants.filter(g => {
      if (!g.createdAt) return false;
      const created = new Date(g.createdAt);
      return created >= oneWeekAgo;
    }).length;

    const deadlinesNext7Days = allGrants
      .filter(g => {
        if (!g.deadline) return false;
        const deadline = new Date(g.deadline);
        return deadline >= now && deadline <= sevenDaysFromNow;
      })
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
      .slice(0, 5)
      .map(g => ({
        id: g.id,
        title: g.title,
        deadline: g.deadline!,
        sourceName: g.sourceName,
      }));

    const draftApplications = allApplications.filter(a => a.status === "draft" || a.status === "generated").length;

    return {
      totalGrants: allGrants.length,
      openGrants,
      upcomingDeadlines,
      totalApplications: allApplications.length,
      draftApplications,
      newGrantsThisWeek,
      deadlinesNext7Days,
      notificationsSent: allNotifications.length,
    };
  }

  async getUniqueGrantSources(): Promise<string[]> {
    const result = await db
      .selectDistinct({ sourceName: grants.sourceName })
      .from(grants);
    return result.map(r => r.sourceName);
  }

  async createGrant(grant: InsertGrant): Promise<Grant> {
    const [created] = await db.insert(grants).values(grant).returning();
    return created;
  }

  async updateGrant(id: string, grant: Partial<InsertGrant>): Promise<Grant | undefined> {
    const [updated] = await db.update(grants).set({ ...grant, updatedAt: new Date() }).where(eq(grants.id, id)).returning();
    return updated;
  }

  async deleteGrant(id: string): Promise<boolean> {
    const result = await db.delete(grants).where(eq(grants.id, id));
    return true;
  }

  // Companies
  async getCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async getCompaniesByUserId(userId: string): Promise<Company[]> {
    return db.select().from(companies).where(eq(companies.userId, userId)).orderBy(desc(companies.createdAt));
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [created] = await db.insert(companies).values(company).returning();
    return created;
  }

  async updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined> {
    const [updated] = await db.update(companies).set(company).where(eq(companies.id, id)).returning();
    return updated;
  }

  async deleteCompany(id: string): Promise<boolean> {
    await db.delete(companies).where(eq(companies.id, id));
    return true;
  }

  // Applications
  async getApplications(): Promise<Application[]> {
    return db.select().from(applications).orderBy(desc(applications.createdAt));
  }

  async getApplicationsByUserId(userId: string): Promise<Application[]> {
    // Get applications for companies owned by this user
    const userCompanies = await db.select({ id: companies.id }).from(companies).where(eq(companies.userId, userId));
    const companyIds = userCompanies.map(c => c.id);
    if (companyIds.length === 0) return [];
    return db.select().from(applications).where(inArray(applications.companyId, companyIds)).orderBy(desc(applications.createdAt));
  }

  async getApplication(id: string): Promise<Application | undefined> {
    const [application] = await db.select().from(applications).where(eq(applications.id, id));
    return application;
  }

  async createApplication(application: InsertApplication): Promise<Application> {
    const [created] = await db.insert(applications).values(application).returning();
    return created;
  }

  async updateApplication(id: string, application: Partial<InsertApplication>): Promise<Application | undefined> {
    const [updated] = await db.update(applications).set(application).where(eq(applications.id, id)).returning();
    return updated;
  }

  async deleteApplication(id: string): Promise<boolean> {
    await db.delete(applications).where(eq(applications.id, id));
    return true;
  }

  // Scraper Sources
  async getScraperSources(): Promise<ScraperSource[]> {
    return db.select().from(scraperSources);
  }

  async getScraperSource(id: string): Promise<ScraperSource | undefined> {
    const [source] = await db.select().from(scraperSources).where(eq(scraperSources.id, id));
    return source;
  }

  async createScraperSource(source: InsertScraperSource): Promise<ScraperSource> {
    const [created] = await db.insert(scraperSources).values(source).returning();
    return created;
  }

  async updateScraperSource(id: string, source: Partial<InsertScraperSource>): Promise<ScraperSource | undefined> {
    const [updated] = await db.update(scraperSources).set(source).where(eq(scraperSources.id, id)).returning();
    return updated;
  }

  async deleteScraperSource(id: string): Promise<boolean> {
    await db.delete(scraperSources).where(eq(scraperSources.id, id));
    return true;
  }

  // Scraper Logs
  async getScraperLogs(): Promise<ScraperLog[]> {
    return db.select().from(scraperLogs).orderBy(desc(scraperLogs.scrapedAt));
  }

  async createScraperLog(log: InsertScraperLog): Promise<ScraperLog> {
    const [created] = await db.insert(scraperLogs).values(log).returning();
    return created;
  }

  async updateScraperLog(id: string, log: Partial<InsertScraperLog>): Promise<ScraperLog | undefined> {
    const [updated] = await db
      .update(scraperLogs)
      .set(log)
      .where(eq(scraperLogs.id, id))
      .returning();
    return updated;
  }

  // Notifications
  async getNotifications(): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(desc(notifications.sentAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async hasNotification(companyId: string, grantId: string, type: string): Promise<boolean> {
    const result = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.companyId, companyId),
          eq(notifications.grantId, grantId),
          eq(notifications.type, type)
        )
      )
      .limit(1);
    return result.length > 0;
  }

  async getNotificationsSince(companyId: string, type: string, since: Date): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.companyId, companyId),
          eq(notifications.type, type),
          gte(notifications.sentAt, since)
        )
      );
  }

  async getGrantsCreatedSince(since: Date): Promise<Grant[]> {
    return db
      .select()
      .from(grants)
      .where(gte(grants.createdAt, since))
      .orderBy(desc(grants.createdAt));
  }

  async getScraperSourcesByFrequency(frequency: string, excludeSlow: boolean = false): Promise<ScraperSource[]> {
    const conditions = [
      eq(scraperSources.active, true),
      eq(scraperSources.updateFrequency, frequency),
    ];
    if (excludeSlow) {
      conditions.push(lte(scraperSources.estimatedDurationMinutes, 5));
    }
    return db
      .select()
      .from(scraperSources)
      .where(and(...conditions));
  }

  async getSlowScraperSources(): Promise<ScraperSource[]> {
    return db
      .select()
      .from(scraperSources)
      .where(
        and(
          eq(scraperSources.active, true),
          gt(scraperSources.estimatedDurationMinutes, 5)
        )
      );
  }

  // User Progress
  async getUserProgress(userId: string): Promise<UserProgress | undefined> {
    const [progress] = await db.select().from(userProgress).where(eq(userProgress.userId, userId));
    return progress;
  }

  async upsertUserProgress(userId: string, data: Partial<InsertUserProgress>): Promise<UserProgress> {
    let existing = await this.getUserProgress(userId);
    if (!existing) {
      const [created] = await db.insert(userProgress)
        .values({ userId, ...data })
        .returning();
      return created;
    }
    const safeData: any = { ...data };
    if (existing.profileCreatedAt && safeData.profileCreatedAt) delete safeData.profileCreatedAt;
    if (existing.profileCompletedAt && safeData.profileCompletedAt) delete safeData.profileCompletedAt;
    if (existing.firstGrantViewedAt && safeData.firstGrantViewedAt) delete safeData.firstGrantViewedAt;
    if (existing.firstAIAnalysisAt && safeData.firstAIAnalysisAt) delete safeData.firstAIAnalysisAt;
    if (existing.firstApplicationAt && safeData.firstApplicationAt) delete safeData.firstApplicationAt;
    if (existing.firstSubmissionAt && safeData.firstSubmissionAt) delete safeData.firstSubmissionAt;
    const [updated] = await db.update(userProgress)
      .set({ ...safeData, updatedAt: new Date() })
      .where(eq(userProgress.userId, userId))
      .returning();
    return updated;
  }

  // Notification Preferences
  async getNotificationPreferences(userId: string): Promise<NotificationPreference | undefined> {
    const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    return prefs;
  }

  async upsertNotificationPreferences(userId: string, data: Partial<InsertNotificationPreference>): Promise<NotificationPreference> {
    let existing = await this.getNotificationPreferences(userId);
    if (!existing) {
      const [created] = await db.insert(notificationPreferences)
        .values({ userId, ...data })
        .returning();
      return created;
    }
    const [updated] = await db.update(notificationPreferences)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, userId))
      .returning();
    return updated;
  }

  // Grant Alerts
  async getAlertsByUserId(userId: string): Promise<GrantAlert[]> {
    return db.select().from(grantAlerts).where(eq(grantAlerts.userId, userId)).orderBy(desc(grantAlerts.createdAt));
  }

  async getAlert(id: string): Promise<GrantAlert | undefined> {
    const [alert] = await db.select().from(grantAlerts).where(eq(grantAlerts.id, id));
    return alert;
  }

  async createAlert(alert: InsertGrantAlert): Promise<GrantAlert> {
    const [created] = await db.insert(grantAlerts).values(alert).returning();
    return created;
  }

  async updateAlert(id: string, data: Partial<InsertGrantAlert>): Promise<GrantAlert | undefined> {
    const [updated] = await db.update(grantAlerts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(grantAlerts.id, id))
      .returning();
    return updated;
  }

  async deleteAlert(id: string): Promise<boolean> {
    await db.delete(alertMatches).where(eq(alertMatches.alertId, id));
    await db.delete(grantAlerts).where(eq(grantAlerts.id, id));
    return true;
  }

  async getActiveAlerts(): Promise<GrantAlert[]> {
    return db.select().from(grantAlerts).where(eq(grantAlerts.active, true));
  }

  // Alert Matches
  async getAlertMatches(alertId: string): Promise<AlertMatch[]> {
    return db.select().from(alertMatches).where(eq(alertMatches.alertId, alertId)).orderBy(desc(alertMatches.createdAt)).limit(50);
  }

  async createAlertMatch(match: InsertAlertMatch): Promise<AlertMatch> {
    const [created] = await db.insert(alertMatches).values(match).returning();
    return created;
  }

  async hasAlertMatch(alertId: string, grantId: string): Promise<boolean> {
    const result = await db.select().from(alertMatches)
      .where(and(eq(alertMatches.alertId, alertId), eq(alertMatches.grantId, grantId)))
      .limit(1);
    return result.length > 0;
  }

  async getUnnotifiedAlertMatches(alertId: string): Promise<AlertMatch[]> {
    return db.select().from(alertMatches)
      .where(and(eq(alertMatches.alertId, alertId), eq(alertMatches.notified, false)));
  }

  async markAlertMatchNotified(id: string): Promise<void> {
    await db.update(alertMatches)
      .set({ notified: true, notifiedAt: new Date() })
      .where(eq(alertMatches.id, id));
  }

  async getBookmarksByUserId(userId: string): Promise<GrantBookmark[]> {
    return db.select().from(grantBookmarks)
      .where(eq(grantBookmarks.userId, userId))
      .orderBy(desc(grantBookmarks.createdAt));
  }

  async isBookmarked(userId: string, grantId: string): Promise<boolean> {
    const result = await db.select().from(grantBookmarks)
      .where(and(eq(grantBookmarks.userId, userId), eq(grantBookmarks.grantId, grantId)))
      .limit(1);
    return result.length > 0;
  }

  async createBookmark(bookmark: InsertGrantBookmark): Promise<GrantBookmark> {
    const [created] = await db.insert(grantBookmarks).values(bookmark).returning();
    return created;
  }

  async deleteBookmark(userId: string, grantId: string): Promise<boolean> {
    const result = await db.delete(grantBookmarks)
      .where(and(eq(grantBookmarks.userId, userId), eq(grantBookmarks.grantId, grantId)))
      .returning();
    return result.length > 0;
  }

  async getEligibilityCheck(grantId: string, companyId: string): Promise<EligibilityCheck | undefined> {
    const [check] = await db.select().from(eligibilityChecks)
      .where(and(eq(eligibilityChecks.grantId, grantId), eq(eligibilityChecks.companyId, companyId)))
      .orderBy(desc(eligibilityChecks.checkedAt))
      .limit(1);
    return check;
  }

  async getEligibilityChecksByCompanyAndHash(companyId: string, profileHash: string): Promise<EligibilityCheck[]> {
    return db.select().from(eligibilityChecks)
      .where(and(eq(eligibilityChecks.companyId, companyId), eq(eligibilityChecks.profileHash, profileHash)));
  }

  async upsertEligibilityCheck(data: InsertEligibilityCheck): Promise<EligibilityCheck> {
    const existing = await this.getEligibilityCheck(data.grantId, data.companyId);
    if (existing) {
      const [updated] = await db.update(eligibilityChecks)
        .set({ verdict: data.verdict, score: data.score, result: data.result, source: data.source, profileHash: (data as any).profileHash, checkedAt: new Date() })
        .where(eq(eligibilityChecks.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(eligibilityChecks).values(data).returning();
    return created;
  }

  async deleteEligibilityChecksByCompany(companyId: string): Promise<void> {
    await db.delete(eligibilityChecks).where(eq(eligibilityChecks.companyId, companyId));
  }

  async getMatchExplanation(grantId: string, companyId: string): Promise<MatchExplanation | undefined> {
    const [explanation] = await db.select().from(matchExplanations)
      .where(and(eq(matchExplanations.grantId, grantId), eq(matchExplanations.companyId, companyId)))
      .orderBy(desc(matchExplanations.createdAt))
      .limit(1);
    return explanation;
  }

  async upsertMatchExplanation(data: InsertMatchExplanation): Promise<MatchExplanation> {
    const existing = await this.getMatchExplanation(data.grantId, data.companyId);
    if (existing) {
      const [updated] = await db.update(matchExplanations)
        .set({ matchScore: data.matchScore, headline: data.headline, reasons: data.reasons, bestFitAspect: data.bestFitAspect, createdAt: new Date() })
        .where(eq(matchExplanations.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(matchExplanations).values(data).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
