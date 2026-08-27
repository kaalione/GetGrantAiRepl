import type Stripe from 'stripe';
import { getUserByStripeCustomerId, updateUserSubscription } from '../services/stripe';

// Maintains users.plan / subscription columns from Stripe subscription
// events. Partner subscriptions (metadata.type === 'partner') and success
// fee invoices are handled by their dedicated handlers in server/services.
export async function handleSubscriptionWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.type === 'partner') return;

      const userId = session.metadata?.userId || session.client_reference_id;
      const plan = session.metadata?.plan;
      if (!userId || !plan || session.mode !== 'subscription') return;

      await updateUserSubscription(userId, {
        plan,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
        subscriptionStatus: 'active',
        subscriptionEndsAt: null,
      });
      console.log(`[Stripe] User ${userId} subscribed to ${plan}`);
      return;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      const user = await getUserByStripeCustomerId(customerId);
      if (!user) return;

      const periodEnd = (subscription as any).current_period_end;
      await updateUserSubscription(user.id, {
        subscriptionStatus: subscription.status,
        subscriptionEndsAt:
          subscription.cancel_at_period_end && periodEnd ? new Date(periodEnd * 1000) : null,
        ...(subscription.status === 'canceled' ? { plan: 'free' } : {}),
      });
      return;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      const user = await getUserByStripeCustomerId(customerId);
      if (!user) return;

      await updateUserSubscription(user.id, {
        plan: 'free',
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: undefined,
        subscriptionEndsAt: null,
      });
      console.log(`[Stripe] User ${user.id} subscription ended — downgraded to free`);
      return;
    }
  }
}
