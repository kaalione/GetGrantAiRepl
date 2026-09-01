import { Router, type Request, type Response } from 'express';
import { isAuthenticated } from '../auth';
import { db } from '../db';
import { partners, partnerActivityLog, partnerClients, users, companies, searchProfiles } from '@shared/schema';
import { eq, and, desc, ilike, or, count, sql } from 'drizzle-orm';
import { invalidatePartnerCache } from '../middleware/whitelabel';
import { validateSubdomain, validateHexColor, PARTNER_PLANS, partnerWithinLimit, partnerHasFeature, type PartnerPlanKey } from '../config/partnerPlans';
import { createPartnerCheckoutSession, updatePartnerSubscription, createCustomerPortalSession, updateStripeSubscriptionPlan } from '../services/stripe';
import { listActiveProfiles, createProjectProfile, archiveProfile, projectProfileLimit } from '../services/searchProfiles';
import { z } from 'zod';
import type { PartnerContext } from '../middleware/whitelabel';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';

const router = Router();
export const whitelabelConfigRouter = Router();

const uploadDir = path.join(process.cwd(), 'uploads', 'partner-assets');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, SVG, WebP, and ICO files are allowed'));
    }
  },
});

const ALLOWED_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat'];

async function getPartnerForUser(userId: string) {
  const [partner] = await db.select().from(partners).where(eq(partners.userId, userId));
  return partner || null;
}

async function logPartnerActivity(
  partnerId: string,
  userId: string,
  type: string,
  desc: string,
  metadata?: any,
  ip?: string
) {
  await db.insert(partnerActivityLog).values({
    partnerId,
    performedByUserId: userId,
    activityType: type,
    description: desc,
    metadata: metadata || {},
    ipAddress: ip || null,
  });
}

// POST /register
router.post('/register', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const schema = z.object({
      companyName: z.string().min(2).max(200),
      companyOrgNumber: z.string().optional(),
      companyWebsite: z.string().url().optional().or(z.literal('')),
      contactName: z.string().min(2).max(100),
      contactEmail: z.string().email(),
      contactPhone: z.string().optional(),
      subdomain: z.string().min(3).max(30),
      plan: z.enum(['starter', 'professional', 'enterprise']),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { companyName, companyOrgNumber, companyWebsite, contactName, contactEmail, contactPhone, subdomain, plan } = parsed.data;

    const existing = await getPartnerForUser(userId);
    if (existing) {
      return res.status(409).json({ error: 'You are already registered as a partner' });
    }

    const subdomainCheck = validateSubdomain(subdomain);
    if (!subdomainCheck.valid) {
      return res.status(400).json({ error: subdomainCheck.reason });
    }

    const [existingSubdomain] = await db.select().from(partners).where(eq(partners.subdomain, subdomain));
    if (existingSubdomain) {
      return res.status(409).json({ error: 'This subdomain is already taken' });
    }

    const planConfig = PARTNER_PLANS[plan as keyof typeof PARTNER_PLANS];

    let stripeCustomerId: string | null = null;
    try {
      const { getUncachableStripeClient } = await import('../lib/stripeClient');
      const stripe = await getUncachableStripeClient();
      const customer = await stripe.customers.create({
        email: contactEmail,
        name: companyName,
        metadata: { userId, subdomain, plan, type: 'partner' },
      });
      stripeCustomerId = customer.id;
    } catch (stripeErr) {
      console.warn('Failed to create Stripe customer during registration (non-blocking):', stripeErr);
    }

    const [partner] = await db.insert(partners).values({
      userId,
      companyName,
      companyOrgNumber: companyOrgNumber || null,
      companyWebsite: companyWebsite || null,
      contactName,
      contactEmail,
      contactPhone: contactPhone || null,
      subdomain,
      plan,
      status: 'pending_setup',
      stripeCustomerId,
      maxClients: planConfig?.maxClients ?? 10,
      maxAiRequestsPerMonth: planConfig?.maxAiRequestsPerMonth ?? 100,
      allowClientSelfSignup: planConfig?.features?.allowClientSelfSignup ?? false,
      allowCustomDomain: planConfig?.features?.customDomain ?? false,
      allowApiAccess: planConfig?.features?.allowApiAccess ?? false,
      allowCustomEmailDomain: planConfig?.features?.allowCustomEmailDomain ?? false,
      showPoweredBy: planConfig?.features?.showPoweredByRequired ?? true,
    }).returning();

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'partner_registered',
      `Partner registered: ${companyName} (${plan} plan)`,
      { plan, subdomain },
      String(ipAddress)
    );

    res.status(201).json({
      partnerId: partner.id,
      subdomain: partner.subdomain,
      dashboardUrl: `/partner/dashboard`,
      setupUrl: `/partner/onboarding`,
      message: 'Partner account created successfully. Complete onboarding to activate.',
    });
  } catch (error) {
    console.error('Error registering partner:', error);
    res.status(500).json({ error: 'Failed to register partner' });
  }
});

