import { Router, type Request, type Response } from 'express';
import { isAuthenticated } from '../replit_integrations/auth';
import { db } from '../db';
import { partners, partnerClients, partnerActivityLog, partnerUsageStats, partnerApiKeys } from '@shared/schema';
import { eq, and, desc, sql, count, lt, ilike, or } from 'drizzle-orm';
import { users } from '@shared/schema';
import { z } from 'zod';

const router = Router();

async function isAdmin(req: any): Promise<boolean> {
  const userId = req.user?.claims?.sub;
  if (!userId) return false;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user?.plan === 'enterprise' || user?.email === 'admin@getgrant.ai';
}

router.get('/admin/partners/stats', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const allPartners = await db.select().from(partners);
    const allClients = await db.select().from(partnerClients);

    const byPlan: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let activePartners = 0;

    for (const p of allPartners) {
      byPlan[p.plan] = (byPlan[p.plan] || 0) + 1;
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      if (p.status === 'active') activePartners++;
    }

    res.json({
      totalPartners: allPartners.length,
      activePartners,
      totalClients: allClients.length,
      byPlan,
      byStatus,
    });
  } catch (error) {
    console.error('Error fetching partner admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/admin/partners', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const status = req.query.status as string | undefined;
    const plan = req.query.plan as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const conditions: any[] = [];
    if (status) conditions.push(eq(partners.status, status));
    if (plan) conditions.push(eq(partners.plan, plan));
    if (search) {
      conditions.push(
        or(
          ilike(partners.companyName, `%${search}%`),
          ilike(partners.contactEmail, `%${search}%`),
          ilike(partners.subdomain, `%${search}%`)
        )
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const partnersList = await db.select().from(partners)
      .where(where)
      .orderBy(desc(partners.createdAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db.select({ total: count() }).from(partners).where(where);
    const total = totalResult[0]?.total || 0;

    const clientCounts = await db.select({
      partnerId: partnerClients.partnerId,
      count: count(),
    }).from(partnerClients).groupBy(partnerClients.partnerId);

    const clientCountMap = new Map(clientCounts.map(c => [c.partnerId, c.count]));

    const enriched = partnersList.map(p => ({
      ...p,
      clientCount: clientCountMap.get(p.id) || 0,
    }));

    res.json({ partners: enriched, total });
  } catch (error) {
    console.error('Error listing partners:', error);
    res.status(500).json({ error: 'Failed to list partners' });
  }
});

router.get('/admin/partners/:partnerId', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const { partnerId } = req.params;
    const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId));
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const recentActivity = await db.select().from(partnerActivityLog)
      .where(eq(partnerActivityLog.partnerId, partnerId))
      .orderBy(desc(partnerActivityLog.createdAt))
      .limit(20);

    const clientCountResult = await db.select({ count: count() }).from(partnerClients)
      .where(eq(partnerClients.partnerId, partnerId));

    const apiKeyCountResult = await db.select({ count: count() }).from(partnerApiKeys)
      .where(eq(partnerApiKeys.partnerId, partnerId));

    res.json({
      partner,
      recentActivity,
      clientCount: clientCountResult[0]?.count || 0,
      apiKeyCount: apiKeyCountResult[0]?.count || 0,
    });
  } catch (error) {
    console.error('Error fetching partner detail:', error);
    res.status(500).json({ error: 'Failed to fetch partner detail' });
  }
});

router.post('/admin/partners/:partnerId/suspend', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const { partnerId } = req.params;
    const { reason } = req.body || {};

    const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId));
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    await db.update(partners)
      .set({ status: 'suspended', suspendedReason: reason || null, updatedAt: new Date() })
      .where(eq(partners.id, partnerId));

    const adminUserId = req.user?.claims?.sub || 'system';
    await db.insert(partnerActivityLog).values({
      partnerId,
      performedByUserId: adminUserId,
      activityType: 'partner_suspended',
      description: `Partner suspended${reason ? ': ' + reason : ''}`,
      metadata: { reason },
    });

    res.json({ message: 'Partner suspended', partnerId });
  } catch (error) {
    console.error('Error suspending partner:', error);
    res.status(500).json({ error: 'Failed to suspend partner' });
  }
});

