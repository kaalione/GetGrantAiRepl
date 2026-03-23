import { db } from '../db';
import { successFeeAgreements, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logFeeEvent } from './successFee';
import { getUncachableStripeClient } from '../lib/stripeClient';
import { sendInvoicePaidEmail, sendPaymentFailedEmail } from '../lib/successFeeEmails';
import type Stripe from 'stripe';

export async function handleSuccessFeeWebhook(event: Stripe.Event): Promise<boolean> {
  if (!['invoice.paid', 'invoice.payment_failed', 'invoice.voided'].includes(event.type)) {
    return false;
  }

  const invoice = event.data.object as Stripe.Invoice;
  const agreementId = invoice.metadata?.agreementId;
  if (!agreementId || invoice.metadata?.type !== 'success_fee') {
    return false;
  }

  const [agreement] = await db.select().from(successFeeAgreements)
    .where(eq(successFeeAgreements.id, agreementId));

  if (!agreement) {
    console.error(`Success fee webhook: agreement ${agreementId} not found`);
    return false;
  }

  switch (event.type) {
    case 'invoice.paid':
      await db.update(successFeeAgreements).set({
        status: 'fee_paid',
        stripePaymentStatus: 'paid',
        invoicePaidAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(successFeeAgreements.id, agreementId));

      await logFeeEvent(agreementId, agreement.userId, 'invoice_paid',
        `Invoice ${agreement.stripeInvoiceId} paid. Fee: ${agreement.calculatedFeeSek?.toLocaleString('sv-SE')} SEK`,
        { invoiceId: agreement.stripeInvoiceId, amount: agreement.calculatedFeeSek },
        'stripe_webhook'
      );

      try {
        const [user] = await db.select().from(users).where(eq(users.id, agreement.userId));
        if (user?.email) {
          await sendInvoicePaidEmail(user.email, agreement);
        }
      } catch (emailErr) {
        console.error('Failed to send invoice paid email:', emailErr);
      }
      break;

    case 'invoice.payment_failed':
      await db.update(successFeeAgreements).set({
        stripePaymentStatus: 'payment_failed',
        updatedAt: new Date(),
      }).where(eq(successFeeAgreements.id, agreementId));

      await logFeeEvent(agreementId, agreement.userId, 'payment_failed',
        `Payment failed for invoice ${agreement.stripeInvoiceId}`,
        { invoiceId: agreement.stripeInvoiceId },
        'stripe_webhook'
      );

      try {
        const [failedUser] = await db.select().from(users).where(eq(users.id, agreement.userId));
        if (failedUser?.email) {
          await sendPaymentFailedEmail(failedUser.email, agreement);
        }
      } catch (emailErr) {
        console.error('Failed to send payment failed email:', emailErr);
      }
      break;

    case 'invoice.voided':
      await db.update(successFeeAgreements).set({
        stripePaymentStatus: 'void',
        updatedAt: new Date(),
      }).where(eq(successFeeAgreements.id, agreementId));

      await logFeeEvent(agreementId, agreement.userId, 'invoice_voided',
        `Invoice ${agreement.stripeInvoiceId} voided`,
        { invoiceId: agreement.stripeInvoiceId },
        'stripe_webhook'
      );
      break;
  }

  return true;
}

export async function processStripeEventForSuccessFee(rawBody: Buffer, signature: string): Promise<boolean> {
  try {
    const stripe = await getUncachableStripeClient();
    const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET || '');
    return await handleSuccessFeeWebhook(event);
  } catch (error) {
    console.error('Success fee webhook processing error:', error);
    return false;
  }
}