// GET /subdomain-check/:subdomain (public)
router.get('/subdomain-check/:subdomain', async (req: Request, res: Response) => {
  try {
    const subdomain = req.params.subdomain as string;
    const subdomainLower = subdomain.toLowerCase();
    const validation = validateSubdomain(subdomainLower);
    if (!validation.valid) {
      return res.json({ available: false, reason: validation.reason });
    }

    const [existing] = await db.select().from(partners).where(eq(partners.subdomain, subdomainLower));
    if (existing) {
      return res.json({ available: false, reason: 'This subdomain is already taken' });
    }

    res.json({ available: true });
  } catch (error) {
    console.error('Error checking subdomain:', error);
    res.status(500).json({ error: 'Failed to check subdomain' });
  }
});

// GET /profile
router.get('/profile', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) {
      return res.status(404).json({ error: 'Partner profile not found' });
    }

    res.json(partner);
  } catch (error) {
    console.error('Error fetching partner profile:', error);
    res.status(500).json({ error: 'Failed to fetch partner profile' });
  }
});

// PUT /profile
router.put('/profile', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) {
      return res.status(404).json({ error: 'Partner profile not found' });
    }

    const schema = z.object({
      companyName: z.string().min(2).max(200).optional(),
      contactName: z.string().min(2).max(100).optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      companyWebsite: z.string().url().optional().or(z.literal('')),
      notes: z.string().max(2000).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.companyName !== undefined) updateData.companyName = parsed.data.companyName;
    if (parsed.data.contactName !== undefined) updateData.contactName = parsed.data.contactName;
    if (parsed.data.contactEmail !== undefined) updateData.contactEmail = parsed.data.contactEmail;
    if (parsed.data.contactPhone !== undefined) updateData.contactPhone = parsed.data.contactPhone;
    if (parsed.data.companyWebsite !== undefined) updateData.companyWebsite = parsed.data.companyWebsite || null;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

    const [updated] = await db.update(partners)
      .set(updateData)
      .where(eq(partners.id, partner.id))
      .returning();

    invalidatePartnerCache(partner.id);

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'profile_updated',
      'Partner profile updated',
      { updatedFields: Object.keys(parsed.data) },
      String(ipAddress)
    );

    res.json(updated);
  } catch (error) {
    console.error('Error updating partner profile:', error);
    res.status(500).json({ error: 'Failed to update partner profile' });
  }
});

// POST /complete-onboarding
router.post('/complete-onboarding', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) {
      return res.status(404).json({ error: 'Partner profile not found' });
    }

    if (partner.onboardingCompletedAt) {
      return res.status(400).json({ error: 'Onboarding already completed' });
    }

    const [updated] = await db.update(partners)
      .set({
        onboardingCompletedAt: new Date(),
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(partners.id, partner.id))
      .returning();

    invalidatePartnerCache(partner.id);

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'onboarding_completed',
      'Partner onboarding completed, status set to active',
      {},
      String(ipAddress)
    );

    res.json({ message: 'Onboarding completed successfully', status: updated.status });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// GET /branding
router.get('/branding', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) {
      return res.status(404).json({ error: 'Partner profile not found' });
    }

    res.json({
      platformName: partner.platformName,
      logoUrl: partner.logoUrl,
      faviconUrl: partner.faviconUrl,
      primaryColor: partner.primaryColor,
      accentColor: partner.accentColor,
      primaryTextColor: partner.primaryTextColor,
      fontFamily: partner.fontFamily,
      tagline: partner.tagline,
      supportEmail: partner.supportEmail,
      supportUrl: partner.supportUrl,
      showPoweredBy: partner.showPoweredBy,
      footerText: partner.footerText,
    });
  } catch (error) {
    console.error('Error fetching branding:', error);
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

// PUT /branding
router.put('/branding', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) {
      return res.status(404).json({ error: 'Partner profile not found' });
    }

    const schema = z.object({
      platformName: z.string().min(2).max(100).optional(),
      primaryColor: z.string().optional(),
      accentColor: z.string().optional(),
      primaryTextColor: z.string().optional(),
      fontFamily: z.enum(ALLOWED_FONTS as [string, ...string[]]).optional(),
      tagline: z.string().max(200).optional().nullable(),
      supportEmail: z.string().email().optional(),
      supportUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
      showPoweredBy: z.boolean().optional(),
      footerText: z.string().max(500).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const data = parsed.data;

    if (data.primaryColor && !validateHexColor(data.primaryColor)) {
      return res.status(400).json({ error: 'Invalid primaryColor. Must be a valid hex color (e.g. #2563EB)' });
    }
    if (data.accentColor && !validateHexColor(data.accentColor)) {
      return res.status(400).json({ error: 'Invalid accentColor. Must be a valid hex color (e.g. #10B981)' });
    }
    if (data.primaryTextColor && !validateHexColor(data.primaryTextColor)) {
      return res.status(400).json({ error: 'Invalid primaryTextColor. Must be a valid hex color (e.g. #FFFFFF)' });
    }

    if (partner.plan === 'starter' && data.showPoweredBy === false) {
      return res.status(403).json({
        error: 'Starter plan requires "Powered by GetGrant.ai" branding. Upgrade to Professional to remove it.',
      });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.platformName !== undefined) updateData.platformName = data.platformName;
    if (data.primaryColor !== undefined) updateData.primaryColor = data.primaryColor;
    if (data.accentColor !== undefined) updateData.accentColor = data.accentColor;
    if (data.primaryTextColor !== undefined) updateData.primaryTextColor = data.primaryTextColor;
    if (data.fontFamily !== undefined) updateData.fontFamily = data.fontFamily;
    if (data.tagline !== undefined) updateData.tagline = data.tagline;
    if (data.supportEmail !== undefined) updateData.supportEmail = data.supportEmail;
    if (data.supportUrl !== undefined) updateData.supportUrl = data.supportUrl || null;
    if (data.showPoweredBy !== undefined) updateData.showPoweredBy = data.showPoweredBy;
    if (data.footerText !== undefined) updateData.footerText = data.footerText;

    const [updated] = await db.update(partners)
      .set(updateData)
      .where(eq(partners.id, partner.id))
      .returning();

    invalidatePartnerCache(partner.id);

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'branding_updated',
      'Partner branding settings updated',
      { updatedFields: Object.keys(data) },
      String(ipAddress)
    );

    res.json({
      platformName: updated.platformName,
      logoUrl: updated.logoUrl,
      faviconUrl: updated.faviconUrl,
      primaryColor: updated.primaryColor,
      accentColor: updated.accentColor,
      primaryTextColor: updated.primaryTextColor,
      fontFamily: updated.fontFamily,
      tagline: updated.tagline,
      supportEmail: updated.supportEmail,
      supportUrl: updated.supportUrl,
      showPoweredBy: updated.showPoweredBy,
      footerText: updated.footerText,
    });
  } catch (error) {
    console.error('Error updating branding:', error);
    res.status(500).json({ error: 'Failed to update branding' });
  }
});

