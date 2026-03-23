import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import { successFeeAgreements, successFeeSettings, successFeeEvents, successFeeUpgradePrompts, applications, grants, companies } from '@shared/schema';
import { users } from '@shared/schema';
import { eq, and, desc, sql, count, ilike, or } from 'drizzle-orm';
import { isAuthenticated } from '../replit_integrations/auth';
import { getUserPlan } from '../middleware/plan-check';
import { calculateSuccessFee, createFeeInvoice, voidFeeInvoice, calculateUpgradeComparison, logFeeEvent, getOrCreateSettings } from '../services/successFee';
import type { FeeCalculation } from '../services/successFee';
import { z } from 'zod';
import { sendOutcomeWonEmail, sendOutcomeRejectedEmail, sendPaymentReminderEmail } from '../lib/successFeeEmails';

async function verifyApplicationOwnership(applicationId: string, userId: string) {
  const [application] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (!application) return { allowed: false, application: null, error: 'Application not found' };
  if (!application.companyId) return { allowed: false, application: null, error: 'Application has no company' };
  const [company] = await db.select().from(companies).where(eq(companies.id, application.companyId));
  if (!company || company.userId !== userId) return { allowed: false, application: null, error: 'Access denied' };
  return { allowed: true, application, company };
}

const router = Router();

// GET /api/success-fee/terms — Public, returns current fee terms
router.get('/terms', async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    const examples = [
      { grantAmountSek: 50000, ...calculateSuccessFee(50000, settings.defaultFeePercentage, settings.maxFeeCapSek, settings.minFeeSek) },
      { grantAmountSek: 100000, ...calculateSuccessFee(100000, settings.defaultFeePercentage, settings.maxFeeCapSek, settings.minFeeSek) },
      { grantAmountSek: 500000, ...calculateSuccessFee(500000, settings.defaultFeePercentage, settings.maxFeeCapSek, settings.minFeeSek) },
      { grantAmountSek: 1000000, ...calculateSuccessFee(1000000, settings.defaultFeePercentage, settings.maxFeeCapSek, settings.minFeeSek) },
      { grantAmountSek: 10000, ...calculateSuccessFee(10000, settings.defaultFeePercentage, settings.maxFeeCapSek, settings.minFeeSek) },
    ];

    res.json({
      feePercentage: settings.defaultFeePercentage,
      maxFeeCapSek: settings.maxFeeCapSek,
      minFeeSek: settings.minFeeSek,
      isEnabled: settings.isEnabled,
      termsVersion: settings.termsVersion,
      invoiceDaysUntilDue: settings.invoiceDaysUntilDue,
      exampleCalculations: examples.map(e => ({
        grantAmountSek: e.grantAmountSek,
        feeSek: e.finalFeeSek,
        capApplied: e.capApplied,
        minimumApplied: e.minimumApplied
      })),
      termsUrl: '/terms/success-fee'
    });
  } catch (error) {
    console.error('Error fetching success fee terms:', error);
    res.status(500).json({ error: 'Failed to fetch fee terms' });
  }
});

