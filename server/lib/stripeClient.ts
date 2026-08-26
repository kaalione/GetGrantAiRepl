import Stripe from 'stripe';

let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    stripe = new Stripe(secretKey);
  }
  return stripe;
}

// Kept async for compatibility with existing call sites (the Replit
// connector had to fetch credentials at runtime; the env-based client
// does not).
export async function getUncachableStripeClient() {
  return getStripe();
}

export async function getStripePublishableKey() {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error('STRIPE_PUBLISHABLE_KEY is not set');
  }
  return key;
}

export async function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return key;
}

// Verifies the webhook payload against STRIPE_WEBHOOK_SECRET and returns
// the parsed event. Throws on a bad or missing signature.
export function verifyWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
}

export const PRICE_IDS = {
  pro: process.env.STRIPE_PRO_PRICE_ID || '',
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
};
