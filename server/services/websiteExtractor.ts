import { anthropic } from "../lib/anthropic";
import * as cheerio from "cheerio";
import { db } from "../db";
import { websiteScrapeCache } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

export interface ExtractedCompanyData {
  companyName: string | null;
  description: string | null;
  tagline: string | null;
  foundedYear: number | null;
  orgNumber: string | null;
  sector: string | null;
  industryKeywords: string[];
  naicsCode: string | null;
  employeeCount: string | null;
  companyStage: string | null;
  revenueRange: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  isSwedish: boolean;
  technologyAreas: string[];
  hasRdFocus: boolean;
  innovationLevel: string | null;
  businessModel: string | null;
  isExportFocused: boolean;
  targetMarkets: string[];
  sustainabilityFocus: boolean;
  sustainabilityAreas: string[];
  confidence: {
    companyName: number;
    description: number;
    sector: number;
    employeeCount: number;
    city: number;
    technologyAreas: number;
    foundedYear: number;
    businessModel: number;
    companyStage: number;
    [key: string]: number;
  };
  extractedFrom: string[];
  extractionNotes: string | null;
}

export function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    return `https://${parsed.hostname}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    throw new Error(`Ogiltig URL: ${input}`);
  }
}

export function isPrivateOrLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") return true;
    if (hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("172.")) return true;
    if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
    return false;
  } catch {
    return true;
  }
}

export async function scrapeWebsite(
  baseUrl: string
): Promise<{ content: string; pagesScraped: string[]; errors: string[] }> {
  const normalizedBase = normalizeUrl(baseUrl);

  const pagesToTry = [
    normalizedBase,
    `${normalizedBase}/om-oss`,
    `${normalizedBase}/about`,
    `${normalizedBase}/about-us`,
    `${normalizedBase}/om`,
    `${normalizedBase}/foretaget`,
    `${normalizedBase}/vi`,
    `${normalizedBase}/team`,
  ].filter((url, index, self) => self.indexOf(url) === index);

  const scrapedContent: string[] = [];
  const pagesScraped: string[] = [];
  const errors: string[] = [];
  const SCRAPE_TIMEOUT_MS = 15000;
  const MAX_CONTENT_LENGTH = 15000;

  for (const pageUrl of pagesToTry) {
    if (scrapedContent.join("\n").length > 30000) break;

    const cached = await db.query.websiteScrapeCache.findFirst({
      where: and(
        eq(websiteScrapeCache.normalizedUrl, pageUrl),
        gt(websiteScrapeCache.expiresAt, new Date())
      ),
    });

    if (cached?.scrapedContent && (cached.contentLength ?? 0) > 50) {
      scrapedContent.push(`[${pageUrl}]\n${cached.scrapedContent}`);
      pagesScraped.push(pageUrl);
      continue;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

      const response = await fetch(pageUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GetGrant.ai/1.0; +https://getgrant.ai/bot)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status !== 404) {
          errors.push(`${pageUrl}: HTTP ${response.status}`);
        }
        continue;
      }

      const html = await response.text();
      const extracted = extractTextFromHtml(html, MAX_CONTENT_LENGTH);

      if (extracted.length > 20) {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db
          .insert(websiteScrapeCache)
          .values({
            url: pageUrl,
            normalizedUrl: pageUrl,
            scrapedContent: extracted,
            statusCode: response.status,
            contentLength: extracted.length,
            expiresAt,
          })
          .onConflictDoUpdate({
            target: websiteScrapeCache.url,
            set: { scrapedContent: extracted, scrapedAt: new Date(), expiresAt },
          });

        scrapedContent.push(`[${pageUrl}]\n${extracted}`);
        pagesScraped.push(pageUrl);
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        errors.push(`${pageUrl}: Timeout efter ${SCRAPE_TIMEOUT_MS / 1000}s`);
      } else if (pageUrl === normalizedBase) {
        errors.push(`${pageUrl}: ${error.message}`);
      }
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return {
    content: scrapedContent.join("\n\n---\n\n"),
    pagesScraped,
    errors,
  };
}

function extractTextFromHtml(html: string, maxLength: number): string {
  const $ = cheerio.load(html);

  $(
    "script, style, nav, footer, header, aside, iframe, noscript, " +
      ".cookie-banner, .cookie-notice, #cookie, [aria-hidden=\"true\"]"
  ).remove();

  let text = "";

  const metaDescription = $('meta[name="description"]').attr("content");
  if (metaDescription) {
    text += `[Meta description]: ${metaDescription}\n\n`;
  }

  const title = $("title").text().trim();
  if (title) text += `[Title]: ${title}\n\n`;

  text += $("body")
    .text()
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.substring(0, maxLength);
}

export async function extractCompanyDataFromWebsite(
  websiteContent: string,
  websiteUrl: string
): Promise<ExtractedCompanyData> {
  const prompt = `You are analyzing a Nordic company's website to extract structured information
