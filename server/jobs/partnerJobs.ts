import { db } from '../db';
import { partners, partnerClients, partnerUsageStats, partnerActivityLog, applications, companies } from '@shared/schema';
import { eq, and, lt, count, gte, inArray, sql } from 'drizzle-orm';
import { sendEmail } from '../lib/resend';
import { APP_URL as BASE_URL } from '../lib/appUrl';

export async function runNightlyStatsCache(): Promise<{ partnersUpdated: number }> {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let partnersUpdated = 0;

  const allPartners = await db.select().from(partners).where(eq(partners.status, 'active'));

  for (const partner of allPartners) {
    try {
      const clients = await db.select().from(partnerClients)
        .where(eq(partnerClients.partnerId, partner.id));

      const activeClients = clients.filter(c => c.status === 'active').length;
      const totalClients = clients.length;

      const clientUserIds = clients
        .filter(c => c.userId)
        .map(c => c.userId!);

      let totalApplications = 0;
      let totalGrantsWon = 0;
      let totalGrantValueSek = 0;

      if (clientUserIds.length > 0) {
        const clientCompanies = await db.select({ id: companies.id })
          .from(companies)
          .where(inArray(companies.userId, clientUserIds));

        const companyIds = clientCompanies.map(c => c.id);

        if (companyIds.length > 0) {
          const appStats = await db
            .select({
              total: count(),
              won: sql<number>`COUNT(CASE WHEN ${applications.status} = 'approved' THEN 1 END)`,
              wonValue: sql<number>`COALESCE(SUM(CASE WHEN ${applications.status} = 'approved' THEN CAST(${applications.approvedAmount} AS INTEGER) ELSE 0 END), 0)`,
            })
            .from(applications)
            .where(inArray(applications.companyId, companyIds));

          totalApplications = appStats[0]?.total || 0;
          totalGrantsWon = appStats[0]?.won || 0;
          totalGrantValueSek = appStats[0]?.wonValue || 0;
        }
      }

      await db.update(partners).set({
        cachedClientCount: activeClients,
        cachedActiveApplications: totalApplications,
        cachedGrantsWon: totalGrantsWon,
        cachedTotalGrantValueSek: totalGrantValueSek,
        statsCachedAt: now,
        updatedAt: now,
      }).where(eq(partners.id, partner.id));

      const existing = await db.select().from(partnerUsageStats)
        .where(and(eq(partnerUsageStats.partnerId, partner.id), eq(partnerUsageStats.month, currentMonth)));

      if (existing.length > 0) {
        await db.update(partnerUsageStats).set({
          activeClients,
          totalApplicationsCreated: totalApplications,
          grantsWonCount: totalGrantsWon,
          grantsWonValueSek: totalGrantValueSek,
          updatedAt: now,
        }).where(eq(partnerUsageStats.id, existing[0].id));
      } else {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const newClientsThisMonth = clients.filter(c =>
          c.createdAt && new Date(c.createdAt) >= monthStart
        ).length;

        await db.insert(partnerUsageStats).values({
          partnerId: partner.id,
          month: currentMonth,
          activeClients,
          newClients: newClientsThisMonth,
          totalApplicationsCreated: totalApplications,
          grantsWonCount: totalGrantsWon,
          grantsWonValueSek: totalGrantValueSek,
        });
      }

      partnersUpdated++;
    } catch (err) {
      console.error(`Failed to update stats for partner ${partner.id}:`, err);
    }
  }

  console.log(`[Partner Jobs] Nightly stats cache updated for ${partnersUpdated} partners`);
  return { partnersUpdated };
}

export async function runDailyInviteExpiration(): Promise<{ expiredCount: number }> {
  const now = new Date();

  const { isNotNull } = await import('drizzle-orm');
  const expiredResult = await db.update(partnerClients)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(partnerClients.status, 'invited'),
        isNotNull(partnerClients.inviteTokenExpiresAt),
        lt(partnerClients.inviteTokenExpiresAt, now)
      )
    )
    .returning();

  const expiredCount = expiredResult.length;
  if (expiredCount > 0) {
    console.log(`[Partner Jobs] Expired ${expiredCount} pending invites`);
  }
  return { expiredCount };
}