// GET /api/success-fee/eligibility — Check if current user is eligible
router.get('/eligibility', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const settings = await getOrCreateSettings();
    const userPlan = await getUserPlan(userId);

    if (!settings.isEnabled) {
      return res.json({ eligible: false, reason: 'Success fee is currently not available', currentPlan: userPlan });
    }

    const eligible = settings.eligiblePlans?.includes(userPlan) ?? false;
    const reason = eligible ? undefined : `${userPlan.charAt(0).toUpperCase() + userPlan.slice(1)}-plan users don't need success fee — unlimited applications included`;

    res.json({ eligible, reason, currentPlan: userPlan });
  } catch (error) {
    console.error('Error checking eligibility:', error);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// POST /api/success-fee/agreements — Create a new agreement
router.post('/agreements', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const schema = z.object({ applicationId: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });

    const { applicationId } = parsed.data;

    const settings = await getOrCreateSettings();
    if (!settings.isEnabled) return res.status(400).json({ error: 'Success fee is currently not available' });

    const userPlan = await getUserPlan(userId);
    if (!settings.eligiblePlans?.includes(userPlan)) {
      return res.status(403).json({ error: 'Your plan is not eligible for success fee' });
    }

    const ownership = await verifyApplicationOwnership(applicationId, userId);
    if (!ownership.allowed || !ownership.application) {
      return res.status(ownership.application ? 403 : 404).json({ error: ownership.error });
    }
    const application = ownership.application;

    const [existing] = await db.select().from(successFeeAgreements).where(
      and(
        eq(successFeeAgreements.applicationId, applicationId),
        eq(successFeeAgreements.userId, userId),
        sql`${successFeeAgreements.status} NOT IN ('cancelled', 'expired', 'rejected')`
      )
    );
    if (existing) return res.status(409).json({ error: 'An active agreement already exists for this application', existingAgreementId: existing.id });

    const [grant] = application.grantId
      ? await db.select().from(grants).where(eq(grants.id, application.grantId))
      : [null];

    const [agreement] = await db.insert(successFeeAgreements).values({
      userId,
      applicationId,
      grantId: application.grantId || applicationId,
      grantTitle: grant?.title || application.grantId || 'Unknown grant',
      funder: grant?.sourceName || 'Unknown',
      feePercentage: settings.defaultFeePercentage,
      maxFeeCapSek: settings.maxFeeCapSek,
      minFeeSek: settings.minFeeSek,
      termsVersion: settings.termsVersion,
      status: 'pending',
    }).returning();

    await logFeeEvent(agreement.id, userId, 'agreement_created',
      `Success fee agreement created for "${agreement.grantTitle}"`,
      { applicationId, feePercentage: settings.defaultFeePercentage },
      userId
    );

    res.status(201).json({
      agreementId: agreement.id,
      status: 'pending',
      grantTitle: agreement.grantTitle,
      feePercentage: agreement.feePercentage,
      maxFeeCapSek: agreement.maxFeeCapSek,
      minFeeSek: agreement.minFeeSek,
      termsVersion: agreement.termsVersion,
      message: 'Agreement created. Call /agree to confirm.'
    });
  } catch (error) {
    console.error('Error creating agreement:', error);
    res.status(500).json({ error: 'Failed to create agreement' });
  }
});

// PUT /api/success-fee/agreements/:id/agree — User formally agrees
router.put('/agreements/:id/agree', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const schema = z.object({ termsVersion: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'termsVersion required' });

    const [agreement] = await db.select().from(successFeeAgreements).where(
      and(eq(successFeeAgreements.id, id), eq(successFeeAgreements.userId, userId))
    );
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    if (agreement.status !== 'pending') return res.status(400).json({ error: `Cannot agree — current status is "${agreement.status}"` });

    const settings = await getOrCreateSettings();
    if (parsed.data.termsVersion !== settings.termsVersion) {
      return res.status(400).json({ error: 'Terms version mismatch. Please review the latest terms.' });
    }

    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

    const [updated] = await db.update(successFeeAgreements)
      .set({ status: 'active', agreedAt: new Date(), ipAddressAtAgreement: String(ipAddress), updatedAt: new Date() })
      .where(eq(successFeeAgreements.id, id))
      .returning();

    await logFeeEvent(id, userId, 'user_agreed',
      `User agreed to success fee terms v${parsed.data.termsVersion}`,
      { termsVersion: parsed.data.termsVersion, ipAddress: String(ipAddress) },
      userId
    );

    res.json({
      agreementId: updated.id,
      status: 'active',
      agreedAt: updated.agreedAt,
      message: 'Agreement active. You will be invoiced only if this grant is approved.'
    });
  } catch (error) {
    console.error('Error agreeing to terms:', error);
    res.status(500).json({ error: 'Failed to agree' });
  }
});

