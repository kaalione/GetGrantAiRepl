export const PARTNER_PLANS = {
  starter: {
    name: 'Starter',
    priceMonthlySek: 1495,
    stripePriceId: process.env.STRIPE_PARTNER_STARTER_PRICE_ID || '',
    maxClients: 10,
    maxAiRequestsPerMonth: 100,
    features: {
      subdomain: true,
      customDomain: false,
      showPoweredByRequired: true,
      allowClientSelfSignup: false,
      allowApiAccess: false,
      allowCustomEmailDomain: false,
      allowClientImpersonation: false,
      analyticsRetentionDays: 30,
      prioritySupport: false,
    }
  },
  professional: {
    name: 'Professional',
    priceMonthlySek: 3995,
    stripePriceId: process.env.STRIPE_PARTNER_PROFESSIONAL_PRICE_ID || '',
    maxClients: 50,
    maxAiRequestsPerMonth: 500,
    features: {
      subdomain: true,
      customDomain: true,
      showPoweredByRequired: false,
      allowClientSelfSignup: true,
      allowApiAccess: true,
      allowCustomEmailDomain: true,
      allowClientImpersonation: true,
      analyticsRetentionDays: 365,
      prioritySupport: true,
    }
  },
  enterprise: {
    name: 'Enterprise',
    priceMonthlySek: null as number | null,
    stripePriceId: null as string | null,
    maxClients: null as number | null,
    maxAiRequestsPerMonth: null as number | null,
    features: {
      subdomain: true,
      customDomain: true,
      showPoweredByRequired: false,
      allowClientSelfSignup: true,
      allowApiAccess: true,
      allowCustomEmailDomain: true,
      allowClientImpersonation: true,
      analyticsRetentionDays: null as number | null,
      prioritySupport: true,
      dedicatedAccountManager: true,
      customSla: true,
      customFeatures: true,
    }
  }
} as const;

export type PartnerPlanKey = keyof typeof PARTNER_PLANS;

export function partnerHasFeature(
  plan: string,
  feature: string
): boolean {
  const planConfig = PARTNER_PLANS[plan as PartnerPlanKey];
  if (!planConfig) return false;
  return (planConfig.features as Record<string, unknown>)[feature] === true;
}

export function partnerWithinLimit(
  plan: string,
  type: 'clients' | 'aiRequests',
  currentCount: number,
  overrideLimit?: number | null
): { allowed: boolean; limit: number | null; current: number } {
  const planConfig = PARTNER_PLANS[plan as PartnerPlanKey];
  if (!planConfig) return { allowed: false, limit: 0, current: currentCount };

  let limit: number | null;
  if (overrideLimit !== undefined) {
    limit = overrideLimit;
  } else if (type === 'clients') {
    limit = planConfig.maxClients;
  } else {
    limit = planConfig.maxAiRequestsPerMonth;
  }

  return {
    allowed: limit === null || currentCount < limit,
    limit,
    current: currentCount
  };
}

export const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'smtp', 'ftp',
  'getgrant', 'support', 'help', 'blog', 'dev', 'staging',
  'partner', 'partners', 'static', 'cdn', 'assets',
  'auth', 'login', 'signup', 'dashboard', 'test'
]);

export function validateSubdomain(subdomain: string): { valid: boolean; reason?: string } {
  if (subdomain.length < 3 || subdomain.length > 30)
    return { valid: false, reason: 'Subdomänen måste vara 3–30 tecken' };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(subdomain) && subdomain.length >= 3)
    return { valid: false, reason: 'Endast gemener, siffror och bindestreck (kan inte börja/sluta med bindestreck)' };
  if (!/^[a-z0-9-]+$/.test(subdomain))
    return { valid: false, reason: 'Endast gemener, siffror och bindestreck' };
  if (RESERVED_SUBDOMAINS.has(subdomain))
    return { valid: false, reason: 'Denna subdomän är reserverad' };
  return { valid: true };
}

export function validateHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

export function validateCustomDomain(domain: string): boolean {
  const hostnameRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
  return hostnameRegex.test(domain) &&
    !domain.endsWith('getgrant.ai') &&
    !domain.endsWith('getgrant.se');
}