export async function runWeeklyPartnerDigest(): Promise<{ emailsSent: number }> {
  let emailsSent = 0;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const activePartners = await db.select().from(partners)
    .where(eq(partners.status, 'active'));

  for (const partner of activePartners) {
    try {
      const clients = await db.select().from(partnerClients)
        .where(eq(partnerClients.partnerId, partner.id));

      const newClientsThisWeek = clients.filter(c =>
        c.createdAt && new Date(c.createdAt) >= weekAgo
      ).length;

      const activeClientsThisWeek = clients.filter(c =>
        c.lastActiveAt && new Date(c.lastActiveAt) >= weekAgo
      ).length;

      const recentActivity = await db.select().from(partnerActivityLog)
        .where(and(
          eq(partnerActivityLog.partnerId, partner.id),
          gte(partnerActivityLog.createdAt, weekAgo)
        ));

      const activityCount = recentActivity.length;
      const totalClients = clients.filter(c => c.status === 'active').length;

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #f9fafb;">
  <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
    <h2 style="margin: 0 0 16px 0; color: #2563EB; font-size: 20px;">GetGrant.ai</h2>
    <h1 style="font-size: 20px; margin: 0 0 24px 0; color: #111827;">Veckosammanfattning</h1>
    <p style="font-size: 16px;">Hej ${partner.contactName},</p>
    <p>Här är din veckorapport för ${partner.companyName}:</p>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0;">
      <div style="background: #f0f9ff; border-radius: 8px; padding: 16px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #2563EB;">${totalClients}</div>
        <div style="font-size: 12px; color: #6b7280;">Aktiva kunder</div>
      </div>
      <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #059669;">${newClientsThisWeek}</div>
        <div style="font-size: 12px; color: #6b7280;">Nya denna vecka</div>
      </div>
      <div style="background: #fefce8; border-radius: 8px; padding: 16px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #ca8a04;">${activeClientsThisWeek}</div>
        <div style="font-size: 12px; color: #6b7280;">Aktiva denna vecka</div>
      </div>
      <div style="background: #faf5ff; border-radius: 8px; padding: 16px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${activityCount}</div>
        <div style="font-size: 12px; color: #6b7280;">Aktiviteter</div>
      </div>
    </div>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${BASE_URL}/partner/dashboard" style="display: inline-block; background: #2563EB; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Öppna instrumentpanelen</a>
    </div>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      GetGrant.ai | <a href="mailto:support@getgrant.ai" style="color: #6b7280;">Support</a>
    </p>
  </div>
</body>
</html>`;

      await sendEmail({
        to: partner.contactEmail,
        subject: `Veckorapport — ${partner.companyName}`,
        html,
      });

      emailsSent++;
    } catch (err) {
      console.error(`Failed to send digest to partner ${partner.id}:`, err);
    }
  }

  console.log(`[Partner Jobs] Weekly digest sent to ${emailsSent} partners`);
  return { emailsSent };
}

function scheduleDaily(hour: number, minute: number, fn: () => Promise<unknown>, label: string) {
  function scheduleNext() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    const delay = target.getTime() - now.getTime();
    setTimeout(async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`[Partner Jobs] ${label} failed:`, err);
      }
      scheduleNext();
    }, delay);
    console.log(`[Partner Jobs] ${label} scheduled for ${target.toISOString()}`);
  }
  scheduleNext();
}

function scheduleWeekly(dayOfWeek: number, hour: number, minute: number, fn: () => Promise<unknown>, label: string) {
  function scheduleNext() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    const daysUntil = (dayOfWeek - now.getDay() + 7) % 7;
    if (daysUntil === 0 && target <= now) {
      target.setDate(target.getDate() + 7);
    } else {
      target.setDate(target.getDate() + daysUntil);
    }
    const delay = target.getTime() - now.getTime();
    setTimeout(async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`[Partner Jobs] ${label} failed:`, err);
      }
      scheduleNext();
    }, delay);
    console.log(`[Partner Jobs] ${label} scheduled for ${target.toISOString()}`);
  }
  scheduleNext();
}

let initialized = false;

export function initPartnerJobs() {
  if (initialized) {
    console.log('[Partner Jobs] Already initialized, skipping...');
    return;
  }
  initialized = true;
  console.log('[Partner Jobs] Initializing scheduled jobs...');
  scheduleDaily(2, 0, runNightlyStatsCache, 'Nightly stats cache');
  scheduleDaily(9, 0, runDailyInviteExpiration, 'Daily invite expiration');
  scheduleWeekly(1, 7, 0, runWeeklyPartnerDigest, 'Weekly partner digest (Monday)');
}