// POST /api/success-fee/agreements/:id/report-outcome — Report win/rejection
router.post('/agreements/:id/report-outcome', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const schema = z.object({
      outcome: z.enum(['won', 'rejected']),
      approvedAmountSek: z.number().positive().optional(),
      grantAgreementRef: z.string().optional(),
      proofOfApprovalUrl: z.string().optional(),
      rejectionReason: z.string().optional(),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });

    const [agreement] = await db.select().from(successFeeAgreements).where(
      and(eq(successFeeAgreements.id, id), eq(successFeeAgreements.userId, userId))
    );
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    if (agreement.status !== 'active') return res.status(400).json({ error: `Cannot report outcome — current status is "${agreement.status}"` });

    const { outcome } = parsed.data;

    if (outcome === 'rejected') {
      await db.update(successFeeAgreements).set({
        status: 'rejected',
        outcomeReportedAt: new Date(),
        rejectionReason: parsed.data.rejectionReason,
        notes: parsed.data.notes,
        updatedAt: new Date(),
      }).where(eq(successFeeAgreements.id, id));

      await logFeeEvent(id, userId, 'outcome_reported_rejected',
        `User reported grant rejection${parsed.data.rejectionReason ? ': ' + parsed.data.rejectionReason : ''}`,
        { rejectionReason: parsed.data.rejectionReason },
        userId
      );

      try {
        const [rejUser] = await db.select().from(users).where(eq(users.id, userId));
        if (rejUser?.email) {
          await sendOutcomeRejectedEmail(rejUser.email, agreement);
        }
      } catch (emailErr) {
        console.error('Failed to send rejection email:', emailErr);
      }

      return res.json({ status: 'rejected', message: 'No fee charged. Better luck next time!' });
    }

    if (!parsed.data.approvedAmountSek) {
      return res.status(400).json({ error: 'approvedAmountSek is required when outcome is "won"' });
    }

    const feeCalc = calculateSuccessFee(
      parsed.data.approvedAmountSek,
      agreement.feePercentage,
      agreement.maxFeeCapSek,
      agreement.minFeeSek
    );

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    const settings = await getOrCreateSettings();

    let invoiceResult;
    try {
      invoiceResult = await createFeeInvoice(
        agreement,
        feeCalc,
        { email: user.email || '', name: `${user.firstName || ''} ${user.lastName || ''}`.trim(), stripeCustomerId: user.stripeCustomerId },
        settings
      );
    } catch (stripeError: any) {
      console.error('Stripe invoice creation failed:', stripeError);
      await db.update(successFeeAgreements).set({
        status: 'grant_won',
        outcomeReportedAt: new Date(),
        approvedAmountSek: parsed.data.approvedAmountSek,
        grantAgreementRef: parsed.data.grantAgreementRef,
        proofOfApprovalUrl: parsed.data.proofOfApprovalUrl,
        calculatedFeeSek: feeCalc.finalFeeSek,
        capApplied: feeCalc.capApplied,
        minimumApplied: feeCalc.minimumApplied,
        notes: parsed.data.notes,
        updatedAt: new Date(),
      }).where(eq(successFeeAgreements.id, id));

      await logFeeEvent(id, userId, 'outcome_reported_won',
        `Grant won! Approved: ${feeCalc.approvedAmountSek.toLocaleString('sv-SE')} SEK, Fee: ${feeCalc.finalFeeSek.toLocaleString('sv-SE')} SEK. Invoice creation failed.`,
        { feeCalc, stripeError: stripeError.message },
        userId
      );

      return res.json({
        status: 'grant_won',
        feeCalculation: feeCalc,
        message: 'Grant win recorded. Invoice will be sent shortly.',
        invoiceError: true
      });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (settings.invoiceDaysUntilDue || 30));

    await db.update(successFeeAgreements).set({
      status: 'fee_invoiced',
      outcomeReportedAt: new Date(),
      approvedAmountSek: parsed.data.approvedAmountSek,
      grantAgreementRef: parsed.data.grantAgreementRef,
      proofOfApprovalUrl: parsed.data.proofOfApprovalUrl,
      calculatedFeeSek: feeCalc.finalFeeSek,
      capApplied: feeCalc.capApplied,
      minimumApplied: feeCalc.minimumApplied,
      stripeCustomerId: invoiceResult.customerId,
      stripeInvoiceId: invoiceResult.invoiceId,
      stripeInvoiceUrl: invoiceResult.hostedUrl,
      stripePaymentStatus: 'open',
      invoiceCreatedAt: new Date(),
      invoiceDueDate: dueDate.toISOString().split('T')[0],
      notes: parsed.data.notes,
      updatedAt: new Date(),
    }).where(eq(successFeeAgreements.id, id));

    await logFeeEvent(id, userId, 'outcome_reported_won',
      `Grant won! Approved: ${feeCalc.approvedAmountSek.toLocaleString('sv-SE')} SEK, Fee: ${feeCalc.finalFeeSek.toLocaleString('sv-SE')} SEK`,
      { feeCalc },
      userId
    );
    await logFeeEvent(id, userId, 'invoice_created',
      `Stripe invoice created: ${invoiceResult.invoiceId}`,
      { invoiceId: invoiceResult.invoiceId, amount: feeCalc.finalFeeSek },
      'system'
    );

    const totalPaid = await db.select({ total: sql<number>`COALESCE(SUM(${successFeeAgreements.calculatedFeeSek}), 0)` })
      .from(successFeeAgreements)
      .where(and(eq(successFeeAgreements.userId, userId), eq(successFeeAgreements.status, 'fee_paid')));

    const totalFeesPaid = (totalPaid[0]?.total || 0) + feeCalc.finalFeeSek;
    const upgradeComparison = calculateUpgradeComparison(totalFeesPaid);

    if (upgradeComparison.shouldShowUpgradePrompt) {
      await db.insert(successFeeUpgradePrompts).values({
        userId,
        triggeredBy: 'fee_exceeds_subscription',
        totalFeesPaidSek: totalFeesPaid,
        subscriptionCostYearlySek: upgradeComparison.annualSubscriptionSek,
      });
    }

    try {
      if (user.email) {
        await sendOutcomeWonEmail(
          user.email,
          agreement,
          feeCalc,
          invoiceResult.hostedUrl,
          dueDate.toISOString().split('T')[0]
        );
      }
    } catch (emailErr) {
      console.error('Failed to send outcome won email:', emailErr);
    }

    res.json({
      status: 'fee_invoiced',
      feeCalculation: feeCalc,
      stripeInvoiceUrl: invoiceResult.hostedUrl,
      dueDate: dueDate.toISOString().split('T')[0],
      showUpgradePrompt: upgradeComparison.shouldShowUpgradePrompt,
      upgradeComparison: upgradeComparison.shouldShowUpgradePrompt ? upgradeComparison : undefined,
    });
  } catch (error) {
    console.error('Error reporting outcome:', error);
    res.status(500).json({ error: 'Failed to report outcome' });
  }
});

