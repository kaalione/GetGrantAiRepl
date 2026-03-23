import { db } from '../db';
import { partners } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { PARTNER_PLANS, type PartnerPlanKey } from '../config/partnerPlans';

export async function handlePartnerStripeWebhook(event: any) {
  const eventType = event.type;

  if (eventType === 'checkout.session.completed') {
    const session = event.data?.object;
    if (!session?.metadata?.type || session.metadata.type !== 'partner') return;

    const partnerId = session.metadata.partnerId;
    const plan = session.metadata.plan as PartnerPlanKey;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (!partnerId || !plan) return;

    const planConfig = PARTNER_PLANS[plan];
    if (!planConfig) return;

    await db.update(partners)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeSubscriptionStatus: 'active',
        plan,
        maxClients: planConfig.maxClients,
        maxAiRequestsPerMonth: planConfig.maxAiRequestsPerMonth,
        allowCustomDomain: planConfig.features.customDomain,
        allowApiAccess: planConfig.features.allowApiAccess,
        allowClientSelfSignup: planConfig.features.allowClientSelfSignup,
        allowCustomEmailDomain: planConfig.features.allowCustomEmailDomain,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(partners.id, partnerId));

    console.log(`Partner ${partnerId} subscription activated: ${plan}`);
  }

  if (eventType === 'customer.subscription.updated') {
    const subscription = event.data?.object;
    const customerId = subscription?.customer;
    if (!customerId) return;

    const [partner] = await db.select().from(partners)
      .where(eq(partners.stripeCustomerId, customerId));

    if (!partner) return;

    const status = subscription.status;
    await db.update(partners)
      .set({
        stripeSubscriptionStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(partners.id, partner.id));

    console.log(`Partner ${partner.id} subscription status: ${status}`);
  }

  if (eventType === 'customer.subscription.deleted') {
    const subscription = event.data?.object;
    const customerId = subscription?.customer;
    if (!customerId) return;

    const [partner] = await db.select().from(partners)
      .where(eq(partners.stripeCustomerId, customerId));

    if (!partner) return;

    await db.update(partners)
      .set({
        stripeSubscriptionStatus: 'cancelled',
        status: 'suspended',
        updatedAt: new Date(),
      })
      .where(eq(partners.id, partner.id));

    console.log(`Partner ${partner.id} subscription cancelled, account suspended`);
  }

  if (eventType === 'invoice.payment_failed') {
    const invoice = event.data?.object;
    const customerId = invoice?.customer;
    if (!customerId) return;

    const [partner] = await db.select().from(partners)
      .where(eq(partners.stripeCustomerId, customerId));

    if (!partner) return;

    await db.update(partners)
      .set({
        stripeSubscriptionStatus: 'past_due',
        updatedAt: new Date(),
      })
      .where(eq(partners.id, partner.id));

    console.log(`Partner ${partner.id} payment failed, status: past_due`);
  }
}
