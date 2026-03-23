import { db } from '../db';
import { users, partners } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { getUncachableStripeClient, PRICE_IDS } from '../lib/stripeClient';
import { PARTNER_PLANS, type PartnerPlanKey } from '../config/partnerPlans';

export { PRICE_IDS };

export async function createCheckoutSession(
  userId: string,
  userEmail: string,
  plan: 'pro' | 'enterprise',
  successUrl: string,
  cancelUrl: string
) {
  const stripe = await getUncachableStripeClient();
  const priceId = PRICE_IDS[plan];
  
  if (!priceId) {
    throw new Error(`Price ID for plan "${plan}" not configured`);
  }

  const session = await stripe.checkout.sessions.create({
    customer_email: userEmail,
    client_reference_id: userId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      plan,
    },
  });

  return session;
}

export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
) {
  const stripe = await getUncachableStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session;
}

export async function cancelSubscription(subscriptionId: string) {
  const stripe = await getUncachableStripeClient();
  await stripe.subscriptions.cancel(subscriptionId);
}

export async function getSubscription(subscriptionId: string) {
  const stripe = await getUncachableStripeClient();
  return await stripe.subscriptions.retrieve(subscriptionId);
}

export async function getUserByStripeCustomerId(customerId: string) {
  const result = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
  return result[0] || null;
}

export async function updateUserSubscription(
  userId: string,
  data: {
    plan?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: string;
    subscriptionEndsAt?: Date | null;
  }
) {
  const [updated] = await db.update(users)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function getUserSubscription(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  
  return {
    plan: user.plan || 'free',
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionEndsAt: user.subscriptionEndsAt,
  };
}

export async function createPartnerCheckoutSession(
  partnerId: string,
  contactEmail: string,
  plan: PartnerPlanKey,
  successUrl: string,
  cancelUrl: string,
  existingStripeCustomerId?: string | null
) {
  const stripe = await getUncachableStripeClient();
  const planConfig = PARTNER_PLANS[plan];
  if (!planConfig || !planConfig.stripePriceId) {
    throw new Error(`Price ID for partner plan "${plan}" not configured`);
  }

  const sessionParams: Record<string, unknown> = {
    client_reference_id: partnerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: planConfig.stripePriceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      partnerId,
      plan,
      type: 'partner',
    },
  };

  if (existingStripeCustomerId) {
    sessionParams.customer = existingStripeCustomerId;
  } else {
    sessionParams.customer_email = contactEmail;
  }

  const session = await stripe.checkout.sessions.create(sessionParams as any);

  return session;
}

export async function updateStripeSubscriptionPlan(
  subscriptionId: string,
  newPriceId: string
) {
  const stripe = await getUncachableStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const currentItem = subscription.items.data[0];
  
  if (!currentItem) {
    throw new Error('No subscription item found');
  }

  const updated = await stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: currentItem.id,
      price: newPriceId,
    }],
    proration_behavior: 'create_prorations',
  });

  return updated;
}

export async function updatePartnerSubscription(
  partnerId: string,
  data: {
    plan?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripeSubscriptionStatus?: string;
    maxClients?: number;
    maxAiRequestsPerMonth?: number;
    allowCustomDomain?: boolean;
    allowApiAccess?: boolean;
    allowClientSelfSignup?: boolean;
    allowCustomEmailDomain?: boolean;
  }
) {
  const [updated] = await db.update(partners)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(partners.id, partnerId))
    .returning();
  return updated;
}