// GET /api/success-fee/agreements — List user's agreements
router.get('/agreements', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const statusFilter = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    let conditions = [eq(successFeeAgreements.userId, userId)];
    if (statusFilter) {
      conditions.push(eq(successFeeAgreements.status, statusFilter));
    }

    const agreementsList = await db.select().from(successFeeAgreements)
      .where(and(...conditions))
      .orderBy(desc(successFeeAgreements.createdAt))
      .limit(limit)
      .offset(offset);

    const now = new Date();
    const enriched = agreementsList.map(a => {
      let daysUntilDue: number | null = null;
      let isOverdue = false;
      if (a.invoiceDueDate && a.status === 'fee_invoiced') {
        const due = new Date(a.invoiceDueDate);
        daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        isOverdue = daysUntilDue < 0;
      }
      return { ...a, daysUntilDue, isOverdue };
    });

    const allUserAgreements = await db.select().from(successFeeAgreements)
      .where(eq(successFeeAgreements.userId, userId));

    const summary = {
      totalActive: allUserAgreements.filter(a => a.status === 'active').length,
      totalWon: allUserAgreements.filter(a => ['grant_won', 'fee_invoiced', 'fee_paid'].includes(a.status)).length,
      totalFeesPaidSek: allUserAgreements.filter(a => a.status === 'fee_paid').reduce((sum, a) => sum + (a.calculatedFeeSek || 0), 0),
      totalFeesOutstandingSek: allUserAgreements.filter(a => a.status === 'fee_invoiced').reduce((sum, a) => sum + (a.calculatedFeeSek || 0), 0),
    };

    res.json({ agreements: enriched, summary });
  } catch (error) {
    console.error('Error listing agreements:', error);
    res.status(500).json({ error: 'Failed to list agreements' });
  }
});

