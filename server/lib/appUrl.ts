// Public base URL of the app — used in emails, invite links and Stripe
// checkout redirect URLs. Set APP_URL in production (e.g. https://getgrant.ai).
export const APP_URL = (
  process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`
).replace(/\/+$/, "");
