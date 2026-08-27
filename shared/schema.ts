import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, numeric, integer, boolean, jsonb, date, uuid, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Export auth models (users + sessions)
export * from "./models/auth";

// Grants table - stores scraped grant information
export const grants = pgTable("grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull(), // "myndighet", "stiftelse", "eu"
  url: text("url").notNull(),
  deadline: timestamp("deadline"),
  amountMin: numeric("amount_min"),
  amountMax: numeric("amount_max"),
  eligibilityCriteria: jsonb("eligibility_criteria").$type<Record<string, unknown>>(),
  structuredEligibility: jsonb("structured_eligibility").$type<Record<string, unknown>>(),
  eligibilityExtractedAt: timestamp("eligibility_extracted_at"),
  targetGroup: text("target_group").array(), // ["startup", "sme", "nonprofit"]
  keywords: text("keywords").array(),
  applicationRequirements: jsonb("application_requirements").$type<Record<string, unknown>>(),
  status: text("status").notNull().default("open"), // "open", "upcoming", "closed"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  market: text("market").default("se"),
  language: text("language").default("sv"),
});

// Companies table - stores company profiles
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  companyName: text("company_name").notNull(),
  orgNumber: text("org_number"),
  orgType: text("org_type"),
  industry: text("industry"),
  employees: integer("employees"),
  revenue: numeric("revenue"),
  foundedYear: integer("founded_year"),
  description: text("description"),
  location: text("location"),
  websiteUrl: text("website_url"),
  focusAreas: text("focus_areas").array(),
  notificationEmail: text("notification_email"),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  market: text("market").default("se"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Search profiles — what the company is seeking funding FOR. Eligibility
// factors keep reading from the company; relevance factors read from the
// selected profile. Every company gets an auto-created 'core' profile that
// mirrors the company profile (today's behavior); 'project' profiles are
// user-created via wizard or document extraction.
export const searchProfiles = pgTable("search_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // 'core' | 'project'
  description: text("description"),
  goals: text("goals"),
  focusAreas: text("focus_areas").array(),
  keywords: text("keywords").array(),
  budgetSek: integer("budget_sek"),
  timeframe: text("timeframe"),
  sourceDocumentUrl: varchar("source_document_url"),
  extraction: jsonb("extraction").$type<Record<string, unknown>>(),
  createdFrom: text("created_from").notNull(), // 'auto' | 'wizard' | 'document'
  isDefault: boolean("is_default").default(false),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSearchProfileSchema = createInsertSchema(searchProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type SearchProfile = typeof searchProfiles.$inferSelect;
export type InsertSearchProfile = z.infer<typeof insertSearchProfileSchema>;

// Application status enum for tracking lifecycle
// draft: AI-generated, not edited
// ready: User edited, ready to submit
// submitted: Sent to myndighet
// under_review: Myndighet is reviewing
// approved: BEVILJAT (grant approved!)
// rejected: Nekad (grant rejected)
// withdrawn: User cancelled the application

// Applications table - tracks grant applications
export const applications = pgTable("applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id),
  grantId: varchar("grant_id").references(() => grants.id),
  status: text("status").notNull().default("draft"), // "draft", "ready", "submitted", "under_review", "approved", "rejected", "withdrawn"
  generatedContent: text("generated_content"),
  sections: jsonb("sections").$type<ApplicationSection[]>(),
  companySnapshot: jsonb("company_snapshot").$type<Record<string, unknown>>(),
  projectData: jsonb("project_data").$type<Record<string, unknown>>(),
  profileId: varchar("profile_id").references(() => searchProfiles.id), // search profile the application started from
  overallScore: integer("overall_score"),
  warnings: jsonb("warnings").$type<string[]>().default([]),
  aiModelUsed: text("ai_model_used"),
  matchScore: numeric("match_score"), // 0-100
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  submittedAt: timestamp("submitted_at"),
  submissionMethod: text("submission_method"), // "bidragai", "manual", "external"
  approvedAmount: numeric("approved_amount"), // Amount granted if approved
  statusUpdatedAt: timestamp("status_updated_at"), // When status last changed
  complianceReport: jsonb("compliance_report").$type<ComplianceReport>(),
  complianceCheckedAt: timestamp("compliance_checked_at"),
});

export interface ApplicationSection {
  sectionKey: string;
  sectionTitle: string;
  content: string;
  wordCount: number;
  maxWords?: number;
  evaluationCriteria?: string;
}

export interface ComplianceIssue {
  severity: 'critical' | 'major' | 'minor';
  issue: string;
  criterion: string;
  fix: string;
}

export interface SectionCompliance {
  sectionKey: string;
  sectionTitle: string;
  score: number;
  issues: ComplianceIssue[];
  suggestions: string[];
}

export interface ComplianceReport {
  overallScore: number;
  readinessLevel: 'not_ready' | 'needs_work' | 'almost_ready' | 'ready';
  sections: SectionCompliance[];
  criticalIssues: string[];
  improvements: string[];
  strengths: string[];
  estimatedSuccessRate: string;
  checkedAt: string;
}

// Scraper sources table - defines scraping configurations
export const scraperSources = pgTable("scraper_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // "api", "scrape", "rss"
  url: text("url").notNull(),
  scraperType: text("scraper_type"), // "playwright", "beautifulsoup", "api", "rss"
  rssUrl: text("rss_url"), // RSS feed URL for RSS-based sources
  selectors: jsonb("selectors").$type<Record<string, string>>(),
  active: boolean("active").default(true),
  lastScraped: timestamp("last_scraped"),
  updateFrequency: text("update_frequency").default("daily"), // "daily", "weekly"
  apiConfig: jsonb("api_config").$type<Record<string, unknown>>(),
  market: text("market").default("se"),
  language: text("language").default("sv"),
  estimatedDurationMinutes: integer("estimated_duration_minutes").default(1),
});

// Scraper logs table - tracks scraping runs
export const scraperLogs = pgTable("scraper_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").references(() => scraperSources.id),
  status: text("status").notNull(), // "success", "failed"
  grantsFound: integer("grants_found"),
  errorMessage: text("error_message"),
  scrapedAt: timestamp("scraped_at").defaultNow(),
});

