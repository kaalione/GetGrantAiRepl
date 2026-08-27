import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { partners } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Partner } from '@shared/schema';

const partnerCache = new Map<string, { partner: Partner | null; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface PartnerContext {
  isWhitelabel: boolean;
  partner: Partner | null;
  branding: BrandingConfig;
}

export interface BrandingConfig {
  platformName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  primaryTextColor: string;
  fontFamily: string;
  tagline: string | null;
  supportEmail: string;
  supportUrl: string | null;
  showPoweredBy: boolean;
  footerText: string | null;
}

const DEFAULT_BRANDING: BrandingConfig = {
  platformName: 'GetGrant.ai',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#2563EB',
  accentColor: '#10B981',
  primaryTextColor: '#FFFFFF',
  fontFamily: 'Inter',
  tagline: null,
  supportEmail: 'support@getgrant.ai',
  supportUrl: null,
  showPoweredBy: false,
  footerText: null,
};

export { DEFAULT_BRANDING };

export async function whitelabelMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const host = req.hostname;
  const getgrantDomain = process.env.BASE_DOMAIN || 'getgrant.ai';

  const isSubdomain = host.endsWith(`.${getgrantDomain}`) &&
    host !== getgrantDomain &&
    host !== `www.${getgrantDomain}`;

  let lookupKey: string | null = null;
  let lookupType: 'subdomain' | 'customDomain' | null = null;

  if (isSubdomain) {
    lookupKey = host.replace(`.${getgrantDomain}`, '');
    lookupType = 'subdomain';
  } else if (
    host !== getgrantDomain &&
    host !== `www.${getgrantDomain}` &&
    !host.includes('localhost') &&
    host !== '127.0.0.1'
  ) {
    lookupKey = host;
    lookupType = 'customDomain';
  }

  const partnerHeader = req.headers['x-partner-subdomain'] as string | undefined;
  if (!lookupKey && partnerHeader) {
    lookupKey = partnerHeader;
    lookupType = 'subdomain';
  }

  if (!lookupKey || !lookupType) {
    (req as any).partnerContext = {
      isWhitelabel: false,
      partner: null,
      branding: DEFAULT_BRANDING
    };
    return next();
  }

  const cacheKey = `${lookupType}:${lookupKey}`;
  const cached = partnerCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    (req as any).partnerContext = buildContext(cached.partner);
    return next();
  }

  try {
    let partner: Partner | undefined;
    if (lookupType === 'subdomain') {
      [partner] = await db.select().from(partners)
        .where(and(
          eq(partners.subdomain, lookupKey),
          eq(partners.status, 'active')
        ));
    } else {
      [partner] = await db.select().from(partners)
        .where(and(
          eq(partners.customDomain, lookupKey),
          eq(partners.customDomainVerified, true),
          eq(partners.status, 'active')
        ));
    }

    partnerCache.set(cacheKey, { partner: partner || null, cachedAt: Date.now() });
    (req as any).partnerContext = buildContext(partner || null);
    next();
  } catch (error) {
    console.error('Whitelabel middleware error:', error);
    (req as any).partnerContext = { isWhitelabel: false, partner: null, branding: DEFAULT_BRANDING };
    next();
  }
}

function buildContext(partner: Partner | null): PartnerContext {
  if (!partner) {
    return { isWhitelabel: false, partner: null, branding: DEFAULT_BRANDING };
  }

  return {
    isWhitelabel: true,
    partner,
    branding: {
      platformName: partner.platformName || partner.companyName,
      logoUrl: partner.logoUrl,
      faviconUrl: partner.faviconUrl,
      primaryColor: partner.primaryColor || DEFAULT_BRANDING.primaryColor,
      accentColor: partner.accentColor || DEFAULT_BRANDING.accentColor,
      primaryTextColor: partner.primaryTextColor || DEFAULT_BRANDING.primaryTextColor,
      fontFamily: partner.fontFamily || DEFAULT_BRANDING.fontFamily,
      tagline: partner.tagline,
      supportEmail: partner.supportEmail || partner.contactEmail,
      supportUrl: partner.supportUrl,
      showPoweredBy: partner.showPoweredBy ?? true,
      footerText: partner.footerText,
    }
  };
}

export function invalidatePartnerCache(partnerId?: string): void {
  if (!partnerId) {
    partnerCache.clear();
    return;
  }
  const keys = Array.from(partnerCache.keys());
  for (const key of keys) {
    const value = partnerCache.get(key);
    if (value?.partner?.id === partnerId) {
      partnerCache.delete(key);
    }
  }
}