// GET /branding/preview
router.get('/branding/preview', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) {
      return res.status(404).json({ error: 'Partner profile not found' });
    }

    res.json({
      platformName: partner.platformName || partner.companyName,
      logoUrl: partner.logoUrl,
      faviconUrl: partner.faviconUrl,
      primaryColor: partner.primaryColor || '#2563EB',
      accentColor: partner.accentColor || '#10B981',
      primaryTextColor: partner.primaryTextColor || '#FFFFFF',
      fontFamily: partner.fontFamily || 'Inter',
      tagline: partner.tagline,
      supportEmail: partner.supportEmail || partner.contactEmail,
      supportUrl: partner.supportUrl,
      showPoweredBy: partner.showPoweredBy ?? true,
      footerText: partner.footerText,
    });
  } catch (error) {
    console.error('Error fetching branding preview:', error);
    res.status(500).json({ error: 'Failed to fetch branding preview' });
  }
});

// GET /activity - Recent partner activity log
router.get('/activity', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const activity = await db.select().from(partnerActivityLog)
      .where(eq(partnerActivityLog.partnerId, partner.id))
      .orderBy(desc(partnerActivityLog.createdAt))
      .limit(20);

    res.json({ activity });
  } catch (error) {
    console.error('Error fetching partner activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// ====== CLIENT MANAGEMENT ROUTES ======

// GET /clients - List partner's clients
router.get('/clients', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const conditions = [eq(partnerClients.partnerId, partner.id)];

    if (status) {
      conditions.push(eq(partnerClients.status, status));
    }

    if (search) {
      conditions.push(
        or(
          ilike(partnerClients.email, `%${search}%`),
          ilike(partnerClients.name, `%${search}%`),
          ilike(partnerClients.companyName, `%${search}%`)
        )!
      );
    }

    const whereClause = and(...conditions);

    const [clients, [totalResult], activeResult, invitedResult, grantValueResult] = await Promise.all([
      db.select().from(partnerClients)
        .where(whereClause)
        .orderBy(desc(partnerClients.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(partnerClients).where(whereClause),
      db.select({ count: count() }).from(partnerClients)
        .where(and(eq(partnerClients.partnerId, partner.id), eq(partnerClients.status, 'active'))),
      db.select({ count: count() }).from(partnerClients)
        .where(and(eq(partnerClients.partnerId, partner.id), eq(partnerClients.status, 'invited'))),
      db.select({ count: count() }).from(partnerClients)
        .where(eq(partnerClients.partnerId, partner.id)),
    ]);

    const allClients = await db.select().from(partnerClients)
      .where(eq(partnerClients.partnerId, partner.id));
    const totalGrantValueSek = allClients.reduce((sum, c) => sum + (c.totalGrantValueSek || 0), 0);

    const { getClientPortfolio, getPortfolioSummary } = await import('../services/partnerPortfolio');
    const [portfolio, portfolioSummary] = await Promise.all([
      getClientPortfolio(clients),
      getPortfolioSummary(userId, allClients),
    ]);

    res.json({
      clients: clients.map((client) => ({
        ...client,
        ...(portfolio.get(client.id) ?? {}),
      })),
      total: totalResult?.count || 0,
      summary: {
        totalActive: activeResult[0]?.count || 0,
        totalInvited: invitedResult[0]?.count || 0,
        totalGrantValueSek,
        ...portfolioSummary,
      },
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// POST /clients/invite - Invite a new client
router.post('/clients/invite', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const schema = z.object({
      email: z.string().email(),
      name: z.string().max(200).optional(),
      companyName: z.string().max(200).optional(),
      companyOrgNumber: z.string().max(50).optional(),
      clientPlan: z.string().optional(),
      internalNotes: z.string().max(2000).optional(),
      tags: z.array(z.string()).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const [currentCountResult] = await db.select({ count: count() }).from(partnerClients)
      .where(eq(partnerClients.partnerId, partner.id));
    const currentClientCount = currentCountResult?.count || 0;

    const limitCheck = partnerWithinLimit(partner.plan, 'clients', currentClientCount, partner.maxClients);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: 'Client limit reached',
        limit: limitCheck.limit,
        current: limitCheck.current,
        message: `Your ${partner.plan} plan allows up to ${limitCheck.limit} clients. Upgrade to add more.`,
      });
    }

    const [existingClient] = await db.select().from(partnerClients)
      .where(and(
        eq(partnerClients.partnerId, partner.id),
        eq(partnerClients.email, parsed.data.email)
      ));

    if (existingClient) {
      return res.status(409).json({ error: 'This email is already a client of your partner account' });
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [client] = await db.insert(partnerClients).values({
      partnerId: partner.id,
      email: parsed.data.email,
      name: parsed.data.name || null,
      companyName: parsed.data.companyName || null,
      companyOrgNumber: parsed.data.companyOrgNumber || null,
      clientPlan: parsed.data.clientPlan || 'pro',
      internalNotes: parsed.data.internalNotes || null,
      tags: parsed.data.tags || null,
      status: 'invited',
      inviteToken,
      inviteTokenExpiresAt,
      invitedBy: userId,
    }).returning();

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'client_invited',
      `Invited client: ${parsed.data.email}`,
      { clientId: client.id, email: parsed.data.email },
      String(ipAddress)
    );

    res.status(201).json({
      clientId: client.id,
      inviteToken,
      inviteUrl: `https://${partner.subdomain}.getgrant.ai/join/${inviteToken}`,
      expiresAt: inviteTokenExpiresAt,
    });
  } catch (error) {
    console.error('Error inviting client:', error);
    res.status(500).json({ error: 'Failed to invite client' });
  }
});

// POST /clients/invite/resend/:clientId - Resend invite
router.post('/clients/invite/resend/:clientId', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const clientId = req.params.clientId;
    const [client] = await db.select().from(partnerClients)
      .where(and(
        eq(partnerClients.id, clientId),
        eq(partnerClients.partnerId, partner.id)
      ));

    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (client.status !== 'invited') {
      return res.status(400).json({ error: 'Can only resend invites for clients with status "invited"' });
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [updated] = await db.update(partnerClients)
      .set({
        inviteToken: newToken,
        inviteTokenExpiresAt: newExpiry,
        updatedAt: new Date(),
      })
      .where(eq(partnerClients.id, clientId))
      .returning();

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'client_invite_resent',
      `Resent invite to: ${client.email}`,
      { clientId: client.id, email: client.email },
      String(ipAddress)
    );

    res.json({
      clientId: updated.id,
      inviteToken: newToken,
      inviteUrl: `https://${partner.subdomain}.getgrant.ai/join/${newToken}`,
      expiresAt: newExpiry,
    });
  } catch (error) {
    console.error('Error resending invite:', error);
    res.status(500).json({ error: 'Failed to resend invite' });
  }
});

// GET /clients/:clientId - Get single client detail
router.get('/clients/:clientId', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const [client] = await db.select().from(partnerClients)
      .where(and(
        eq(partnerClients.id, req.params.clientId),
        eq(partnerClients.partnerId, partner.id)
      ));

    if (!client) return res.status(404).json({ error: 'Client not found' });

    res.json(client);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// PUT /clients/:clientId - Update client
router.put('/clients/:clientId', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const [client] = await db.select().from(partnerClients)
      .where(and(
        eq(partnerClients.id, req.params.clientId),
        eq(partnerClients.partnerId, partner.id)
      ));

    if (!client) return res.status(404).json({ error: 'Client not found' });

    const schema = z.object({
      name: z.string().max(200).optional(),
      companyName: z.string().max(200).optional(),
      internalNotes: z.string().max(2000).optional(),
      tags: z.array(z.string()).optional(),
      status: z.enum(['invited', 'active', 'inactive', 'blocked']).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.companyName !== undefined) updateData.companyName = parsed.data.companyName;
    if (parsed.data.internalNotes !== undefined) updateData.internalNotes = parsed.data.internalNotes;
    if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

    const [updated] = await db.update(partnerClients)
      .set(updateData)
      .where(eq(partnerClients.id, client.id))
      .returning();

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'client_updated',
      `Updated client: ${client.email}`,
      { clientId: client.id, updatedFields: Object.keys(parsed.data) },
      String(ipAddress)
    );

    res.json(updated);
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /clients/:clientId - Remove client from roster
router.delete('/clients/:clientId', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const [client] = await db.select().from(partnerClients)
      .where(and(
        eq(partnerClients.id, req.params.clientId),
        eq(partnerClients.partnerId, partner.id)
      ));

    if (!client) return res.status(404).json({ error: 'Client not found' });

    await db.delete(partnerClients).where(eq(partnerClients.id, client.id));

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'client_removed',
      `Removed client: ${client.email}`,
      { clientId: client.id, email: client.email },
      String(ipAddress)
    );

    res.json({ message: 'Client removed successfully' });
  } catch (error) {
    console.error('Error removing client:', error);
    res.status(500).json({ error: 'Failed to remove client' });
  }
});

// POST /clients/:clientId/block - Block a client
router.post('/clients/:clientId/block', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const [client] = await db.select().from(partnerClients)
      .where(and(
        eq(partnerClients.id, req.params.clientId),
        eq(partnerClients.partnerId, partner.id)
      ));

    if (!client) return res.status(404).json({ error: 'Client not found' });

    const [updated] = await db.update(partnerClients)
      .set({ status: 'blocked', updatedAt: new Date() })
      .where(eq(partnerClients.id, client.id))
      .returning();

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'client_blocked',
      `Blocked client: ${client.email}`,
      { clientId: client.id, email: client.email },
      String(ipAddress)
    );

    res.json(updated);
  } catch (error) {
    console.error('Error blocking client:', error);
    res.status(500).json({ error: 'Failed to block client' });
  }
});