// Notifications table - tracks sent email notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // For future user system
  companyId: varchar("company_id").references(() => companies.id),
  grantId: varchar("grant_id").references(() => grants.id),
  type: text("type").notNull(), // "new_grant_match", "deadline_reminder_7d", "deadline_reminder_3d", "deadline_reminder_1d"
  email: text("email").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const userProgress = pgTable('user_progress', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().unique(),
  profileCreated: boolean('profile_created').default(false),
  profileCompleted: boolean('profile_completed').default(false),
  firstGrantViewed: boolean('first_grant_viewed').default(false),
  firstAIAnalysisRun: boolean('first_ai_analysis_run').default(false),
  firstApplicationGenerated: boolean('first_application_generated').default(false),
  firstApplicationSubmitted: boolean('first_application_submitted').default(false),
  profileCreatedAt: timestamp('profile_created_at'),
  profileCompletedAt: timestamp('profile_completed_at'),
  firstGrantViewedAt: timestamp('first_grant_viewed_at'),
  firstAIAnalysisAt: timestamp('first_ai_analysis_at'),
  firstApplicationAt: timestamp('first_application_at'),
  firstSubmissionAt: timestamp('first_submission_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const notificationPreferences = pgTable('notification_preferences', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().unique(),
  emailNotificationsEnabled: boolean('email_notifications_enabled').default(true),
  newGrantsEnabled: boolean('new_grants_enabled').default(true),
  newGrantsFrequency: text('new_grants_frequency').default('daily'),
  newGrantsMinMatchScore: integer('new_grants_min_match_score').default(60),
  deadlineRemindersEnabled: boolean('deadline_reminders_enabled').default(true),
  deadlineReminderDays: jsonb('deadline_reminder_days').$type<number[]>().default([7, 3, 1]),
  weeklyDigestEnabled: boolean('weekly_digest_enabled').default(true),
  weeklyDigestDay: integer('weekly_digest_day').default(1),
  preferredHour: integer('preferred_hour').default(8),
  pushEnabled: boolean('push_enabled').default(false),
  pushSubscription: jsonb('push_subscription'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const grantAlerts = pgTable('grant_alerts', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  companyId: varchar('company_id').references(() => companies.id),
  name: text('name').notNull(),
  profileId: varchar('profile_id').references(() => searchProfiles.id), // null = core profile (pre-profiles alerts)
  active: boolean('active').default(true),
  keywords: jsonb('keywords').$type<string[]>(),
  sources: jsonb('sources').$type<string[]>(),
  minAmount: numeric('min_amount', { precision: 12, scale: 2 }),
  maxAmount: numeric('max_amount', { precision: 12, scale: 2 }),
  industries: jsonb('industries').$type<string[]>(),
  minMatchScore: integer('min_match_score').default(60),
  notifyImmediately: boolean('notify_immediately').default(true),
  includeInDigest: boolean('include_in_digest').default(true),
  lastTriggered: timestamp('last_triggered'),
  triggerCount: integer('trigger_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const alertMatches = pgTable('alert_matches', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  alertId: varchar('alert_id').references(() => grantAlerts.id).notNull(),
  grantId: varchar('grant_id').references(() => grants.id).notNull(),
  matchScore: integer('match_score'),
  notified: boolean('notified').default(false),
  notifiedAt: timestamp('notified_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertGrantAlertSchema = createInsertSchema(grantAlerts).omit({
  id: true,
  lastTriggered: true,
  triggerCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAlertMatchSchema = createInsertSchema(alertMatches).omit({
  id: true,
  createdAt: true,
});

export type GrantAlert = typeof grantAlerts.$inferSelect;
export type InsertGrantAlert = z.infer<typeof insertGrantAlertSchema>;
export type AlertMatch = typeof alertMatches.$inferSelect;
export type InsertAlertMatch = z.infer<typeof insertAlertMatchSchema>;

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferencesSchema>;

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserProgress = typeof userProgress.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;

// Insert schemas
export const insertGrantSchema = createInsertSchema(grants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
});

export const insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  createdAt: true,
});

export const insertScraperSourceSchema = createInsertSchema(scraperSources).omit({
  id: true,
});

export const insertScraperLogSchema = createInsertSchema(scraperLogs).omit({
  id: true,
  scrapedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  sentAt: true,
});

// Types
export type Grant = typeof grants.$inferSelect;
export type InsertGrant = z.infer<typeof insertGrantSchema>;

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type Application = typeof applications.$inferSelect;
export type InsertApplication = z.infer<typeof insertApplicationSchema>;

export type ScraperSource = typeof scraperSources.$inferSelect;
export type InsertScraperSource = z.infer<typeof insertScraperSourceSchema>;

export type ScraperLog = typeof scraperLogs.$inferSelect;
export type InsertScraperLog = z.infer<typeof insertScraperLogSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export const grantBookmarks = pgTable('grant_bookmarks', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  grantId: varchar('grant_id').references(() => grants.id).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertGrantBookmarkSchema = createInsertSchema(grantBookmarks).omit({
  id: true,
  createdAt: true,
});

export type GrantBookmark = typeof grantBookmarks.$inferSelect;
export type InsertGrantBookmark = z.infer<typeof insertGrantBookmarkSchema>;

export const eligibilityChecks = pgTable('eligibility_checks', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  grantId: varchar('grant_id').references(() => grants.id).notNull(),
  companyId: varchar('company_id').references(() => companies.id).notNull(),
  verdict: text('verdict').notNull(),
  score: integer('score').notNull().default(0),
  result: jsonb('result').$type<EligibilityCheckResult>().notNull(),
  source: text('source').notNull().default('structured'),
  profileHash: text('profile_hash'),
  checkedAt: timestamp('checked_at').defaultNow(),
});

export interface EligibilityCheckResult {
  verdict: 'eligible' | 'partial' | 'ineligible' | 'unknown';
  score: number;
  criteria: EligibilityCriterion[];
  summary: string;
  blockers: string[];
  warnings: string[];
  strengths: string[];
}

export interface EligibilityCriterion {
  name: string;
  requirement: string;
  companyValue: string;
  status: 'pass' | 'fail' | 'warning' | 'unknown';
  explanation: string;
}

export const insertEligibilityCheckSchema = createInsertSchema(eligibilityChecks).omit({
  id: true,
  checkedAt: true,
});

export type EligibilityCheck = typeof eligibilityChecks.$inferSelect;
export type InsertEligibilityCheck = z.infer<typeof insertEligibilityCheckSchema>;

export const matchExplanations = pgTable('match_explanations', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  grantId: varchar('grant_id').references(() => grants.id).notNull(),
  companyId: varchar('company_id').references(() => companies.id).notNull(),
  profileId: varchar('profile_id').references(() => searchProfiles.id), // null = core profile (pre-profiles cache rows)
  matchScore: integer('match_score').notNull(),
  headline: text('headline').notNull(),
  reasons: jsonb('reasons').$type<string[]>().notNull(),
  bestFitAspect: text('best_fit_aspect').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertMatchExplanationSchema = createInsertSchema(matchExplanations).omit({
  id: true,
  createdAt: true,
});

export type MatchExplanation = typeof matchExplanations.$inferSelect;
export type InsertMatchExplanation = z.infer<typeof insertMatchExplanationSchema>;

export const applicationCollaborators = pgTable('application_collaborators', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar('application_id').notNull(),
  userId: varchar('user_id'),
  email: varchar('email').notNull(),
  role: varchar('role').notNull().default('editor'),
  invitedBy: varchar('invited_by').notNull(),
  status: varchar('status').default('pending'),
  inviteToken: varchar('invite_token'),
  inviteExpiresAt: timestamp('invite_expires_at'),
  joinedAt: timestamp('joined_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const applicationComments = pgTable('application_comments', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar('application_id').notNull(),
  sectionKey: varchar('section_key'),
  userId: varchar('user_id').notNull(),
  authorName: varchar('author_name').notNull(),
  authorEmail: varchar('author_email').notNull(),
  content: text('content').notNull(),
  resolved: boolean('resolved').default(false),
  resolvedBy: varchar('resolved_by'),
  resolvedAt: timestamp('resolved_at'),
  parentId: varchar('parent_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const applicationSectionHistory = pgTable('application_section_history', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar('application_id').notNull(),
  sectionKey: varchar('section_key').notNull(),
  content: text('content').notNull(),
  editedBy: varchar('edited_by').notNull(),
  editorName: varchar('editor_name').notNull(),
  wordCount: integer('word_count'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const applicationPresence = pgTable('application_presence', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar('application_id').notNull(),
  userId: varchar('user_id').notNull(),
  userName: varchar('user_name').notNull(),
  userColor: varchar('user_color').notNull(),
  currentSection: varchar('current_section'),
  lastSeenAt: timestamp('last_seen_at').defaultNow(),
});

export const insertCollaboratorSchema = createInsertSchema(applicationCollaborators).omit({
  id: true,
  createdAt: true,
});

export const insertCommentSchema = createInsertSchema(applicationComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSectionHistorySchema = createInsertSchema(applicationSectionHistory).omit({
  id: true,
  createdAt: true,
});

export const insertPresenceSchema = createInsertSchema(applicationPresence).omit({
  id: true,
  lastSeenAt: true,
});

export type ApplicationCollaborator = typeof applicationCollaborators.$inferSelect;
export type InsertCollaborator = z.infer<typeof insertCollaboratorSchema>;

export type ApplicationComment = typeof applicationComments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type ApplicationSectionHistoryEntry = typeof applicationSectionHistory.$inferSelect;
export type InsertSectionHistory = z.infer<typeof insertSectionHistorySchema>;

export type ApplicationPresenceEntry = typeof applicationPresence.$inferSelect;
export type InsertPresence = z.infer<typeof insertPresenceSchema>;

export const contentLibrary = pgTable('content_library', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  companyId: varchar('company_id').notNull(),
  contentType: varchar('content_type').notNull(),
  title: varchar('title').notNull(),
  content: text('content').notNull(),
  wordCount: integer('word_count'),
  language: varchar('language').default('sv'),
  tags: varchar('tags').array().default([]),
  usageCount: integer('usage_count').default(0),
  lastUsedAt: timestamp('last_used_at'),
  sourceApplicationId: varchar('source_application_id'),
  isApproved: boolean('is_approved').default(false),
  isDeleted: boolean('is_deleted').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const contentLibraryUsage = pgTable('content_library_usage', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  contentId: varchar('content_id').notNull(),
  applicationId: varchar('application_id').notNull(),
  sectionKey: varchar('section_key').notNull(),
  usedAt: timestamp('used_at').defaultNow(),
});

export const insertContentLibrarySchema = createInsertSchema(contentLibrary).omit({
  id: true,
  usageCount: true,
  lastUsedAt: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContentLibraryUsageSchema = createInsertSchema(contentLibraryUsage).omit({
  id: true,
  usedAt: true,
});

export type ContentBlock = typeof contentLibrary.$inferSelect;
export type InsertContentBlock = z.infer<typeof insertContentLibrarySchema>;
export type ContentBlockUsage = typeof contentLibraryUsage.$inferSelect;
export type InsertContentBlockUsage = z.infer<typeof insertContentLibraryUsageSchema>;

// ====== POST-AWARD PROJECT MANAGEMENT ======

export const grantProjects = pgTable('grant_projects', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  applicationId: varchar('application_id').references(() => applications.id),
  grantId: varchar('grant_id'),
  companyId: varchar('company_id').notNull(),
  title: varchar('title').notNull(),
  funder: varchar('funder').notNull(),
  approvedAmountSek: integer('approved_amount_sek'),
  grantAgreementRef: varchar('grant_agreement_ref'),
  reportingContactName: varchar('reporting_contact_name'),
  reportingContactEmail: varchar('reporting_contact_email'),
  funderPortalUrl: varchar('funder_portal_url'),
  projectStartDate: date('project_start_date'),
  projectEndDate: date('project_end_date'),
  status: varchar('status').default('active'),
  healthStatus: varchar('health_status').default('on_track'),
  coFundingRequired: boolean('co_funding_required').default(false),
  coFundingPercentage: integer('co_funding_percentage'),
  coFundingAmountSek: integer('co_funding_amount_sek'),
  notes: text('notes'),
  internalTags: varchar('internal_tags').array().default([]),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const projectMilestones = pgTable('project_milestones', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar('project_id').notNull().references(() => grantProjects.id),
  title: varchar('title').notNull(),
  description: text('description'),
  order: integer('order').default(0),
  dueDate: date('due_date').notNull(),
  completedAt: timestamp('completed_at'),
  status: varchar('status').default('pending'),
  deliverableType: varchar('deliverable_type'),
  deliverableDescription: text('deliverable_description'),
  deliverableUrl: varchar('deliverable_url'),
  deliverableFileKey: varchar('deliverable_file_key'),
  funderApproved: boolean('funder_approved'),
  funderApprovedAt: timestamp('funder_approved_at'),
  funderFeedback: text('funder_feedback'),
  budgetReleaseAmountSek: integer('budget_release_amount_sek'),
  budgetReleasedAt: timestamp('budget_released_at'),
  assignedToEmail: varchar('assigned_to_email'),
  assignedToName: varchar('assigned_to_name'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const projectReports = pgTable('project_reports', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar('project_id').notNull().references(() => grantProjects.id),
  reportType: varchar('report_type').notNull(),
  title: varchar('title').notNull(),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  dueDate: date('due_date'),
  submittedAt: timestamp('submitted_at'),
  funderDeadline: date('funder_deadline'),
  status: varchar('status').default('upcoming'),
  content: text('content'),
  executiveSummary: text('executive_summary'),
  financialSummary: text('financial_summary'),
  attachmentUrls: jsonb('attachment_urls').default([]),
  aiGenerated: boolean('ai_generated').default(false),
  aiGeneratedAt: timestamp('ai_generated_at'),
  lastEditedBy: varchar('last_edited_by'),
  funderFeedback: text('funder_feedback'),
  funderApprovedAt: timestamp('funder_approved_at'),
  revisionRequestedAt: timestamp('revision_requested_at'),
  revisionNotes: text('revision_notes'),
  submissionMethod: varchar('submission_method'),
  submissionConfirmationRef: varchar('submission_confirmation_ref'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const projectBudgetCategories = pgTable('project_budget_categories', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar('project_id').notNull().references(() => grantProjects.id),
  category: varchar('category').notNull(),
  categoryLabel: varchar('category_label'),
  budgetedAmountSek: integer('budgeted_amount_sek').notNull(),
  grantCoveredAmountSek: integer('grant_covered_amount_sek'),
  coFundingAmountSek: integer('co_funding_amount_sek'),
  spentAmountSek: integer('spent_amount_sek').default(0),
  committedAmountSek: integer('committed_amount_sek').default(0),
  notes: text('notes'),
  order: integer('order').default(0),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const projectExpenses = pgTable('project_expenses', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar('project_id').notNull().references(() => grantProjects.id),
  categoryId: varchar('category_id').references(() => projectBudgetCategories.id),
  description: varchar('description').notNull(),
  amountSek: integer('amount_sek').notNull(),
  expenseDate: date('expense_date').notNull(),
  expenseType: varchar('expense_type'),
  supplierName: varchar('supplier_name'),
  invoiceRef: varchar('invoice_ref'),
  isEligible: boolean('is_eligible').default(true),
  eligibilityNote: text('eligibility_note'),
  receiptUrl: varchar('receipt_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const projectTeamMembers = pgTable('project_team_members', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar('project_id').notNull().references(() => grantProjects.id),
  name: varchar('name').notNull(),
  email: varchar('email'),
  role: varchar('role').notNull(),
  roleDescription: text('role_description'),
  allocationPercentage: integer('allocation_percentage'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  monthlyCostSek: integer('monthly_cost_sek'),
  isExternal: boolean('is_external').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const projectActivityLog = pgTable('project_activity_log', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar('project_id').notNull().references(() => grantProjects.id),
  userId: varchar('user_id').notNull(),
  userName: varchar('user_name').notNull(),
  activityType: varchar('activity_type').notNull(),
  description: text('description').notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

export const projectDocuments = pgTable('project_documents', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar('project_id').notNull().references(() => grantProjects.id),
  name: varchar('name').notNull(),
  description: text('description'),
  documentType: varchar('document_type'),
  fileUrl: varchar('file_url').notNull(),
  fileSize: integer('file_size'),
  mimeType: varchar('mime_type'),
  uploadedBy: varchar('uploaded_by').notNull(),
  uploadedByName: varchar('uploaded_by_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const projectRisks = pgTable('project_risks', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar('project_id').notNull().references(() => grantProjects.id),
  title: varchar('title').notNull(),
  description: text('description'),
  riskType: varchar('risk_type'),
  probability: varchar('probability'),
  impact: varchar('impact'),
  riskScore: integer('risk_score'),
  status: varchar('status').default('open'),
  mitigationPlan: text('mitigation_plan'),
  mitigatedAt: timestamp('mitigated_at'),
  assignedToEmail: varchar('assigned_to_email'),
  dueDate: date('due_date'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert schemas
export const insertGrantProjectSchema = createInsertSchema(grantProjects).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertProjectMilestoneSchema = createInsertSchema(projectMilestones).omit({
  id: true, completedAt: true, funderApprovedAt: true, budgetReleasedAt: true, createdAt: true, updatedAt: true,
});
export const insertProjectReportSchema = createInsertSchema(projectReports).omit({
  id: true, submittedAt: true, aiGenerated: true, aiGeneratedAt: true, funderApprovedAt: true, revisionRequestedAt: true, createdAt: true, updatedAt: true,
});
export const insertBudgetCategorySchema = createInsertSchema(projectBudgetCategories).omit({
  id: true, spentAmountSek: true, committedAmountSek: true, updatedAt: true,
});
export const insertExpenseSchema = createInsertSchema(projectExpenses).omit({
  id: true, createdAt: true,
});
export const insertTeamMemberSchema = createInsertSchema(projectTeamMembers).omit({
  id: true, createdAt: true,
});
export const insertActivityLogSchema = createInsertSchema(projectActivityLog).omit({
  id: true, createdAt: true,
});
export const insertDocumentSchema = createInsertSchema(projectDocuments).omit({
  id: true, createdAt: true,
});
export const insertRiskSchema = createInsertSchema(projectRisks).omit({
  id: true, mitigatedAt: true, createdAt: true, updatedAt: true,
});

// Types
export type GrantProject = typeof grantProjects.$inferSelect;
export type InsertGrantProject = z.infer<typeof insertGrantProjectSchema>;
export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type InsertProjectMilestone = z.infer<typeof insertProjectMilestoneSchema>;
export type ProjectReport = typeof projectReports.$inferSelect;
export type InsertProjectReport = z.infer<typeof insertProjectReportSchema>;
export type BudgetCategory = typeof projectBudgetCategories.$inferSelect;
export type InsertBudgetCategory = z.infer<typeof insertBudgetCategorySchema>;
export type ProjectExpense = typeof projectExpenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type TeamMember = typeof projectTeamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type ActivityLogEntry = typeof projectActivityLog.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = z.infer<typeof insertDocumentSchema>;
export type ProjectRisk = typeof projectRisks.$inferSelect;
export type InsertProjectRisk = z.infer<typeof insertRiskSchema>;

// ─── Success Fee Module ──────────────────────────────────────────────────────

export const successFeeAgreements = pgTable('success_fee_agreements', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  applicationId: varchar('application_id').notNull(),
  grantId: varchar('grant_id').notNull(),
  grantTitle: varchar('grant_title').notNull(),
  funder: varchar('funder').notNull(),

  feePercentage: integer('fee_percentage').notNull().default(3),
  maxFeeCapSek: integer('max_fee_cap_sek').notNull().default(25000),
  minFeeSek: integer('min_fee_sek').notNull().default(500),
  termsVersion: varchar('terms_version').notNull().default('1.0'),

  status: varchar('status').notNull().default('pending'),

  agreedAt: timestamp('agreed_at'),
  ipAddressAtAgreement: varchar('ip_address_at_agreement'),

  outcomeReportedAt: timestamp('outcome_reported_at'),
  approvedAmountSek: integer('approved_amount_sek'),
  grantAgreementRef: varchar('grant_agreement_ref'),
  proofOfApprovalUrl: varchar('proof_of_approval_url'),
  rejectionReason: varchar('rejection_reason'),

  calculatedFeeSek: integer('calculated_fee_sek'),
  capApplied: boolean('cap_applied').default(false),
  minimumApplied: boolean('minimum_applied').default(false),

  stripeCustomerId: varchar('stripe_customer_id'),
  stripeInvoiceId: varchar('stripe_invoice_id'),
  stripeInvoiceUrl: varchar('stripe_invoice_url'),
  stripePaymentStatus: varchar('stripe_payment_status'),
  invoiceCreatedAt: timestamp('invoice_created_at'),
  invoicePaidAt: timestamp('invoice_paid_at'),
  invoiceDueDate: date('invoice_due_date'),

  adminNotes: text('admin_notes'),
  flaggedForReview: boolean('flagged_for_review').default(false),
  reviewedBy: varchar('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),

  reminderSentAt: timestamp('reminder_sent_at'),
  reminderCount: integer('reminder_count').default(0),

  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const successFeeSettings = pgTable('success_fee_settings', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  defaultFeePercentage: integer('default_fee_percentage').notNull().default(3),
  maxFeeCapSek: integer('max_fee_cap_sek').notNull().default(25000),
  minFeeSek: integer('min_fee_sek').notNull().default(500),
  isEnabled: boolean('is_enabled').notNull().default(true),
  eligiblePlans: varchar('eligible_plans').array().notNull().default(['free']),
  termsVersion: varchar('terms_version').notNull().default('1.0'),
  termsLastUpdated: timestamp('terms_last_updated').defaultNow(),
  invoiceDaysUntilDue: integer('invoice_days_until_due').default(30),
  autoExpireMonths: integer('auto_expire_months').default(18),
  updatedBy: varchar('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const successFeeEvents = pgTable('success_fee_events', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  agreementId: varchar('agreement_id').notNull(),
  userId: varchar('user_id').notNull(),
  eventType: varchar('event_type').notNull(),
  description: text('description').notNull(),
  metadata: jsonb('metadata').default('{}'),
  performedBy: varchar('performed_by'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const successFeeUpgradePrompts = pgTable('success_fee_upgrade_prompts', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  triggeredBy: varchar('triggered_by').notNull(),
  totalFeesPaidSek: integer('total_fees_paid_sek'),
  subscriptionCostYearlySek: integer('subscription_cost_yearly_sek'),
  promptShownAt: timestamp('prompt_shown_at').defaultNow(),
  userClickedUpgrade: boolean('user_clicked_upgrade').default(false),
  userUpgradedAt: timestamp('user_upgraded_at'),
});

// Insert schemas
export const insertSuccessFeeAgreementSchema = createInsertSchema(successFeeAgreements).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertSuccessFeeSettingsSchema = createInsertSchema(successFeeSettings).omit({
  id: true, updatedAt: true,
});
export const insertSuccessFeeEventSchema = createInsertSchema(successFeeEvents).omit({
  id: true, createdAt: true,
});
export const insertSuccessFeeUpgradePromptSchema = createInsertSchema(successFeeUpgradePrompts).omit({
  id: true, promptShownAt: true,
});

// Types
export type SuccessFeeAgreement = typeof successFeeAgreements.$inferSelect;
export type InsertSuccessFeeAgreement = z.infer<typeof insertSuccessFeeAgreementSchema>;
export type SuccessFeeSettings = typeof successFeeSettings.$inferSelect;
export type InsertSuccessFeeSettings = z.infer<typeof insertSuccessFeeSettingsSchema>;
export type SuccessFeeEvent = typeof successFeeEvents.$inferSelect;
export type InsertSuccessFeeEvent = z.infer<typeof insertSuccessFeeEventSchema>;
export type SuccessFeeUpgradePrompt = typeof successFeeUpgradePrompts.$inferSelect;
export type InsertSuccessFeeUpgradePrompt = z.infer<typeof insertSuccessFeeUpgradePromptSchema>;

// ============ WHITE-LABEL PARTNER TABLES ============

export const partners = pgTable('partners', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().unique(),
  companyName: varchar('company_name').notNull(),
  companyOrgNumber: varchar('company_org_number'),
  companyWebsite: varchar('company_website'),
  contactName: varchar('contact_name').notNull(),
  contactEmail: varchar('contact_email').notNull(),
  contactPhone: varchar('contact_phone'),
  subdomain: varchar('subdomain').notNull().unique(),
  customDomain: varchar('custom_domain').unique(),
  customDomainVerified: boolean('custom_domain_verified').default(false),
  customDomainVerifiedAt: timestamp('custom_domain_verified_at'),
  customDomainCnameTarget: varchar('custom_domain_cname_target'),
  logoUrl: varchar('logo_url'),
  faviconUrl: varchar('favicon_url'),
  primaryColor: varchar('primary_color').default('#2563EB'),
  accentColor: varchar('accent_color').default('#10B981'),
  primaryTextColor: varchar('primary_text_color').default('#FFFFFF'),
  fontFamily: varchar('font_family').default('Inter'),
  platformName: varchar('platform_name'),
  tagline: varchar('tagline'),
  supportEmail: varchar('support_email'),
  supportUrl: varchar('support_url'),
  showPoweredBy: boolean('show_powered_by').default(true),
  footerText: varchar('footer_text'),
  plan: varchar('plan').notNull().default('starter'),
  stripeCustomerId: varchar('stripe_customer_id'),
  stripeSubscriptionId: varchar('stripe_subscription_id'),
  stripeSubscriptionStatus: varchar('stripe_subscription_status'),
  trialEndsAt: timestamp('trial_ends_at'),
  maxClients: integer('max_clients').default(10),
  maxAiRequestsPerMonth: integer('max_ai_requests_per_month').default(100),
  allowClientSelfSignup: boolean('allow_client_self_signup').default(false),
  allowCustomDomain: boolean('allow_custom_domain').default(false),
  allowApiAccess: boolean('allow_api_access').default(false),
  allowCustomEmailDomain: boolean('allow_custom_email_domain').default(false),
  status: varchar('status').notNull().default('active'),
  suspendedReason: varchar('suspended_reason'),
  onboardingCompletedAt: timestamp('onboarding_completed_at'),
  cachedClientCount: integer('cached_client_count').default(0),
  cachedActiveApplications: integer('cached_active_applications').default(0),
  cachedGrantsWon: integer('cached_grants_won').default(0),
  cachedTotalGrantValueSek: integer('cached_total_grant_value_sek').default(0),
  statsCachedAt: timestamp('stats_cached_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const partnerClients = pgTable('partner_clients', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar('partner_id').notNull(),
  userId: varchar('user_id'),
  email: varchar('email').notNull(),
  name: varchar('name'),
  companyName: varchar('company_name'),
  companyOrgNumber: varchar('company_org_number'),
  phone: varchar('phone'),
  status: varchar('status').notNull().default('invited'),
  inviteToken: varchar('invite_token').unique(),
  inviteTokenExpiresAt: timestamp('invite_token_expires_at'),
  invitedAt: timestamp('invited_at').defaultNow(),
  invitedBy: varchar('invited_by').notNull(),
  joinedAt: timestamp('joined_at'),
  clientPlan: varchar('client_plan').default('pro'),
  billedBy: varchar('billed_by').default('partner'),
  internalNotes: text('internal_notes'),
  tags: varchar('tags').array(),
  lastActiveAt: timestamp('last_active_at'),
  totalApplications: integer('total_applications').default(0),
  totalGrantsWon: integer('total_grants_won').default(0),
  totalGrantValueSek: integer('total_grant_value_sek').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniquePartnerClient: unique().on(table.partnerId, table.email),
}));

export const partnerActivityLog = pgTable('partner_activity_log', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar('partner_id').notNull(),
  performedByUserId: varchar('performed_by_user_id').notNull(),
  activityType: varchar('activity_type').notNull(),
  description: text('description').notNull(),
  targetClientId: varchar('target_client_id'),
  metadata: jsonb('metadata').default('{}'),
  ipAddress: varchar('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const partnerApiKeys = pgTable('partner_api_keys', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar('partner_id').notNull(),
  name: varchar('name').notNull(),
  keyPrefix: varchar('key_prefix').notNull(),
  keyHash: varchar('key_hash').notNull(),
  scopes: varchar('scopes').array().default(['read']),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  status: varchar('status').default('active'),
  revokedAt: timestamp('revoked_at'),
  revokedReason: varchar('revoked_reason'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const partnerUsageStats = pgTable('partner_usage_stats', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar('partner_id').notNull(),
  month: varchar('month').notNull(),
  activeClients: integer('active_clients').default(0),
  newClients: integer('new_clients').default(0),
  totalLogins: integer('total_logins').default(0),
  totalApplicationsCreated: integer('total_applications_created').default(0),
  totalAiRequests: integer('total_ai_requests').default(0),
  totalGrantSearches: integer('total_grant_searches').default(0),
  grantsWonCount: integer('grants_won_count').default(0),
  grantsWonValueSek: integer('grants_won_value_sek').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniquePartnerMonth: unique().on(table.partnerId, table.month),
}));

export const partnerEmailSettings = pgTable('partner_email_settings', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar('partner_id').notNull().unique(),
  fromEmail: varchar('from_email'),
  fromName: varchar('from_name'),
  replyToEmail: varchar('reply_to_email'),
  domainVerified: boolean('domain_verified').default(false),
  resendDomainId: varchar('resend_domain_id'),
  dnsRecords: jsonb('dns_records').default('[]'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Onboarding sessions - track AI-powered onboarding wizard attempts
export const onboardingSessions = pgTable('onboarding_sessions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  companyId: varchar('company_id').references(() => companies.id),
  currentStep: integer('current_step').default(1),
  totalSteps: integer('total_steps').default(6),
  completedAt: timestamp('completed_at'),
  skippedAt: timestamp('skipped_at'),
  abandonedAt: timestamp('abandoned_at'),
  websiteUrl: varchar('website_url'),
  extractionStatus: varchar('extraction_status'),
  extractionAttempts: integer('extraction_attempts').default(0),
  lastExtractionAt: timestamp('last_extraction_at'),
  rawExtractedData: jsonb('raw_extracted_data').default('{}'),
  confidenceScores: jsonb('confidence_scores').default('{}'),
  autoFilledFields: varchar('auto_filled_fields').array().default([]),
  userEditedFields: varchar('user_edited_fields').array().default([]),
  extractionRating: integer('extraction_rating'),
  extractionFeedback: text('extraction_feedback'),
  goalsData: jsonb('goals_data').default('{}'),
  notificationPreferences: jsonb('notification_preferences').default('{}'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const websiteScrapeCache = pgTable('website_scrape_cache', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  url: varchar('url').notNull().unique(),
  normalizedUrl: varchar('normalized_url').notNull(),
  scrapedContent: text('scraped_content'),
  scrapedAt: timestamp('scraped_at').defaultNow(),
  statusCode: integer('status_code'),
  errorMessage: varchar('error_message'),
  contentLength: integer('content_length'),
  expiresAt: timestamp('expires_at'),
});

export const insertOnboardingSessionSchema = createInsertSchema(onboardingSessions).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type OnboardingSession = typeof onboardingSessions.$inferSelect;
export type InsertOnboardingSession = z.infer<typeof insertOnboardingSessionSchema>;
export type WebsiteScrapeCache = typeof websiteScrapeCache.$inferSelect;

// Partner insert schemas
export const insertPartnerSchema = createInsertSchema(partners).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertPartnerClientSchema = createInsertSchema(partnerClients).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertPartnerActivityLogSchema = createInsertSchema(partnerActivityLog).omit({
  id: true, createdAt: true,
});
export const insertPartnerApiKeySchema = createInsertSchema(partnerApiKeys).omit({
  id: true, createdAt: true,
});
export const insertPartnerUsageStatsSchema = createInsertSchema(partnerUsageStats).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertPartnerEmailSettingsSchema = createInsertSchema(partnerEmailSettings).omit({
  id: true, updatedAt: true,
});

// Partner types
export type Partner = typeof partners.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type PartnerClient = typeof partnerClients.$inferSelect;
export type InsertPartnerClient = z.infer<typeof insertPartnerClientSchema>;
export type PartnerActivityLogEntry = typeof partnerActivityLog.$inferSelect;
export type InsertPartnerActivityLog = z.infer<typeof insertPartnerActivityLogSchema>;
export type PartnerApiKey = typeof partnerApiKeys.$inferSelect;
export type InsertPartnerApiKey = z.infer<typeof insertPartnerApiKeySchema>;
export type PartnerUsageStat = typeof partnerUsageStats.$inferSelect;
export type InsertPartnerUsageStat = z.infer<typeof insertPartnerUsageStatsSchema>;
export type PartnerEmailSetting = typeof partnerEmailSettings.$inferSelect;
export type InsertPartnerEmailSetting = z.infer<typeof insertPartnerEmailSettingsSchema>;
