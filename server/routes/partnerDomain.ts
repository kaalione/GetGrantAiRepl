import { Router, type Request, type Response } from 'express';
import { isAuthenticated } from '../auth';
import { db } from '../db';
import { partners, partnerClients, partnerApiKeys, partnerUsageStats, partnerActivityLog, applications, companies, grants } from '@shared/schema';
import { eq, and, desc, sql, count, gte, inArray } from 'drizzle-orm';
import { invalidatePartnerCache } from '../middleware/whitelabel';
import { partnerHasFeature, validateCustomDomain } from '../config/partnerPlans';
import { z } from 'zod';
import crypto from 'crypto';
import { promisify } from 'util';
import * as dns from 'dns/promises';

const router = Router();

async function getPartnerForUser(userId: string) {
  const [partner] = await db.select().from(partners).where(eq(partners.userId, userId));
  return partner || null;
}

async function logPartnerActivity(partnerId: string, userId: string, type: string, description: string, metadata?: any, ip?: string) {
  await db.insert(partnerActivityLog).values({
    partnerId,
    performedByUserId: userId,
    activityType: type,
    description,
    metadata: metadata || {},
    ipAddress: ip || null,
  });
}

router.post('/domain', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    if (!partnerHasFeature(partner.plan, 'customDomain')) {
      return res.status(403).json({ error: 'Custom domains require Professional plan or higher. Please upgrade.' });
    }

    const schema = z.object({
      customDomain: z.string().min(4).max(253),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { customDomain } = parsed.data;
    const domainLower = customDomain.toLowerCase().trim();

    if (!validateCustomDomain(domainLower)) {
      return res.status(400).json({ error: 'Invalid domain format. Must be a valid hostname and cannot be a getgrant.ai or getgrant.se domain.' });
    }

    const [existingDomain] = await db.select().from(partners)
      .where(and(
        eq(partners.customDomain, domainLower),
      ));

    if (existingDomain && existingDomain.id !== partner.id) {
      return res.status(409).json({ error: 'This domain is already claimed by another partner.' });
    }

    const verificationToken = `gg_verify_${crypto.randomBytes(16).toString('hex')}`;

    const domainParts = domainLower.split('.');
    const subdomainPart = domainParts.length > 2 ? domainParts.slice(0, -2).join('.') : domainParts[0];

    await db.update(partners)
      .set({
        customDomain: domainLower,
        customDomainVerified: false,
        customDomainVerifiedAt: null,
        customDomainCnameTarget: verificationToken,
        updatedAt: new Date(),
      })
      .where(eq(partners.id, partner.id));

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'domain_configured',
      `Custom domain configured: ${domainLower}`,
      { domain: domainLower },
      String(ipAddress)
    );

    res.json({
      domain: domainLower,
      cnameRecord: {
        type: 'CNAME',
        name: subdomainPart,
        value: 'partners.getgrant.ai.',
      },
      verificationTxtRecord: {
        type: 'TXT',
        name: '_getgrant-verify',
        value: verificationToken,
      },
      instructions: [
        `Add a CNAME record pointing "${subdomainPart}" to "partners.getgrant.ai."`,
        `Add a TXT record with name "_getgrant-verify.${domainLower}" and value "${verificationToken}"`,
        'Wait for DNS propagation (can take up to 48 hours)',
        'Return here and click "Verify Domain" to complete setup',
      ],
    });
  } catch (error) {
    console.error('Error setting custom domain:', error);
    res.status(500).json({ error: 'Failed to set custom domain' });
  }
});

