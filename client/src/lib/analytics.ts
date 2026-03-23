interface EventProperties {
  [key: string]: string | number | boolean | undefined;
}

class AnalyticsService {
  private enabled = false;

  init() {
    const key = import.meta.env.VITE_POSTHOG_KEY;
    if (key && typeof window !== 'undefined') {
      this.enabled = true;
      console.log('[Analytics] Initialized');
    }
  }

  private send(eventName: string, properties?: EventProperties) {
    if (!this.enabled) return;
    try {
      if (typeof window !== 'undefined' && (window as any).__analytics) {
        (window as any).__analytics.track(eventName, properties);
      }
    } catch (e) {
    }
  }

  pageView(pageName: string) {
    this.send('page_view', { page: pageName });
  }

  identify(userId: string, traits?: Record<string, string>) {
    if (!this.enabled) return;
    try {
      if (typeof window !== 'undefined' && (window as any).__analytics) {
        (window as any).__analytics.identify(userId, traits);
      }
    } catch (e) {
    }
  }

  signupStarted(method: string) {
    this.send('signup_started', { method });
  }

  signupCompleted(userId: string) {
    this.send('signup_completed', { userId });
  }

  onboardingStarted() {
    this.send('onboarding_started');
  }

  onboardingCompleted(props?: {
    sessionId?: string;
    totalSteps?: number;
    timeToCompleteMs?: number;
    usedAiExtraction?: boolean;
    fieldsAutoFilled?: number;
    fieldsUserEdited?: number;
    extractionRating?: number;
  }) {
    this.send('onboarding_completed', props);
  }

  onboardingSkipped(sessionId: string, skippedAtStep: number) {
    this.send('onboarding_skipped', { sessionId, skippedAtStep });
  }

  extractionStarted(sessionId: string, websiteUrl: string, attemptNumber: number) {
    this.send('extraction_started', { sessionId, websiteUrl, attemptNumber });
  }

  extractionCompleted(props: { status: string; fieldsFound: number; avgConfidence: number; pagesScraped: number; durationMs: number }) {
    this.send('extraction_completed', props);
  }

  fieldEdited(fieldName: string, wasAiFilled: boolean, confidenceScore: number) {
    this.send('field_edited', { fieldName, wasAiFilled, confidenceScore });
  }

  companyProfileCreated(companyId: string, completeness: number) {
    this.send('company_profile_created', { companyId, completeness });
  }

  companyProfileUpdated(companyId: string, completeness: number) {
    this.send('company_profile_updated', { companyId, completeness });
  }

  grantViewed(grantId: string, source: string, matchScore?: number) {
    this.send('grant_viewed', { grantId, source, matchScore });
  }

  grantSearched(query: string, resultsCount: number) {
    this.send('grant_searched', { query, resultsCount });
  }

  grantFiltered(filters: Record<string, string | number | boolean | undefined>) {
    this.send('grant_filtered', filters);
  }

  aiAnalysisStarted(grantId: string) {
    this.send('ai_analysis_started', { grantId });
  }

  aiAnalysisCompleted(grantId: string, matchScore: number, tokensUsed: number) {
    this.send('ai_analysis_completed', { grantId, matchScore, tokensUsed });
  }

  applicationGenerationStarted(grantId: string) {
    this.send('application_generation_started', { grantId });
  }

  applicationGenerationCompleted(applicationId: string, grantId: string, tokensUsed: number, wordCount: number) {
    this.send('application_generation_completed', { applicationId, grantId, tokensUsed, wordCount });
  }

  applicationExported(applicationId: string, format: string) {
    this.send('application_exported', { applicationId, format });
  }

  applicationStatusUpdated(applicationId: string, fromStatus: string, toStatus: string) {
    this.send('application_status_updated', { applicationId, fromStatus, toStatus });
  }

  pricingPageViewed() {
    this.send('pricing_page_viewed');
  }

  upgradeClicked(plan: string) {
    this.send('upgrade_clicked', { plan });
  }

  checkoutStarted(plan: string, amount: number) {
    this.send('checkout_started', { plan, amount });
  }

  checkoutCompleted(plan: string, amount: number) {
    this.send('checkout_completed', { plan, amount });
  }
}

export const analytics = new AnalyticsService();
analytics.init();
