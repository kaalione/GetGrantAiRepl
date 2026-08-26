import { anthropic } from "../lib/anthropic";
import type { Grant, Company } from "@shared/schema";

export interface MatchExplanationResult {
  headline: string;
  reasons: string[];
  bestFitAspect: string;
}

export async function generateMatchExplanation(
  grant: Grant,
  company: Company,
  matchScore: number
): Promise<MatchExplanationResult> {
  const isSwedish = grant.sourceType !== 'eu' && !grant.sourceName?.toLowerCase().includes('eu ');
  const language = isSwedish ? 'Swedish' : 'English';

  const prompt = `Explain in 2-3 bullet points why this grant matches this company.
Be specific — reference actual details from both. Be direct and concrete.
Write in ${language}.

GRANT: ${grant.title}
FUNDER: ${grant.sourceName}
GRANT FOCUS: ${(grant.description || '').substring(0, 400)}
SECTORS TARGETED: ${(grant.keywords || []).join(', ') || 'Not specified'}
TARGET GROUP: ${(grant.targetGroup || []).join(', ') || 'Not specified'}

COMPANY: ${company.companyName}
SECTOR: ${company.industry || 'Not specified'}
DESCRIPTION: ${(company.description || '').substring(0, 250)}
REGION: ${company.location || 'Not specified'}
EMPLOYEES: ${company.employees || 'Not specified'}

MATCH SCORE: ${matchScore}/100

Respond with ONLY valid JSON (no markdown, no extra text):
{
  "headline": "One sentence summary of the match (max 15 words)",
  "reasons": [
    "Specific reason 1 — reference actual grant criteria and company detail",
    "Specific reason 2",
    "Specific reason 3 (optional)"
  ],
  "bestFitAspect": "The single strongest alignment point in 8 words or less"
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 350,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      headline: parsed.headline || `Match for ${company.companyName}`,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [],
      bestFitAspect: parsed.bestFitAspect || 'Sector alignment',
    };
  } catch (error) {
    console.error('Match explanation generation error:', error);
    const fallbackHeadline = isSwedish
      ? `Relevant matchning för ${company.industry || 'ert företag'}`
      : `Relevant match for ${company.industry || 'your company'}`;
    return {
      headline: fallbackHeadline,
      reasons: isSwedish
        ? ['Bidragets inriktning överensstämmer med er verksamhet', 'Er region täcks av bidraget']
        : ['Grant focus aligns with your operations', 'Your region is covered by the grant'],
      bestFitAspect: isSwedish ? 'Branschmatchning' : 'Sector alignment',
    };
  }
}