for a grant-matching platform called GetGrant.ai, serving companies in Sweden, Norway, and Finland.

WEBSITE URL: ${websiteUrl}
WEBSITE CONTENT:
${websiteContent}

Extract ALL available information about this company. Try your best to find useful data.
For fields you cannot determine, use null. Even partial information is valuable.

For each field, assign a confidence score (0-100):
- 95-100: Explicitly stated (e.g., "Founded in 2018")
- 70-94: Strongly implied (e.g., tech company clearly doing R&D)
- 40-69: Reasonable inference (e.g., company size from team page size)
- 1-39: Low confidence guess

IMPORTANT: Always extract at least companyName and description if any text is available.
If the website has content, you should be able to determine the company name and write a description.

SECTOR OPTIONS (pick the best match):
- tech: Software, SaaS, IT, digital services, apps
- cleantech: Clean energy, sustainability, environmental technology
- life_science: Medical devices, pharma, biotech, health technology
- manufacturing: Industrial production, hardware, physical products
- creative: Media, design, gaming, entertainment, marketing
- agriculture: Food production, agritech, farming
- social: Social enterprise, NGO, welfare services
- other: Doesn't fit above categories

EMPLOYEE COUNT OPTIONS: '1-10', '11-50', '51-200', '201-500', '500+'

COMPANY STAGE OPTIONS:
- idea: Pre-revenue, concept stage
- startup: Early revenue, <3 years old OR explicitly called startup
- growth: Scaling, growing team/revenue
- established: Stable, profitable, 5+ years
- enterprise: Large, complex organization

REGION OPTIONS (Swedish regions):
Stockholm, Uppsala, Södermanland, Östergötland, Jönköping, Kronoberg,
Kalmar, Gotland, Blekinge, Skåne, Halland, Västra Götaland, Värmland,
Örebro, Västmanland, Dalarna, Gävleborg, Västernorrland, Jämtland,
Västerbotten, Norrbotten

REGION OPTIONS (Norwegian regions):
Oslo, Viken, Innlandet, Vestfold og Telemark, Agder, Rogaland,
Vestland, Møre og Romsdal, Trøndelag, Nordland, Troms og Finnmark

REGION OPTIONS (Finnish regions):
Uusimaa, Varsinais-Suomi, Pirkanmaa, Pohjois-Pohjanmaa,
Keski-Suomi, Pohjois-Savo, Satakunta, Päijät-Häme