// ---------------------------------------------------------------------------
// Client search profiles — a consultant sets up "what are we seeking funding
// for?" on behalf of a client. The profile belongs to the CLIENT (its userId
// is the client's), so the client sees and owns it; created_by_user_id
// records that the consultant made it. Every mutation is written to the
// partner activity log.
// ---------------------------------------------------------------------------

// Resolves an active, joined client of this partner plus their company.
async function resolveClientForProfiles(partnerId: string, clientId: string) {
  const [client] = await db.select().from(partnerClients)
    .where(and(
      eq(partnerClients.id, clientId),
      eq(partnerClients.partnerId, partnerId)
    ));
  if (!client) return { ok: false as const, error: 'not_found' as const };

  // A profile needs an owning user and company, which only exist once the
  // client has accepted their invite and set up a company profile.
  if (client.status !== 'active' || !client.userId) {
    return { ok: false as const, error: 'not_joined' as const };
  }

  const [company] = await db.select({ id: companies.id }).from(companies)
    .where(eq(companies.userId, client.userId));
  if (!company) return { ok: false as const, error: 'no_company' as const };

  return { ok: true as const, client, companyId: company.id, clientUserId: client.userId };
}

function clientProfileError(res: Response, error: 'not_found' | 'not_joined' | 'no_company') {
  if (error === 'not_found') return res.status(404).json({ error: 'Client not found' });
  if (error === 'not_joined') {
    return res.status(409).json({
      error: 'Client has not accepted their invite yet',
      message: 'Klienten måste acceptera inbjudan innan du kan skapa sökprofiler.',
    });
  }
  return res.status(409).json({
    error: 'Client has no company profile yet',
    message: 'Klienten måste skapa en företagsprofil innan sökprofiler kan läggas till.',
  });
}