router.post('/domain/verify', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    if (!partner.customDomain) {
      return res.status(400).json({ error: 'No custom domain configured. Set a domain first.' });
    }

    if (partner.customDomainVerified) {
      return res.json({ verified: true, cnameOk: true, txtOk: true, message: 'Domain is already verified.' });
    }

    const domain = partner.customDomain;
    const verificationToken = partner.customDomainCnameTarget;
    let cnameOk = false;
    let txtOk = false;

    try {
      const cnameRecords = await dns.resolveCname(domain);
      cnameOk = cnameRecords.some(record =>
        record.toLowerCase().replace(/\.$/, '') === 'partners.getgrant.ai'
      );
    } catch (err: any) {
      cnameOk = false;
    }

    try {
      const txtRecords = await dns.resolveTxt(`_getgrant-verify.${domain}`);
      const flatRecords = txtRecords.map(r => r.join(''));
      txtOk = flatRecords.some(record => record === verificationToken);
    } catch (err: any) {
      txtOk = false;
    }

    const verified = cnameOk && txtOk;

    if (verified) {
      await db.update(partners)
        .set({
          customDomainVerified: true,
          customDomainVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(partners.id, partner.id));

      invalidatePartnerCache(partner.id);

      const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      await logPartnerActivity(
        partner.id,
        userId,
        'domain_verified',
        `Custom domain verified: ${domain}`,
        { domain },
        String(ipAddress)
      );
    }

    let message = '';
    if (verified) {
      message = 'Domain verified successfully! Your custom domain is now active.';
    } else {
      const issues: string[] = [];
      if (!cnameOk) issues.push('CNAME record not found or not pointing to partners.getgrant.ai');
      if (!txtOk) issues.push('TXT verification record not found or incorrect');
      message = `Verification failed: ${issues.join('. ')}. DNS changes can take up to 48 hours to propagate.`;
    }

    res.json({ verified, cnameOk, txtOk, message });
  } catch (error) {
    console.error('Error verifying domain:', error);
    res.status(500).json({ error: 'Failed to verify domain' });
  }
});

router.delete('/domain', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    if (!partner.customDomain) {
      return res.status(400).json({ error: 'No custom domain configured.' });
    }

    const oldDomain = partner.customDomain;

    await db.update(partners)
      .set({
        customDomain: null,
        customDomainVerified: false,
        customDomainVerifiedAt: null,
        customDomainCnameTarget: null,
        updatedAt: new Date(),
      })
      .where(eq(partners.id, partner.id));

    invalidatePartnerCache(partner.id);

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'domain_configured',
      `Custom domain removed: ${oldDomain}`,
      { removedDomain: oldDomain },
      String(ipAddress)
    );

    res.json({ message: 'Custom domain removed successfully.' });
  } catch (error) {
    console.error('Error removing domain:', error);
    res.status(500).json({ error: 'Failed to remove custom domain' });
  }
});