Respond ONLY with a valid JSON object (no markdown, no code blocks) matching this exact structure:
{
  "companyName": string | null,
  "description": string | null,
  "tagline": string | null,
  "foundedYear": number | null,
  "orgNumber": string | null,
  "sector": string | null,
  "industryKeywords": string[],
  "employeeCount": string | null,
  "companyStage": string | null,
  "revenueRange": string | null,
  "city": string | null,
  "region": string | null,
  "country": string | null,
  "isSwedish": boolean,
  "technologyAreas": string[],
  "hasRdFocus": boolean,
  "innovationLevel": string | null,
  "businessModel": string | null,
  "isExportFocused": boolean,
  "targetMarkets": string[],
  "sustainabilityFocus": boolean,
  "sustainabilityAreas": string[],
  "confidence": {
    "companyName": number,
    "description": number,
    "sector": number,
    "employeeCount": number,
    "city": number,
    "technologyAreas": number,
    "foundedYear": number,
    "businessModel": number,
    "companyStage": number
  },
  "extractedFrom": string[],
  "extractionNotes": string | null
}`;

  try {
    console.log(`[WebsiteExtractor] Calling AI for ${websiteUrl}, content length: ${websiteContent.length}`);
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    if (!text || text.trim().length < 10) {
      console.error(`[WebsiteExtractor] AI returned empty/minimal response for ${websiteUrl}`);
      return getEmptyExtractedData();
    }

    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[WebsiteExtractor] No JSON object found in AI response for ${websiteUrl}:`, cleaned.substring(0, 200));
      return getEmptyExtractedData();
    }

    const data = JSON.parse(jsonMatch[0]);
    console.log(`[WebsiteExtractor] Successfully extracted data for ${websiteUrl}: companyName=${data.companyName}, fields=${Object.values(data).filter(v => v !== null && v !== undefined).length}`);
    return data as ExtractedCompanyData;
  } catch (error: any) {
    console.error(`[WebsiteExtractor] AI extraction failed for ${websiteUrl}:`, error.message || error);
    return getEmptyExtractedData();
  }
}

function getEmptyExtractedData(): ExtractedCompanyData {
  return {
    companyName: null,
    description: null,
    tagline: null,
    foundedYear: null,
    orgNumber: null,
    sector: null,
    industryKeywords: [],
    naicsCode: null,
    employeeCount: null,
    companyStage: null,
    revenueRange: null,
    city: null,
    region: null,
    country: null,
    isSwedish: false,
    technologyAreas: [],
    hasRdFocus: false,
    innovationLevel: null,
    businessModel: null,
    isExportFocused: false,
    targetMarkets: [],
    sustainabilityFocus: false,
    sustainabilityAreas: [],
    confidence: {
      companyName: 0,
      description: 0,
      sector: 0,
      employeeCount: 0,
      city: 0,
      technologyAreas: 0,
      foundedYear: 0,
      businessModel: 0,
      companyStage: 0,
    },
    extractedFrom: [],
    extractionNotes: "Kunde inte analysera webbplatsen — fyll i uppgifterna manuellt.",
  };
}

export function mapExtractedDataToCompanyProfile(
  data: ExtractedCompanyData
): Record<string, any> {
  return {
    companyName: data.companyName || undefined,
    description: data.description || undefined,
    foundedYear: data.foundedYear || undefined,
    orgNumber: data.orgNumber || undefined,
    industry: data.sector || undefined,
    employees: data.employeeCount ? parseEmployeeCount(data.employeeCount) : undefined,
    location: data.city ? `${data.city}${data.region ? `, ${data.region}` : ""}` : undefined,
    focusAreas: [
      ...data.technologyAreas,
      ...data.industryKeywords,
    ].filter(Boolean).slice(0, 10),
  };
}

function parseEmployeeCount(range: string): number | undefined {
  const map: Record<string, number> = {
    "1-10": 5,
    "11-50": 30,
    "51-200": 100,
    "201-500": 350,
    "500+": 500,
  };
  return map[range];
}

export function countExtractedFields(data: ExtractedCompanyData): { found: number; total: number } {
  const fields = [
    "companyName", "description", "sector", "employeeCount",
    "city", "region", "foundedYear", "businessModel",
    "companyStage", "orgNumber",
  ];
  const total = fields.length;
  let found = 0;
  for (const f of fields) {
    const val = (data as any)[f];
    if (val !== null && val !== undefined && val !== "") found++;
  }
  return { found, total };
}