// GET /api/success-fee/agreements/:id — Single agreement detail
router.get('/agreements/:id', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const [agreement] = await db.select().from(successFeeAgreements).where(
      and(eq(successFeeAgreements.id, id), eq(successFeeAgreements.userId, userId))
    );
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

    const events = await db.select().from(successFeeEvents)
      .where(eq(successFeeEvents.agreementId, id))
      .orderBy(desc(successFeeEvents.createdAt));

    let feePreview: FeeCalculation | undefined;
    if (['pending', 'active'].includes(agreement.status)) {
      feePreview = calculateSuccessFee(500000, agreement.feePercentage, agreement.maxFeeCapSek, agreement.minFeeSek);
    }

    res.json({ ...agreement, feePreview, events });
  } catch (error) {
    console.error('Error fetching agreement:', error);
    res.status(500).json({ error: 'Failed to fetch agreement' });
  }
});

// DELETE /api/success-fee/agreements/:id — Cancel agreement
router.delete('/agreements/:id', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const [agreement] = await db.select().from(successFeeAgreements).where(
      and(eq(successFeeAgreements.id, id), eq(successFeeAgreements.userId, userId))
    );
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    if (!['pending', 'active'].includes(agreement.status)) {
      return res.status(400).json({ error: `Cannot cancel agreement with status "${agreement.status}"` });
    }

    if (agreement.stripeInvoiceId) {
      try {
        await voidFeeInvoice(agreement.stripeInvoiceId);
      } catch (e) {
        console.error('Failed to void invoice:', e);
      }
    }

    await db.update(successFeeAgreements)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(successFeeAgreements.id, id));

    await logFeeEvent(id, userId, 'agreement_cancelled',
      'Agreement cancelled by user',
      {},
      userId
    );

    res.json({ message: 'Agreement cancelled. No fee will be charged.' });
  } catch (error) {
    console.error('Error cancelling agreement:', error);
    res.status(500).json({ error: 'Failed to cancel agreement' });
  }
});

// GET /api/success-fee/calculate — Preview fee calculation
router.get('/calculate', async (req: Request, res: Response) => {
  try {
    const amount = parseInt(req.query.amount as string);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });

    const settings = await getOrCreateSettings();
    const calc = calculateSuccessFee(amount, settings.defaultFeePercentage, settings.maxFeeCapSek, settings.minFeeSek);
    res.json(calc);
  } catch (error) {
    res.status(500).json({ error: 'Calculation failed' });
  }
});

// ─── Admin endpoints ──────────────────────────────────────────────────────────

async function isAdmin(req: any): Promise<boolean> {
  const userId = req.user?.claims?.sub;
  if (!userId) return false;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user?.plan === 'enterprise' || user?.email === 'admin@getgrant.ai';
}

