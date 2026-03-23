import { db } from '../db';
import { successFeeAgreements, successFeeEvents, successFeeSettings, successFeeUpgradePrompts } from '@shared/schema';
import { users } from '@shared/schema';
import { eq, and, lt, sql } from 'drizzle-orm';
import { getUncachableStripeClient } from '../lib/stripeClient';
import type { SuccessFeeAgreement, SuccessFeeSettings } from '@shared/schema';

export interface FeeCalculation {
  approvedAmountSek: number;
  feePercentage: number;
  rawFeeSek: number;
  finalFeeSek: number;
  capApplied: boolean;
  minimumApplied: boolean;
  breakdown: string;
}

export function calculateSuccessFee(
  approvedAmountSek: number,
  feePercentage: number = 3,
  maxCapSek: number = 25000,
  minFeeSek: number = 500
): FeeCalculation {
  const rawFee = Math.round(approvedAmountSek * (feePercentage / 100));
  const cappedFee = Math.min(rawFee, maxCapSek);
  const finalFee = Math.max(cappedFee, minFeeSek);

  const capApplied = rawFee > maxCapSek;
  const minimumApplied = cappedFee < minFeeSek;

  let breakdown = `${feePercentage}% × ${approvedAmountSek.toLocaleString('sv-SE')} SEK = ${rawFee.toLocaleString('sv-SE')} SEK`;
  if (capApplied) breakdown += ` → capped at ${maxCapSek.toLocaleString('sv-SE')} SEK`;
  if (minimumApplied) breakdown += ` → minimum fee ${minFeeSek.toLocaleString('sv-SE')} SEK applied`;

  return {
    approvedAmountSek,
    feePercentage,
    rawFeeSek: rawFee,
    finalFeeSek: finalFee,
    capApplied,
    minimumApplied,
    breakdown
  };
}

export async function createFeeInvoice(
  agreement: SuccessFeeAgreement,
  feeCalc: FeeCalculation,
  user: { email: string; name: string; stripeCustomerId?: string | null },
  settings: SuccessFeeSettings
): Promise<{ invoiceId: string; invoiceUrl: string; hostedUrl: string; customerId: string }> {
  const stripe = await getUncachableStripeClient();

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: agreement.userId, platform: 'getgrant_ai' }
    });
    customerId = customer.id;
    await db.update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, agreement.userId));
  }

  const lineItemDescription = [
    `GetGrant.ai Success Fee`,
    `Grant: ${agreement.grantTitle}`,
    `Funder: ${agreement.funder}`,
    `Approved amount: ${feeCalc.approvedAmountSek.toLocaleString('sv-SE')} SEK`,
    `Fee rate: ${feeCalc.feePercentage}%`,
    feeCalc.capApplied ? `Maximum fee cap applied (${agreement.maxFeeCapSek.toLocaleString('sv-SE')} SEK)` : '',
    feeCalc.minimumApplied ? `Minimum fee applied` : '',
    `Reference: ${agreement.grantAgreementRef || 'Not provided'}`
  ].filter(Boolean).join('\n');

  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: settings.invoiceDaysUntilDue || 30,
    auto_advance: false,
    description: `GetGrant.ai success fee — ${agreement.grantTitle}`,
    footer: 'GetGrant.ai | support@getgrant.ai | VAT included where applicable',
    metadata: {
      agreementId: agreement.id,
      applicationId: agreement.applicationId,
      grantId: agreement.grantId,
      userId: agreement.userId,
      type: 'success_fee'
    },
    custom_fields: [
      { name: 'Bidragsreferens', value: (agreement.grantAgreementRef || 'Ej angiven').substring(0, 30) },
      { name: 'Finansiär', value: agreement.funder.substring(0, 30) },
    ]
  });

  await stripe.invoiceItems.create({
    customer: customerId,
    invoice: invoice.id,
    amount: feeCalc.finalFeeSek * 100,
    currency: 'sek',
    description: lineItemDescription,
    metadata: {
      agreementId: agreement.id,
      feeBreakdown: feeCalc.breakdown
    }
  });

  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);

  return {
    invoiceId: invoice.id,
    invoiceUrl: finalizedInvoice.invoice_pdf || '',
    hostedUrl: finalizedInvoice.hosted_invoice_url || '',
    customerId
  };
}

export async function voidFeeInvoice(stripeInvoiceId: string): Promise<void> {
  const stripe = await getUncachableStripeClient();
  await stripe.invoices.voidInvoice(stripeInvoiceId);
}

export function calculateUpgradeComparison(
  totalFeesPaidSek: number,
  proMonthlySek: number = 495
): {
  annualSubscriptionSek: number;
  feesPaidSek: number;
  savingsSek: number;
  shouldShowUpgradePrompt: boolean;
  message: string;
} {
  const annualSek = proMonthlySek * 12;
  const savings = totalFeesPaidSek - annualSek;

  return {
    annualSubscriptionSek: annualSek,
    feesPaidSek: totalFeesPaidSek,
    savingsSek: savings,
    shouldShowUpgradePrompt: totalFeesPaidSek >= annualSek * 0.7,
    message: savings > 0
      ? `Du har betalat ${totalFeesPaidSek.toLocaleString('sv-SE')} SEK i framgångsavgifter — ${savings.toLocaleString('sv-SE')} SEK mer än ett årsabonnemang kostar.`
      : `Du har betalat ${totalFeesPaidSek.toLocaleString('sv-SE')} SEK i framgångsavgifter. Ett årsabonnemang kostar bara ${annualSek.toLocaleString('sv-SE')} SEK.`
  };
}

export async function expireStaleAgreements(autoExpireMonths: number = 18): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - autoExpireMonths);

  const stale = await db.update(successFeeAgreements)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(successFeeAgreements.status, 'active'),
        lt(successFeeAgreements.agreedAt, cutoff)
      )
    )
    .returning();

  for (const agreement of stale) {
    await logFeeEvent(agreement.id, agreement.userId, 'agreement_expired',
      `Agreement expired after ${autoExpireMonths} months with no outcome reported`,
      { expiredAt: new Date().toISOString() },
      'system'
    );
  }

  return stale.length;
}

export async function logFeeEvent(
  agreementId: string,
  userId: string,
  eventType: string,
  description: string,
  metadata: Record<string, unknown> = {},
  performedBy: string = 'system'
): Promise<void> {
  await db.insert(successFeeEvents).values({
    agreementId,
    userId,
    eventType,
    description,
    metadata,
    performedBy
  });
}

export async function getOrCreateSettings(): Promise<SuccessFeeSettings> {
  const [existing] = await db.select().from(successFeeSettings).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(successFeeSettings).values({}).returning();
  return created;
}
