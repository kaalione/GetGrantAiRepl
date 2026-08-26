import { anthropic } from "../lib/anthropic";

export interface CompanyProfile {
  company_name: string;
  org_number: string | null;
  org_type: string | null;
  industry: string;
  description: string;
  employees: number | null;
  revenue: number | null;
  location: string;
  founded_year: number | null;
  focus_areas: string[];
  website_url: string;
  confidence: number;
  data_sources: string[];
}

async function fetchWebsiteContent(url: string): Promise<string> {
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith("http")) {
    normalizedUrl = "https://" + normalizedUrl;
  }

  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GetGrant.ai/1.0; company-research)",
        Accept: "text/html",
        "Accept-Language": "sv,en",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return textContent.substring(0, 5000);
  } catch (error) {
    console.error(`Failed to fetch ${normalizedUrl}:`, error);
    return "";
  }
}

async function lookupSwedishCompanyData(
  query: string,
): Promise<Partial<CompanyProfile>> {
  const isOrgNumber = /^\d{6}-?\d{4}$/.test(query.trim());

  try {
    const searchUrl = isOrgNumber
      ? `https://www.allabolag.se/${query.replace("-", "")}`
      : `https://www.allabolag.se/find/what/${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GetGrant.ai/1.0)",
        Accept: "text/html",
        "Accept-Language": "sv",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {};
    }

    const html = await response.text();
    const data: Partial<CompanyProfile> = {};

    const nameMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (nameMatch)
      data.company_name = nameMatch[1].replace(/<[^>]+>/g, "").trim();

    const orgMatch = html.match(/(\d{6}-\d{4})/);
    if (orgMatch) data.org_number = orgMatch[1];

    const revMatch = html.match(
      /Omsättning[:\s]*(\d[\d\s]*)\s*(tkr|TSEK|MSEK|kr)/i,
    );
    if (revMatch) {
      const amount = parseInt(revMatch[1].replace(/\s/g, ""));
      const unit = revMatch[2].toLowerCase();
      if (unit === "tkr" || unit === "tsek") data.revenue = amount * 1000;
      else if (unit === "msek") data.revenue = amount * 1000000;
      else data.revenue = amount;
    }

    const empMatch = html.match(/Anställda[:\s]*(\d+)/i);
    if (empMatch) data.employees = parseInt(empMatch[1]);

    const locMatch = html.match(/Kommun[:\s]*([\wåäöÅÄÖ\s]+)/i);
    if (locMatch) data.location = locMatch[1].trim();

    const yearMatch = html.match(/Registrerad[:\s]*(\d{4})/i);
    if (yearMatch) data.founded_year = parseInt(yearMatch[1]);

    const formMatch = html.match(/Bolagsform[:\s]*([\wåäöÅÄÖ\s]+)/i);
    if (formMatch) {
      const form = formMatch[1].trim().toLowerCase();
      if (form.includes("aktiebolag")) data.org_type = "aktiebolag";
      else if (
        form.includes("enskild firma") ||
        form.includes("enskild näringsidkare")
      )
        data.org_type = "enskild_firma";
      else if (form.includes("handelsbolag")) data.org_type = "handelsbolag";
      else if (form.includes("kommanditbolag"))
        data.org_type = "kommanditbolag";
      else if (form.includes("ekonomisk förening"))
        data.org_type = "ekonomisk_forening";
      else if (form.includes("ideell förening"))
        data.org_type = "ideell_forening";
    }

    return data;
  } catch (error) {
    console.error("Company lookup failed:", error);
    return {};
  }
}

async function analyzeWithClaude(
  websiteContent: string,
  publicData: Partial<CompanyProfile>,
  websiteUrl: string,
): Promise<CompanyProfile> {
  const prompt = `Du analyserar ett svenskt företags webbplats för att skapa en företagsprofil.

WEBBPLATSINNEHÅLL (från ${websiteUrl}):
${websiteContent || "(Kunde inte hämta webbplatsinnehåll)"}

PUBLIK BOLAGSDATA (från offentliga register):
${JSON.stringify(publicData, null, 2)}

Skapa en komplett företagsprofil baserat på ovanstående. Svara ENBART med JSON (inga backticks, ingen annan text):

{
  "company_name": "Företagsnamn AB",
  "org_number": "559123-4567 eller null",
  "org_type": "aktiebolag|enskild_firma|handelsbolag|kommanditbolag|ekonomisk_forening|ideell_forening|stiftelse|null",
  "industry": "Kort branschbeskrivning på svenska (max 50 tecken)",
  "description": "2-3 meningar som beskriver vad företaget gör, på svenska. Basera på webbplatsinnehållet.",
  "employees": null,
  "revenue": null,
  "location": "Stad/kommun",
  "founded_year": null,
  "focus_areas": ["område1", "område2", "område3"],
  "website_url": "${websiteUrl}",
  "confidence": 0.0
}

REGLER:
- Använd publik bolagsdata för hårda fakta (org.nr, anställda, omsättning, plats)
- Använd webbplatsinnehållet för mjuka fakta (beskrivning, bransch, fokusområden)
- Om info saknas, sätt null (siffror) eller tom sträng
- confidence: 0.0-1.0 baserat på hur mycket info du kunde extrahera
- focus_areas: max 5 relevanta nyckelord för bidragsmatchning
- revenue i SEK (inte TSEK eller MSEK)
- GISSA INTE siffror — om du inte har data, sätt null`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const cleanJson = responseText
      .trim()
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/i, "");

    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const profile = JSON.parse(jsonMatch[0]) as CompanyProfile;

    if (publicData.org_number) profile.org_number = publicData.org_number;
    if (publicData.employees) profile.employees = publicData.employees;
    if (publicData.revenue) profile.revenue = publicData.revenue;
    if (publicData.location) profile.location = publicData.location;
    if (publicData.founded_year)
      profile.founded_year = publicData.founded_year;
    if (publicData.org_type) profile.org_type = publicData.org_type;
    if (publicData.company_name)
      profile.company_name = publicData.company_name;

    profile.data_sources = [];
    if (websiteContent) profile.data_sources.push("website");
    if (Object.keys(publicData).length > 0)
      profile.data_sources.push("public_records");
    profile.data_sources.push("ai_analysis");

    return profile;
  } catch (error) {
    console.error("Claude analysis failed:", error);
    return {
      company_name: publicData.company_name || "",
      org_number: publicData.org_number || null,
      org_type: publicData.org_type || null,
      industry: "",
      description: "",
      employees: publicData.employees || null,
      revenue: publicData.revenue || null,
      location: publicData.location || "",
      founded_year: publicData.founded_year || null,
      focus_areas: [],
      website_url: websiteUrl,
      confidence: 0.1,
      data_sources: ["public_records"],
    };
  }
}

export async function researchCompany(input: string): Promise<CompanyProfile> {
  const trimmed = input.trim();
  const isOrgNumber = /^\d{6}-?\d{4}$/.test(trimmed);
  const isUrl = trimmed.includes(".") && !isOrgNumber;

  let websiteContent = "";
  let publicData: Partial<CompanyProfile> = {};
  let websiteUrl = "";

  if (isUrl) {
    websiteUrl = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

    const [content, lookup] = await Promise.all([
      fetchWebsiteContent(websiteUrl),
      lookupSwedishCompanyData(trimmed),
    ]);

    websiteContent = content;
    publicData = lookup;
  } else if (isOrgNumber) {
    publicData = await lookupSwedishCompanyData(trimmed);

    if (publicData.website_url) {
      websiteUrl = publicData.website_url;
      websiteContent = await fetchWebsiteContent(websiteUrl);
    }
  } else {
    publicData = await lookupSwedishCompanyData(trimmed);
  }

  return analyzeWithClaude(websiteContent, publicData, websiteUrl || trimmed);
}