// GET /api/success-fee/admin/stats
router.get('/admin/stats', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const all = await db.select().from(successFeeAgreements);
    const totalCollected = all.filter(a => a.status === 'fee_paid').reduce((s, a) => s + (a.calculatedFeeSek || 0), 0);
    const totalOutstanding = all.filter(a => a.status === 'fee_invoiced').reduce((s, a) => s + (a.calculatedFeeSek || 0), 0);
    const now = new Date();
    const overdueAgreements = all.filter(a => a.status === 'fee_invoiced' && a.invoiceDueDate && new Date(a.invoiceDueDate) < now);

    res.json({
      totalAgreements: all.length,
      byStatus: {
        pending: all.filter(a => a.status === 'pending').length,
        active: all.filter(a => a.status === 'active').length,
        grant_won: all.filter(a => a.status === 'grant_won').length,
        fee_invoiced: all.filter(a => a.status === 'fee_invoiced').length,
        fee_paid: all.filter(a => a.status === 'fee_paid').length,
        rejected: all.filter(a => a.status === 'rejected').length,
        cancelled: all.filter(a => a.status === 'cancelled').length,
        expired: all.filter(a => a.status === 'expired').length,
      },
      totalCollectedSek: totalCollected,
      totalOutstandingSek: totalOutstanding,
      overdueCount: overdueAgreements.length,
      overdueTotalSek: overdueAgreements.reduce((s, a) => s + (a.calculatedFeeSek || 0), 0),
      flaggedForReview: all.filter(a => a.flaggedForReview).length,
      averageFeePercentage: all.length > 0 ? Math.round(all.reduce((s, a) => s + a.feePercentage, 0) / all.length) : 0,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/success-fee/admin/agreements — List all agreements (admin)
router.get('/admin/agreements', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const statusFilter = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let conditions: any[] = [];
    if (statusFilter) conditions.push(eq(successFeeAgreements.status, statusFilter));
    if (search) {
      conditions.push(or(
        ilike(successFeeAgreements.grantTitle, `%${search}%`),
        ilike(successFeeAgreements.funder, `%${search}%`),
        ilike(successFeeAgreements.userId, `%${search}%`)
      ));
    }

    const agreementsList = conditions.length > 0
      ? await db.select().from(successFeeAgreements).where(and(...conditions)).orderBy(desc(successFeeAgreements.createdAt)).limit(limit).offset(offset)
      : await db.select().from(successFeeAgreements).orderBy(desc(successFeeAgreements.createdAt)).limit(limit).offset(offset);

    const userIds = Array.from(new Set(agreementsList.map(a => a.userId)));
    const usersList = userIds.length > 0
      ? await db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
          .from(users).where(sql`${users.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`)
      : [];
    const usersMap = new Map(usersList.map(u => [u.id, u]));

    const enriched = agreementsList.map(a => ({
      ...a,
      userEmail: usersMap.get(a.userId)?.email || 'unknown',
      userName: `${usersMap.get(a.userId)?.firstName || ''} ${usersMap.get(a.userId)?.lastName || ''}`.trim() || 'Unknown',
    }));

    const total = conditions.length > 0
      ? await db.select({ count: count() }).from(successFeeAgreements).where(and(...conditions))
      : await db.select({ count: count() }).from(successFeeAgreements);

    res.json({ agreements: enriched, total: total[0]?.count || 0 });
  } catch (error) {
    console.error('Error listing admin agreements:', error);
    res.status(500).json({ error: 'Failed to list agreements' });
  }
});

// PATCH /api/success-fee/agreements/:id/admin — Update admin fields
router.patch('/agreements/:id/admin', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const userId = req.user?.claims?.sub;
    const schema = z.object({
      adminNotes: z.string().optional(),
      flaggedForReview: z.boolean().optional(),
      markReviewed: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });

    const updates: any = { updatedAt: new Date() };
    if (parsed.data.adminNotes !== undefined) updates.adminNotes = parsed.data.adminNotes;
    if (parsed.data.flaggedForReview !== undefined) {
      updates.flaggedForReview = parsed.data.flaggedForReview;
      if (parsed.data.flaggedForReview) {
        await logFeeEvent(id, userId, 'admin_flagged', 'Agreement flagged for review', {}, userId);
      }
    }
    if (parsed.data.markReviewed) {
      updates.reviewedBy = userId;
      updates.reviewedAt = new Date();
      await logFeeEvent(id, userId, 'admin_reviewed', 'Agreement reviewed by admin', {}, userId);
    }

    const [updated] = await db.update(successFeeAgreements)
      .set(updates)
      .where(eq(successFeeAgreements.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('Error updating admin fields:', error);
    res.status(500).json({ error: 'Failed to update' });
  }
});

// POST /api/success-fee/admin/send-reminder
router.post('/admin/send-reminder', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const { agreementId } = req.body;
    const [agreement] = await db.select().from(successFeeAgreements).where(eq(successFeeAgreements.id, agreementId));
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    if (agreement.status !== 'fee_invoiced') return res.status(400).json({ error: 'Can only send reminders for invoiced agreements' });

    await db.update(successFeeAgreements).set({
      reminderSentAt: new Date(),
      reminderCount: (agreement.reminderCount || 0) + 1,
      updatedAt: new Date(),
    }).where(eq(successFeeAgreements.id, agreementId));

    await logFeeEvent(agreementId, agreement.userId, 'reminder_sent',
      `Payment reminder #${(agreement.reminderCount || 0) + 1} sent`,
      { invoiceId: agreement.stripeInvoiceId },
      req.user?.claims?.sub
    );

    try {
      const [reminderUser] = await db.select().from(users).where(eq(users.id, agreement.userId));
      if (reminderUser?.email && agreement.invoiceDueDate) {
        const daysUntilDue = Math.ceil((new Date(agreement.invoiceDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        await sendPaymentReminderEmail(reminderUser.email, agreement, daysUntilDue);
      }
    } catch (emailErr) {
      console.error('Failed to send reminder email:', emailErr);
    }

    res.json({ message: 'Reminder sent', reminderCount: (agreement.reminderCount || 0) + 1 });
  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// GET /api/success-fee/admin/settings
router.get('/admin/settings', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/success-fee/admin/settings
router.put('/admin/settings', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const userId = req.user?.claims?.sub;
    const schema = z.object({
      defaultFeePercentage: z.number().min(1).max(20).optional(),
      maxFeeCapSek: z.number().min(0).optional(),
      minFeeSek: z.number().min(0).optional(),
      isEnabled: z.boolean().optional(),
      eligiblePlans: z.array(z.string()).optional(),
      termsVersion: z.string().optional(),
      invoiceDaysUntilDue: z.number().min(1).max(90).optional(),
      autoExpireMonths: z.number().min(1).max(36).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid settings', details: parsed.error.flatten() });

    const settings = await getOrCreateSettings();
    const updates: any = { ...parsed.data, updatedBy: userId, updatedAt: new Date() };
    if (parsed.data.termsVersion && parsed.data.termsVersion !== settings.termsVersion) {
      updates.termsLastUpdated = new Date();
    }

    const [updated] = await db.update(successFeeSettings)
      .set(updates)
      .where(eq(successFeeSettings.id, settings.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/success-fee/admin/export — CSV export
router.get('/admin/export', isAuthenticated, async (req: any, res: Response) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin access required' });

    const all = await db.select().from(successFeeAgreements).orderBy(desc(successFeeAgreements.createdAt));

    const csvHeader = 'ID,User ID,Grant Title,Funder,Status,Fee %,Approved Amount,Fee Amount,Cap Applied,Invoice Status,Agreed At,Created At\n';
    const csvRows = all.map(a =>
      [a.id, a.userId, `"${a.grantTitle}"`, `"${a.funder}"`, a.status, a.feePercentage,
       a.approvedAmountSek || '', a.calculatedFeeSek || '', a.capApplied, a.stripePaymentStatus || '',
       a.agreedAt?.toISOString() || '', a.createdAt?.toISOString() || ''].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=success-fee-agreements.csv');
    res.send(csvHeader + csvRows);
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/success-fee/upgrade-prompt — Check if user should see upgrade prompt
router.get('/upgrade-prompt', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const paidAgreements = await db.select().from(successFeeAgreements)
      .where(and(eq(successFeeAgreements.userId, userId), eq(successFeeAgreements.status, 'fee_paid')));

    const totalPaid = paidAgreements.reduce((sum, a) => sum + (a.calculatedFeeSek || 0), 0);
    const comparison = calculateUpgradeComparison(totalPaid);

    const [recentDismissal] = await db.select().from(successFeeUpgradePrompts)
      .where(and(
        eq(successFeeUpgradePrompts.userId, userId),
        eq(successFeeUpgradePrompts.userClickedUpgrade, false),
        sql`${successFeeUpgradePrompts.promptShownAt} > NOW() - INTERVAL '60 days'`
      ))
      .orderBy(desc(successFeeUpgradePrompts.promptShownAt))
      .limit(1);

    res.json({
      showPrompt: comparison.shouldShowUpgradePrompt && !recentDismissal,
      ...comparison,
      totalAgreements: paidAgreements.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check upgrade prompt' });
  }
});

// POST /api/success-fee/upgrade-prompt/dismiss
router.post('/upgrade-prompt/dismiss', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await db.insert(successFeeUpgradePrompts).values({
      userId,
      triggeredBy: 'manual',
      userClickedUpgrade: false,
    });

    res.json({ dismissed: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to dismiss' });
  }
});

// GET /api/success-fee/check/:applicationId — Check agreement status for an application
router.get('/check/:applicationId', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { applicationId } = req.params;
    const [agreement] = await db.select().from(successFeeAgreements).where(
      and(
        eq(successFeeAgreements.applicationId, applicationId),
        eq(successFeeAgreements.userId, userId),
        sql`${successFeeAgreements.status} NOT IN ('cancelled', 'expired')`
      )
    );

    res.json({ hasAgreement: !!agreement, agreement: agreement || null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check agreement' });
  }
});

export default router;