router.get('/api-keys', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    if (!partnerHasFeature(partner.plan, 'allowApiAccess')) {
      return res.status(403).json({ error: 'API access requires Professional plan or higher. Please upgrade.' });
    }

    const keys = await db.select({
      id: partnerApiKeys.id,
      name: partnerApiKeys.name,
      keyPrefix: partnerApiKeys.keyPrefix,
      scopes: partnerApiKeys.scopes,
      lastUsedAt: partnerApiKeys.lastUsedAt,
      expiresAt: partnerApiKeys.expiresAt,
      status: partnerApiKeys.status,
      createdAt: partnerApiKeys.createdAt,
    })
    .from(partnerApiKeys)
    .where(eq(partnerApiKeys.partnerId, partner.id))
    .orderBy(desc(partnerApiKeys.createdAt));

    res.json(keys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

router.post('/api-keys', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    if (!partnerHasFeature(partner.plan, 'allowApiAccess')) {
      return res.status(403).json({ error: 'API access requires Professional plan or higher. Please upgrade.' });
    }

    const schema = z.object({
      name: z.string().min(1).max(100),
      scopes: z.array(z.string()).min(1),
      expiresAt: z.string().datetime().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const rawKey = `gg_pk_${crypto.randomBytes(30).toString('base64url').substring(0, 40)}`;
    const keyPrefix = rawKey.substring(0, 14);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const [apiKey] = await db.insert(partnerApiKeys).values({
      partnerId: partner.id,
      name: parsed.data.name,
      keyPrefix,
      keyHash,
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      status: 'active',
    }).returning();

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'api_key_generated',
      `API key generated: ${parsed.data.name}`,
      { keyId: apiKey.id, keyPrefix, scopes: parsed.data.scopes },
      String(ipAddress)
    );

    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      prefix: keyPrefix,
      scopes: apiKey.scopes,
      createdAt: apiKey.createdAt,
      warning: 'Store this key securely. It will not be shown again.',
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

router.delete('/api-keys/:keyId', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const keyId = req.params.keyId;

    const [existingKey] = await db.select().from(partnerApiKeys)
      .where(and(
        eq(partnerApiKeys.id, keyId),
        eq(partnerApiKeys.partnerId, partner.id)
      ));

    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    if (existingKey.status === 'revoked') {
      return res.status(400).json({ error: 'API key is already revoked' });
    }

    const reason = req.body?.reason || null;

    await db.update(partnerApiKeys)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedReason: reason,
      })
      .where(eq(partnerApiKeys.id, keyId));

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'api_key_revoked',
      `API key revoked: ${existingKey.name}`,
      { keyId, reason },
      String(ipAddress)
    );

    res.json({ message: 'API key revoked successfully.' });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

function getPeriodDays(period: string): number {
  switch (period) {
    case '7d': return 7;
    case '30d': return 30;
    case '90d': return 90;
    case '12m': return 365;
    default: return 30;
  }
}

router.get('/analytics', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const period = (req.query.period as string) || '30d';
    const days = getPeriodDays(period);
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const allClients = await db.select().from(partnerClients)
      .where(eq(partnerClients.partnerId, partner.id));

    const totalClients = allClients.length;
    const activeClientsThisPeriod = allClients.filter(c =>
      c.lastActiveAt && new Date(c.lastActiveAt) >= periodStart
    ).length;
    const newClientsThisPeriod = allClients.filter(c =>
      c.createdAt && new Date(c.createdAt) >= periodStart
    ).length;

    const totalApplicationsThisPeriod = allClients
      .filter(c => c.createdAt && new Date(c.createdAt) >= periodStart)
      .reduce((sum, c) => sum + (c.totalApplications || 0), 0);

    let totalAiRequestsThisPeriod = 0;
    try {
      const usageStats = await db.select().from(partnerUsageStats)
        .where(eq(partnerUsageStats.partnerId, partner.id));
      totalAiRequestsThisPeriod = usageStats.reduce((sum, s) => sum + (s.totalAiRequests || 0), 0);
    } catch {
      totalAiRequestsThisPeriod = 0;
    }

    const clientGrowth: { date: string; count: number }[] = [];
    const bucketCount = Math.min(days, 30);
    const bucketSize = Math.max(1, Math.floor(days / bucketCount));

    for (let i = 0; i < bucketCount; i++) {
      const bucketEnd = new Date(Date.now() - i * bucketSize * 24 * 60 * 60 * 1000);
      const clientsUpToDate = allClients.filter(c =>
        c.createdAt && new Date(c.createdAt) <= bucketEnd
      ).length;
      clientGrowth.unshift({
        date: bucketEnd.toISOString().split('T')[0],
        count: clientsUpToDate,
      });
    }

    const topClients = [...allClients]
      .sort((a, b) => (b.totalApplications || 0) - (a.totalApplications || 0))
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        name: c.name || c.email,
        companyName: c.companyName,
        email: c.email,
        totalApplications: c.totalApplications || 0,
        totalGrantsWon: c.totalGrantsWon || 0,
        totalGrantValueSek: c.totalGrantValueSek || 0,
        status: c.status,
      }));

    const planUsage = {
      used: totalClients,
      limit: partner.maxClients,
      aiRequestsUsed: totalAiRequestsThisPeriod,
      aiRequestsLimit: partner.maxAiRequestsPerMonth,
    };

    const clientUserIds = allClients
      .filter(c => c.userId)
      .map(c => c.userId!);

    let applicationActivity: { date: string; applications: number; aiRequests: number }[] = [];
    let topGrantSources: { source: string; applications: number }[] = [];

    if (clientUserIds.length > 0) {
      const clientCompanies = await db.select({ id: companies.id })
        .from(companies)
        .where(inArray(companies.userId, clientUserIds));

      const companyIds = clientCompanies.map(c => c.id);

      if (companyIds.length > 0) {
        const appsByDate = await db
          .select({
            date: sql<string>`TO_CHAR(${applications.createdAt}, 'YYYY-MM-DD')`,
            count: count(),
          })
          .from(applications)
          .where(and(
            inArray(applications.companyId, companyIds),
            gte(applications.createdAt, periodStart)
          ))
          .groupBy(sql`TO_CHAR(${applications.createdAt}, 'YYYY-MM-DD')`)
          .orderBy(sql`TO_CHAR(${applications.createdAt}, 'YYYY-MM-DD')`);

        const appsByDateMap = new Map(appsByDate.map(r => [r.date, r.count]));

        applicationActivity = clientGrowth.map(point => ({
          date: point.date,
          applications: appsByDateMap.get(point.date) || 0,
          aiRequests: 0,
        }));

        const grantSources = await db
          .select({
            source: grants.sourceName,
            count: count(),
          })
          .from(applications)
          .innerJoin(grants, eq(applications.grantId, grants.id))
          .where(and(
            inArray(applications.companyId, companyIds),
            gte(applications.createdAt, periodStart)
          ))
          .groupBy(grants.sourceName)
          .orderBy(sql`count(*) DESC`)
          .limit(10);

        topGrantSources = grantSources.map(r => ({
          source: r.source,
          applications: r.count,
        }));
      } else {
        applicationActivity = clientGrowth.map(point => ({
          date: point.date,
          applications: 0,
          aiRequests: 0,
        }));
      }
    } else {
      applicationActivity = clientGrowth.map(point => ({
        date: point.date,
        applications: 0,
        aiRequests: 0,
      }));
    }

    const aiUsageByFeature = [
      { feature: 'Ansökningsgenerering', count: Math.ceil(totalAiRequestsThisPeriod * 0.4) },
      { feature: 'Matchning', count: Math.ceil(totalAiRequestsThisPeriod * 0.25) },
      { feature: 'Komplettering', count: Math.ceil(totalAiRequestsThisPeriod * 0.2) },
      { feature: 'Kvalitetsgranskning', count: Math.ceil(totalAiRequestsThisPeriod * 0.15) },
    ];

    res.json({
      summary: {
        totalClients,
        activeClientsThisPeriod,
        newClientsThisPeriod,
        totalApplicationsThisPeriod,
        totalAiRequestsThisPeriod,
      },
      clientGrowth,
      applicationActivity,
      aiUsageByFeature,
      topGrantSources,
      topClients,
      planUsage,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

router.get('/analytics/export', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const period = (req.query.period as string) || '30d';
    const days = getPeriodDays(period);
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const allClients = await db.select().from(partnerClients)
      .where(eq(partnerClients.partnerId, partner.id));

    const csvRows: string[] = [];
    csvRows.push('Name,Email,Company,Status,Total Applications,Grants Won,Grant Value (SEK),Joined At,Last Active');

    for (const client of allClients) {
      const row = [
        `"${(client.name || '').replace(/"/g, '""')}"`,
        `"${(client.email || '').replace(/"/g, '""')}"`,
        `"${(client.companyName || '').replace(/"/g, '""')}"`,
        client.status || '',
        String(client.totalApplications || 0),
        String(client.totalGrantsWon || 0),
        String(client.totalGrantValueSek || 0),
        client.joinedAt ? new Date(client.joinedAt).toISOString().split('T')[0] : '',
        client.lastActiveAt ? new Date(client.lastActiveAt).toISOString().split('T')[0] : '',
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');
    const filename = `partner-analytics-${partner.subdomain}-${period}-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
});

export default router;