// GET /clients/:clientId/profiles - List a client's search profiles
router.get('/clients/:clientId/profiles', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });
    if (partner.status !== 'active') return res.status(403).json({ error: 'Partner account is not active' });

    const resolved = await resolveClientForProfiles(partner.id, req.params.clientId as string);
    if (!resolved.ok) return clientProfileError(res, resolved.error);

    const profiles = await listActiveProfiles(resolved.clientUserId, resolved.companyId);
    res.json({ clientId: resolved.client.id, clientEmail: resolved.client.email, profiles });
  } catch (error) {
    console.error('Error listing client profiles:', error);
    res.status(500).json({ error: 'Failed to list client profiles' });
  }
});

// POST /clients/:clientId/profiles - Create a project profile for a client
router.post('/clients/:clientId/profiles', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });
    if (partner.status !== 'active') return res.status(403).json({ error: 'Partner account is not active' });

    const schema = z.object({
      name: z.string().min(1).max(120),
      description: z.string().max(4000).optional().nullable(),
      goals: z.string().max(4000).optional().nullable(),
      focusAreas: z.array(z.string().max(80)).max(20).optional().nullable(),
      keywords: z.array(z.string().max(60)).max(30).optional().nullable(),
      budgetSek: z.number().int().nonnegative().max(1_000_000_000).optional().nullable(),
      timeframe: z.string().max(120).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid fields', details: parsed.error.flatten() });
    }

    const resolved = await resolveClientForProfiles(partner.id, req.params.clientId as string);
    if (!resolved.ok) return clientProfileError(res, resolved.error);

    // The CLIENT's plan governs the allowance, not the partner's.
    const clientPlan = resolved.client.clientPlan || 'pro';
    const result = await createProjectProfile(
      {
        companyId: resolved.companyId,
        userId: resolved.clientUserId,
        ...parsed.data,
        createdFrom: 'wizard',
        createdByUserId: userId,
      },
      clientPlan
    );

    if (!result.ok) {
      return res.status(403).json({
        error: 'Client profile limit reached',
        message: `Klientens plan (${clientPlan}) tillåter ${projectProfileLimit(clientPlan)} projektprofiler.`,
      });
    }

    await logPartnerActivity(
      partner.id,
      userId,
      'client_profile_created',
      `Created search profile "${result.profile.name}" for client: ${resolved.client.email}`,
      { clientId: resolved.client.id, profileId: result.profile.id, profileName: result.profile.name },
      String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    );

    res.status(201).json(result.profile);
  } catch (error) {
    console.error('Error creating client profile:', error);
    res.status(500).json({ error: 'Failed to create client profile' });
  }
});