router.post('/admin/partners/:partnerId/reinstate', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const { partnerId } = req.params;

    const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId));
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    await db.update(partners)
      .set({ status: 'active', suspendedReason: null, updatedAt: new Date() })
      .where(eq(partners.id, partnerId));

    const adminUserId = req.user?.claims?.sub || 'system';
    await db.insert(partnerActivityLog).values({
      partnerId,
      performedByUserId: adminUserId,
      activityType: 'partner_reinstated',
      description: 'Partner reinstated',
    });

    res.json({ message: 'Partner reinstated', partnerId });
  } catch (error) {
    console.error('Error reinstating partner:', error);
    res.status(500).json({ error: 'Failed to reinstate partner' });
  }
});

router.put('/admin/partners/:partnerId', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const { partnerId } = req.params;
    const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId));
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const updateSchema = z.object({
      plan: z.enum(['starter', 'professional', 'enterprise']).optional(),
      maxClients: z.number().min(1).optional(),
      maxAiRequestsPerMonth: z.number().min(0).optional(),
      allowCustomDomain: z.boolean().optional(),
      allowApiAccess: z.boolean().optional(),
      allowClientSelfSignup: z.boolean().optional(),
      allowCustomEmailDomain: z.boolean().optional(),
      notes: z.string().optional(),
      status: z.enum(['active', 'suspended', 'pending']).optional(),
      suspendedReason: z.string().optional(),
    });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
    }

    const updates: Record<string, any> = { ...parsed.data, updatedAt: new Date() };

    await db.update(partners)
      .set(updates)
      .where(eq(partners.id, partnerId));

    const adminUserId = req.user?.claims?.sub || 'system';
    await db.insert(partnerActivityLog).values({
      partnerId,
      performedByUserId: adminUserId,
      activityType: 'admin_updated_partner',
      description: `Admin updated partner: ${Object.keys(parsed.data).join(', ')}`,
      metadata: parsed.data,
    });

    const [updated] = await db.select().from(partners).where(eq(partners.id, partnerId));
    res.json({ partner: updated });
  } catch (error) {
    console.error('Error updating partner:', error);
    res.status(500).json({ error: 'Failed to update partner' });
  }
});

router.post('/cron/partner-maintenance', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const apiKey = body.apiKey;

    const cronKey = process.env.CRON_API_KEY;
    if (!cronKey) {
      return res.status(503).json({ error: 'Cron API not configured. Set CRON_API_KEY environment variable.' });
    }
    if (apiKey !== cronKey) {
      return res.status(401).json({ error: 'Invalid or missing API key' });
    }

    const now = new Date();

    const expiredResult = await db.update(partnerClients)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(
        and(
          eq(partnerClients.status, 'invited'),
          lt(partnerClients.inviteTokenExpiresAt, now)
        )
      )
      .returning();

    const expiredInvites = expiredResult.length;

    const allPartners = await db.select({ id: partners.id }).from(partners);
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let statsUpdated = 0;

    for (const p of allPartners) {
      const activeClientsResult = await db.select({ count: count() }).from(partnerClients)
        .where(and(eq(partnerClients.partnerId, p.id), eq(partnerClients.status, 'active')));
      const activeClients = activeClientsResult[0]?.count || 0;

      const existing = await db.select().from(partnerUsageStats)
        .where(and(eq(partnerUsageStats.partnerId, p.id), eq(partnerUsageStats.month, currentMonth)));

      if (existing.length > 0) {
        await db.update(partnerUsageStats)
          .set({ activeClients, updatedAt: new Date() })
          .where(eq(partnerUsageStats.id, existing[0].id));
      } else {
        await db.insert(partnerUsageStats).values({
          partnerId: p.id,
          month: currentMonth,
          activeClients,
        });
      }

      await db.update(partners)
        .set({ cachedClientCount: activeClients, statsCachedAt: new Date() })
        .where(eq(partners.id, p.id));

      statsUpdated++;
    }

    res.json({ expiredInvites, statsUpdated });
  } catch (error) {
    console.error('Error in partner maintenance cron:', error);
    res.status(500).json({ error: 'Partner maintenance failed' });
  }
});

export default router;
