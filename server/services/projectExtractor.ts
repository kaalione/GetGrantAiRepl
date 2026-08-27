import { anthropic } from "../lib/anthropic";

// Extracts a structured project description from an uploaded document
// (PDF/pitch deck text) — the "upload your pitch, get matches" flow. The
// result is a PROPOSAL: the user reviews and confirms it in the profile
// dialog before anything is saved (spec: AI suggests, the user decides).

export interface ExtractedProject {
  name: string;
  description: string;
  goals: string;
  focus_areas: string[];
  keywords: string[];
  budget_sek: number | null;
  timeframe: string | null;
  confidence: number;
}

// Documents beyond this are truncated — enough for a typical pitch deck or
// project plan while keeping cost per extraction bounded.
const MAX_TEXT_CHARS = 60_000;

const EXTRACTION_PROMPT = `Du är expert på svenska företagsbidrag. Nedan följer text ur ett dokument som ett företag laddat upp (pitch deck, projektplan eller liknande). Extrahera en strukturerad projektbeskrivning som ska användas för att matcha företaget mot bidrag och finansieringsutlysningar.

Svara med ENDAST en JSON-struktur (inga andra tecken före eller efter):
{
  "name": "<kort projektnamn, max 60 tecken, på svenska>",
  "description": "<vad projektet går ut på, 2-4 meningar på svenska>",
  "goals": "<vad man vill uppnå, 1-3 meningar på svenska>",
  "focus_areas": ["<2-5 breda områden, t.ex. Energi, AI, Livsmedel, Export>"],
  "keywords": ["<5-15 specifika nyckelord på svenska som beskriver projektet>"],
  "budget_sek": <ungefärlig totalbudget i SEK som heltal, eller null om den inte framgår>,
  "timeframe": "<tidsram om den framgår, t.ex. '2026 Q4–2027 Q4', annars null>",
  "confidence": <0.0-1.0, hur säker du är på att extraktionen speglar dokumentet>
}

Regler:
- Beskriv PROJEKTET, inte företaget i allmänhet.
- Hitta inte på fakta: budget och tidsram är null om de inte står i dokumentet.
- focus_areas och keywords skrivs på svenska även om dokumentet är på engelska.

DOKUMENTTEXT:
`;

export async function extractProjectFromText(text: string): Promise<ExtractedProject> {
  const truncated = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1200,
    messages: [{ role: "user", content: EXTRACTION_PROMPT + truncated }],
  });

  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type from extraction model");
  }

  // The model is instructed to return bare JSON; strip stray code fences
  // defensively before parsing.
  const raw = block.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(raw) as ExtractedProject;

  return {
    name: String(parsed.name ?? "").slice(0, 120),
    description: String(parsed.description ?? "").slice(0, 4000),
    goals: String(parsed.goals ?? "").slice(0, 4000),
    focus_areas: Array.isArray(parsed.focus_areas) ? parsed.focus_areas.slice(0, 20).map(String) : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 30).map(String) : [],
    budget_sek: typeof parsed.budget_sek === "number" && parsed.budget_sek >= 0 ? Math.round(parsed.budget_sek) : null,
    timeframe: parsed.timeframe ? String(parsed.timeframe).slice(0, 120) : null,
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
  };
}

export async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ last: 40 }); // page budget per spec
    return { text: result.text ?? "", pages: result.total ?? 0 };
  } finally {
    await parser.destroy();
  }
}
