import Anthropic from "@anthropic-ai/sdk";

// Shared Claude client for all AI features (matching, application
// generation, eligibility extraction, enrichment). Requires
// ANTHROPIC_API_KEY.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
