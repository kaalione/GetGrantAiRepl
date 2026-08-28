import type { Grant, GrantAlert, Company } from '@shared/schema';
import { searchProfiles } from '@shared/schema';
import { calculateMatchScore, type RelevanceProfile } from "@shared/matching";
import { storage } from '../storage';
import { db } from '../db';
import { eq } from 'drizzle-orm';

export function grantMatchesAlert(grant: Grant, alert: GrantAlert): boolean {
  const keywords = alert.keywords as string[] | null;
  if (keywords && keywords.length > 0) {
    const grantText = `${grant.title} ${grant.description || ''}`.toLowerCase();
    const hasKeyword = keywords.some((keyword: string) =>
      grantText.includes(keyword.toLowerCase())
    );
    if (!hasKeyword) return false;
  }

  const sources = alert.sources as string[] | null;
  if (sources && sources.length > 0) {
    if (!sources.includes(grant.sourceName)) {
      return false;
    }
  }

  if (alert.minAmount && grant.amountMax) {
    const maxVal = parseFloat(grant.amountMax);
    const minFilter = parseFloat(alert.minAmount);
    if (!isNaN(maxVal) && !isNaN(minFilter) && maxVal < minFilter) {
      return false;
    }
  }

  if (alert.maxAmount && grant.amountMin) {
    const minVal = parseFloat(grant.amountMin);
    const maxFilter = parseFloat(alert.maxAmount);
    if (!isNaN(minVal) && !isNaN(maxFilter) && minVal > maxFilter) {
      return false;
    }
  }

  return true;
}

export function computeMatchScore(
  company: Company | null,
  grant: Grant,
  profile?: RelevanceProfile | null
): number {
  if (company) {
    const match = calculateMatchScore(company, grant, profile);
    return match.score;
  }
  return 50;
}

// Loads the search profile an alert watches, if any. Alerts without a
// profile watch the core business (pre-profiles behavior).
export async function getAlertProfile(alert: GrantAlert): Promise<RelevanceProfile | null> {
  if (!alert.profileId) return null;
  try {
    const [profile] = await db
      .select()
      .from(searchProfiles)
      .where(eq(searchProfiles.id, alert.profileId));
    return profile ?? null;
  } catch {
    return null;
  }
}

export async function getAlertNotificationEmail(alert: GrantAlert): Promise<string | null> {
  if (alert.companyId) {
    const company = await storage.getCompany(alert.companyId);
    if (company?.notificationEmail) {
      return company.notificationEmail;
    }
  }

  const companies = await storage.getCompaniesByUserId(alert.userId);
  for (const company of companies) {
    if (company.notificationEmail) {
      return company.notificationEmail;
    }
  }

  return null;
}