// DELETE /clients/:clientId/profiles/:profileId - Archive a client's project profile
router.delete('/clients/:clientId/profiles/:profileId', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });
    if (partner.status !== 'active') return res.status(403).json({ error: 'Partner account is not active' });

    const resolved = await resolveClientForProfiles(partner.id, req.params.clientId as string);
    if (!resolved.ok) return clientProfileError(res, resolved.error);

    const [profile] = await db.select().from(searchProfiles)
      .where(and(
        eq(searchProfiles.id, req.params.profileId as string),
        eq(searchProfiles.userId, resolved.clientUserId)
      ));
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    if (profile.kind === 'core') {
      return res.status(400).json({ error: 'The core profile cannot be removed' });
    }

    await archiveProfile(profile.id);

    await logPartnerActivity(
      partner.id,
      userId,
      'client_profile_archived',
      `Archived search profile "${profile.name}" for client: ${resolved.client.email}`,
      { clientId: resolved.client.id, profileId: profile.id, profileName: profile.name },
      String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    );

    res.json({ archived: true });
  } catch (error) {
    console.error('Error archiving client profile:', error);
    res.status(500).json({ error: 'Failed to archive client profile' });
  }
});

// POST /clients/:clientId/impersonate - Impersonate client (Professional+ only)
router.post('/clients/:clientId/impersonate', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    if (!partnerHasFeature(partner.plan, 'allowClientImpersonation')) {
      return res.status(403).json({
        error: 'Client impersonation is not available on your plan',
        message: 'Upgrade to Professional or Enterprise to use this feature.',
      });
    }

    const reasonSchema = z.object({
      reason: z.string().min(1).max(500),
    });

    const parsed = reasonSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'A reason is required for impersonation', details: parsed.error.flatten() });
    }

    const [client] = await db.select().from(partnerClients)
      .where(and(
        eq(partnerClients.id, req.params.clientId),
        eq(partnerClients.partnerId, partner.id)
      ));

    if (!client) return res.status(404).json({ error: 'Client not found' });

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

    const impersonationSecret = process.env.SESSION_SECRET || 'default-secret';
    const impersonationToken = jwt.sign(
      {
        type: 'impersonation',
        partnerId: partner.id,
        partnerUserId: userId,
        clientId: client.id,
        clientUserId: client.userId,
        clientEmail: client.email,
        reason: parsed.data.reason,
      },
      impersonationSecret,
      { expiresIn: '30m' }
    );

    await logPartnerActivity(
      partner.id,
      userId,
      'client_impersonated',
      `Impersonated client: ${client.email} - Reason: ${parsed.data.reason}`,
      { clientId: client.id, email: client.email, reason: parsed.data.reason, tokenExpiresIn: '30m' },
      String(ipAddress)
    );

    res.json({
      token: impersonationToken,
      expiresIn: 1800,
      clientEmail: client.email,
      clientName: client.name,
      redirectUrl: '/dashboard',
      message: 'Impersonation token created (30-min expiry)',
    });
  } catch (error) {
    console.error('Error impersonating client:', error);
    res.status(500).json({ error: 'Failed to impersonate client' });
  }
});

// POST /billing/checkout - Create Stripe checkout session for partner subscription
router.post('/billing/checkout', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    const schema = z.object({
      plan: z.enum(['starter', 'professional']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid plan', details: parsed.error.flatten() });

    const { plan } = parsed.data;
    const planConfig = PARTNER_PLANS[plan];
    if (!planConfig.stripePriceId) {
      return res.status(400).json({ error: 'This plan requires contacting sales' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const session = await createPartnerCheckoutSession(
      partner.id,
      partner.contactEmail,
      plan,
      `${baseUrl}/partner/settings?billing=success`,
      `${baseUrl}/partner/settings?billing=cancelled`,
      partner.stripeCustomerId
    );

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('Error creating partner checkout:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /billing/portal - Create Stripe customer portal session
router.post('/billing/portal', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    if (!partner.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account found. Please subscribe to a plan first.' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const session = await createCustomerPortalSession(
      partner.stripeCustomerId,
      `${baseUrl}/partner/settings`
    );

    res.json({ portalUrl: session.url });
  } catch (error) {
    console.error('Error creating partner portal:', error);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

// POST /billing/upgrade - Upgrade/downgrade partner plan (requires active Stripe subscription)
router.post('/billing/upgrade', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    if (!partner.stripeSubscriptionId || !partner.stripeCustomerId) {
      return res.status(400).json({ error: 'No active subscription found. Please subscribe first via /billing/checkout.' });
    }

    if (partner.stripeSubscriptionStatus !== 'active') {
      return res.status(400).json({ error: `Subscription is ${partner.stripeSubscriptionStatus}. An active subscription is required to change plans.` });
    }

    const schema = z.object({
      plan: z.enum(['starter', 'professional']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid plan', details: parsed.error.flatten() });

    const { plan } = parsed.data;
    if (plan === partner.plan) {
      return res.status(400).json({ error: 'You are already on this plan' });
    }

    const planConfig = PARTNER_PLANS[plan];
    if (!planConfig.stripePriceId) {
      return res.status(400).json({ error: 'This plan requires contacting sales' });
    }

    await updateStripeSubscriptionPlan(
      partner.stripeSubscriptionId!,
      planConfig.stripePriceId
    );

    await updatePartnerSubscription(partner.id, {
      plan,
      maxClients: planConfig.maxClients ?? undefined,
      maxAiRequestsPerMonth: planConfig.maxAiRequestsPerMonth ?? undefined,
      allowCustomDomain: planConfig.features.customDomain,
      allowApiAccess: planConfig.features.allowApiAccess,
      allowClientSelfSignup: planConfig.features.allowClientSelfSignup,
      allowCustomEmailDomain: planConfig.features.allowCustomEmailDomain,
    });

    invalidatePartnerCache(partner.subdomain);

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    await logPartnerActivity(
      partner.id,
      userId,
      'plan_changed',
      `Plan changed from ${partner.plan} to ${plan}`,
      { oldPlan: partner.plan, newPlan: plan },
      String(ipAddress)
    );

    res.json({ success: true, plan, message: `Plan updated to ${planConfig.name}` });
  } catch (error) {
    console.error('Error upgrading partner plan:', error);
    res.status(500).json({ error: 'Failed to upgrade plan' });
  }
});

// GET /api/whitelabel/config (public, mounted separately)
whitelabelConfigRouter.get('/whitelabel/config', async (req: any, res: Response) => {
  try {
    const partnerContext: PartnerContext | undefined = req.partnerContext;

    if (!partnerContext || !partnerContext.isWhitelabel || !partnerContext.partner) {
      return res.json({
        isWhitelabel: false,
        branding: {
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
        },
        features: {
          allowSelfSignup: false,
        },
      });
    }

    const partner = partnerContext.partner;

    res.json({
      isWhitelabel: true,
      branding: partnerContext.branding,
      partnerId: partner.id,
      features: {
        allowSelfSignup: partner.allowClientSelfSignup ?? false,
        signupUrl: partner.allowClientSelfSignup
          ? `/join`
          : undefined,
      },
    });
  } catch (error) {
    console.error('Error fetching whitelabel config:', error);
    res.status(500).json({ error: 'Failed to fetch whitelabel config' });
  }
});

// GET /whitelabel/invite/:token - Validate invite token (public)
whitelabelConfigRouter.get('/whitelabel/invite/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;

    const [client] = await db.select().from(partnerClients)
      .where(sql`${partnerClients.inviteToken} = ${token}`);

    if (!client) {
      return res.json({ valid: false });
    }

    const expired = client.inviteTokenExpiresAt ? new Date(client.inviteTokenExpiresAt) < new Date() : false;

    const [partner] = await db.select().from(partners)
      .where(eq(partners.id, client.partnerId));

    res.json({
      valid: !expired,
      expired,
      partnerName: partner?.companyName || null,
      clientEmail: client.email,
      platformName: partner?.platformName || partner?.companyName || null,
      logoUrl: partner?.logoUrl || null,
      primaryColor: partner?.primaryColor || null,
    });
  } catch (error) {
    console.error('Error validating invite token:', error);
    res.status(500).json({ error: 'Failed to validate invite token' });
  }
});

// POST /whitelabel/accept-invite/:token - Accept invite (public)
whitelabelConfigRouter.post('/whitelabel/accept-invite/:token', async (req: any, res: Response) => {
  try {
    const token = req.params.token;

    const acceptSchema = z.object({
      name: z.string().min(1).max(200),
      companyName: z.string().max(200).optional(),
    });

    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Name is required', details: parsed.error.flatten() });
    }

    const [client] = await db.select().from(partnerClients)
      .where(sql`${partnerClients.inviteToken} = ${token}`);

    if (!client) {
      return res.status(404).json({ error: 'Invalid invite token' });
    }

    if (client.status !== 'invited') {
      return res.status(400).json({ error: 'This invite has already been accepted' });
    }

    const expired = client.inviteTokenExpiresAt ? new Date(client.inviteTokenExpiresAt) < new Date() : false;
    if (expired) {
      return res.status(410).json({ error: 'This invite has expired. Please ask for a new invite.' });
    }

    const updateData: Record<string, any> = {
      status: 'active',
      name: parsed.data.name,
      companyName: parsed.data.companyName || null,
      joinedAt: new Date(),
      inviteToken: null,
      inviteTokenExpiresAt: null,
      updatedAt: new Date(),
    };

    const authenticatedUserId = req.user?.claims?.sub;
    if (authenticatedUserId) {
      updateData.userId = authenticatedUserId;
    }

    const [updated] = await db.update(partnerClients)
      .set(updateData)
      .where(eq(partnerClients.id, client.id))
      .returning();

    const [partner] = await db.select().from(partners)
      .where(eq(partners.id, client.partnerId));

    if (partner) {
      await logPartnerActivity(
        partner.id,
        authenticatedUserId || 'system',
        'client_joined',
        `Client joined: ${client.email}`,
        { clientId: client.id, email: client.email, name: parsed.data.name },
        req.headers['x-forwarded-for']?.toString() || req.socket?.remoteAddress || 'unknown'
      );
    }

    res.json({
      message: 'Invite accepted successfully',
      client: updated,
    });
  } catch (error) {
    console.error('Error accepting invite:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// POST /api/whitelabel/client-signup - Self-signup for Professional+ plans (public)
whitelabelConfigRouter.post('/whitelabel/client-signup', async (req: any, res: Response) => {
  try {
    const partnerContext: PartnerContext | undefined = req.partnerContext;
    if (!partnerContext?.isWhitelabel || !partnerContext.partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    const partner = partnerContext.partner;
    if (!partner.allowClientSelfSignup) {
      return res.status(403).json({ error: 'Self-signup is not enabled for this partner' });
    }

    const signupSchema = z.object({
      email: z.string().email().max(300),
      name: z.string().min(1).max(200),
      companyName: z.string().max(200).optional(),
    });

    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
    }

    const clientCountResult = await db.select({ count: count(partnerClients.id) }).from(partnerClients)
      .where(eq(partnerClients.partnerId, partner.id));
    const currentClientCount = clientCountResult[0]?.count || 0;
    const limitCheck = partnerWithinLimit(partner.plan, 'clients', currentClientCount, partner.maxClients);
    if (!limitCheck.allowed) {
      return res.status(400).json({ error: 'Partner has reached client limit' });
    }

    const existing = await db.select().from(partnerClients)
      .where(and(eq(partnerClients.partnerId, partner.id), eq(partnerClients.email, parsed.data.email)));
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const authenticatedUserId = req.user?.claims?.sub;

    const [newClient] = await db.insert(partnerClients).values({
      partnerId: partner.id,
      email: parsed.data.email,
      name: parsed.data.name,
      companyName: parsed.data.companyName || null,
      status: 'active',
      invitedBy: authenticatedUserId || 'self-signup',
      userId: authenticatedUserId || null,
      joinedAt: new Date(),
    }).returning();

    await logPartnerActivity(
      partner.id,
      authenticatedUserId || 'system',
      'client_self_signup',
      `Client self-signed up: ${parsed.data.email}`,
      { clientId: newClient.id, email: parsed.data.email },
      req.headers['x-forwarded-for']?.toString() || req.socket?.remoteAddress || 'unknown'
    );

    res.status(201).json({ message: 'Account created', clientId: newClient.id });
  } catch (error) {
    console.error('Error in client self-signup:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /partner/branding/logo - Upload partner logo
router.post('/branding/logo', isAuthenticated, upload.single('logo'), async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const logoUrl = `/uploads/partner-assets/${req.file.filename}`;

    await db.update(partners)
      .set({ logoUrl, updatedAt: new Date() })
      .where(eq(partners.id, partner.id));

    invalidatePartnerCache(partner.subdomain);
    if (partner.customDomain) invalidatePartnerCache(partner.customDomain);

    await logPartnerActivity(partner.id, userId, 'branding_updated', 'Logo uploaded', { logoUrl },
      req.headers['x-forwarded-for']?.toString() || req.socket?.remoteAddress);

    res.json({ logoUrl });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// POST /partner/branding/favicon - Upload partner favicon
router.post('/branding/favicon', isAuthenticated, upload.single('favicon'), async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const partner = await getPartnerForUser(userId);
    if (!partner) return res.status(404).json({ error: 'Partner profile not found' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const faviconUrl = `/uploads/partner-assets/${req.file.filename}`;

    await db.update(partners)
      .set({ faviconUrl, updatedAt: new Date() })
      .where(eq(partners.id, partner.id));

    invalidatePartnerCache(partner.subdomain);
    if (partner.customDomain) invalidatePartnerCache(partner.customDomain);

    await logPartnerActivity(partner.id, userId, 'branding_updated', 'Favicon uploaded', { faviconUrl },
      req.headers['x-forwarded-for']?.toString() || req.socket?.remoteAddress);

    res.json({ faviconUrl });
  } catch (error) {
    console.error('Error uploading favicon:', error);
    res.status(500).json({ error: 'Failed to upload favicon' });
  }
});

export default router;
