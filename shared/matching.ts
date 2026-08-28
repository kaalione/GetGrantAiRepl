import type { Grant, Company } from "@shared/schema";

export interface MatchResult {
  score: number;
  factors: MatchFactor[];
  explanation: string;
}

// Relevance side of a search profile ("what are we seeking funding for?").
// Eligibility factors (size, revenue, location) always read from the
// company; when a profile carries relevance data, industry/keyword factors
// read from it instead of the company's own industry/description.
export interface RelevanceProfile {
  kind?: string | null;
  description?: string | null;
  goals?: string | null;
  focusAreas?: string[] | null;
  keywords?: string[] | null;
}

export interface MatchFactor {
  name: string;
  points: number;
  maxPoints: number;
  met: boolean;
  description: string;
}

interface LegacyEligibilityCriteria {
  min_employees?: number;
  max_employees?: number;
  min_revenue?: number;
  max_revenue?: number;
  regions?: string[];
  industries?: string[];
  company_age?: number;
}

interface StructuredEligibilityCriteria {
  company_types?: string[];
  company_sizes?: {
    min_employees?: number | null;
    max_employees?: number | null;
    size_category?: string[];
    description?: string;
  };
  revenue?: {
    max_turnover_msek?: number | null;
    max_balance_msek?: number | null;
    description?: string;
  };
  geography?: {
    regions?: string[];
    counties?: string[];
    eu_countries?: boolean;
    description?: string;
  };
  sectors?: string[];
  company_age?: {
    min_years?: number | null;
    max_years?: number | null;
    description?: string;
  };
  collaboration_required?: {
    required?: boolean;
    partner_types?: string[];
    description?: string;
  };
  other_requirements?: string[];
  who_cannot_apply?: string[];
  funding_details?: {
    min_amount?: number | null;
    max_amount?: number | null;
    co_financing_required?: boolean;
    co_financing_percentage?: number | null;
    description?: string;
  };
  confidence_score?: number;
  extraction_date?: string;
  source_text_used?: string;
}

type EligibilityCriteria = LegacyEligibilityCriteria;

function isStructuredCriteria(criteria: unknown): criteria is StructuredEligibilityCriteria {
  return criteria !== null && typeof criteria === 'object' && 'confidence_score' in (criteria as Record<string, unknown>);
}

function convertStructuredToLegacy(structured: StructuredEligibilityCriteria): LegacyEligibilityCriteria {
  const legacy: LegacyEligibilityCriteria = {};
  if (structured.company_sizes?.min_employees != null) legacy.min_employees = structured.company_sizes.min_employees;
  if (structured.company_sizes?.max_employees != null) legacy.max_employees = structured.company_sizes.max_employees;
  if (structured.revenue?.max_turnover_msek != null) legacy.max_revenue = structured.revenue.max_turnover_msek * 1000000;
  if (structured.geography?.regions?.length) legacy.regions = structured.geography.regions;
  // "all" är ingen sektor — filtrera bort den men behåll resten av listan
  const sectors = (structured.sectors ?? []).filter(s => s.toLowerCase() !== 'all');
  if (sectors.length) legacy.industries = sectors;
  if (structured.company_age?.max_years != null) legacy.company_age = structured.company_age.max_years;
  return legacy;
}

// Kalibrerbara vikter för poängmodellen. Summan av alla max-vikter är 100 så
// att faktorpoängen kan läsas som procentbidrag. Kalibrerad mot
// scripts/test-matching-quality.ts.
export const MATCHING_WEIGHTS = {
  industryMax: 28,
  industryFloor: 0.7, // andel av max vid en sektormatch (sektorer tolkas som ELLER)
  industryNeutral: 9,
  sectorPenalty: -15,
  sizeMax: 15,
  sizeTargetGroupMatch: 9,
  sizeNeutral: 2,
  sizeMismatch: 2,
  revenueMax: 10,
  revenueNeutral: 2,
  regionMax: 15,
  regionNational: 9,
  regionInternational: 0, // EU-omfattande program konkurrerar i alla marknader — nationell närhet väger tyngre
  regionNeutral: 4,
  keywordMax: 24,
  keywordWeightLong: 14, // normaliserad längd ≥ 8 tecken ("digitalisering")
  keywordWeightMid: 4,   // 5–7 tecken ("energi")
  keywordWeightShort: 2, // ≤ 4 tecken ("it", "ai")
  keywordTitleCap: 4,    // max antal extra träffar från titeln
  keywordNeutral: 2,
  noDataScore: 25,
};

export function calculateMatchScore(company: Company | null, grant: Grant, profile?: RelevanceProfile | null): MatchResult {
  const factors: MatchFactor[] = [];

  if (!company) {
    return {
      score: 0,
      factors: [],
      explanation: "Skapa en företagsprofil för att se matchningspoäng."
    };
  }

  const structuredData = grant.structuredEligibility as unknown as StructuredEligibilityCriteria | null;
  const rawCriteria = grant.eligibilityCriteria;

  const hasStructuredData = structuredData && (
    structuredData.confidence_score != null ||
    structuredData.company_types ||
    structuredData.company_sizes ||
    structuredData.geography
  );
  const hasRawCriteria = rawCriteria && (
    isStructuredCriteria(rawCriteria) ||
    (typeof rawCriteria === 'object' && Object.keys(rawCriteria).length > 0)
  );
  const targetGroup = grant.targetGroup || [];
  const grantKeywords = grant.keywords || [];

  const lowConfidence = hasStructuredData &&
    structuredData!.confidence_score != null &&
    structuredData!.confidence_score < 0.3;

  if (!hasStructuredData && !hasRawCriteria && targetGroup.length === 0 && grantKeywords.length === 0) {
    return {
      score: MATCHING_WEIGHTS.noDataScore,
      factors: [{
        name: "Data saknas",
        points: MATCHING_WEIGHTS.noDataScore,
        maxPoints: 100,
        met: false,
        description: "Inga behörighetskriterier extraherade — uppskattad poäng"
      }],
      explanation: "Behörighetskriterier saknas för detta bidrag. Poängen är uppskattad."
    };
  }

  if (lowConfidence && targetGroup.length === 0 && grantKeywords.length === 0) {
    return {
      score: MATCHING_WEIGHTS.noDataScore,
      factors: [{
        name: "Låg konfidens",
        points: MATCHING_WEIGHTS.noDataScore,
        maxPoints: 100,
        met: false,
        description: "Behörighetskriterier har låg konfidens — uppskattad poäng"
      }],
      explanation: "Behörighetskriterier har låg tillförlitlighet. Poängen är uppskattad."
    };
  }

  let eligibility: EligibilityCriteria | null = null;
  if (hasStructuredData) {
    eligibility = convertStructuredToLegacy(structuredData!);
  } else if (rawCriteria && isStructuredCriteria(rawCriteria)) {
    eligibility = convertStructuredToLegacy(rawCriteria as unknown as StructuredEligibilityCriteria);
  } else {
    eligibility = rawCriteria as EligibilityCriteria | null;
  }

  // Relevance factors read from the selected search profile when it carries
  // data (project-based matching); otherwise from the company. In company
  // mode, focusAreas count as part of the relevance signal alongside industry.
  const profileFocus = profile?.focusAreas?.filter(Boolean) ?? [];
  const profileText = [profile?.description, profile?.goals, ...(profile?.keywords ?? [])]
    .filter(Boolean)
    .join(" ");
  const companyFocus = (company.focusAreas ?? []).filter(Boolean);
  const relevanceSource: Company = {
    ...company,
    industry: profileFocus.length > 0
      ? profileFocus.join(", ")
      : [company.industry, ...companyFocus].filter(Boolean).join(", "),
    description: profileText.length > 0 ? profileText : company.description,
  };

  // Industry match (30 points) — relevance
  const industryMatch = checkIndustryMatch(relevanceSource, targetGroup, eligibility);
  factors.push(industryMatch);

  // Employee size match (15 points) — eligibility
  const sizeMatch = checkEmployeeMatch(company, eligibility, targetGroup);
  factors.push(sizeMatch);

  // Revenue match (10 points) — eligibility
  const revenueMatch = checkRevenueMatch(company, eligibility);
  factors.push(revenueMatch);

  // Location match (15 points) — eligibility
  const locationMatch = checkLocationMatch(company, eligibility, targetGroup);
  factors.push(locationMatch);

  // Keywords overlap (30 points) — relevance
  const keywordsMatch = checkKeywordsMatch(relevanceSource, grantKeywords, grant.title || "");
  factors.push(keywordsMatch);

  const totalScore = factors.reduce((sum, f) => sum + f.points, 0);
  const maxScore = factors.reduce((sum, f) => sum + f.maxPoints, 0);
  const score = Math.max(0, Math.min(Math.round((totalScore / maxScore) * 100), 100));

  const metFactors = factors.filter(f => f.met).length;
  let explanation = "";
  if (score >= 80) {
    explanation = "Utmärkt matchning! Ditt företag uppfyller de flesta kriterier för detta bidrag.";
  } else if (score >= 60) {
    explanation = "Bra matchning. Ditt företag uppfyller flera av kriterierna.";
  } else if (score >= 40) {
    explanation = "Möjlig matchning. Kontrollera kraven noggrant.";
  } else if (score > 0) {
    explanation = "Låg matchning. Bidraget kan passa bättre för andra företagstyper.";
  } else {
    explanation = "Kan inte beräkna matchning. Fyll i företagsprofilen för bättre resultat.";
  }

  return { score, factors, explanation };
}

// Synonymtabellen är flerspråkig: bidragens sektorstermer är engelska
// (energy, environment, cleantech ...) medan deras nyckelord oftast är
// svenska/norska/finska (energi, klimat, hälsa ...). Värdelistorna innehåller
// därför båda vokabulären — sektormatchningen träffar de engelska termerna
// och nyckelordsmatchningen de nordiska.
const INDUSTRY_SYNONYMS: Record<string, string[]> = {
  "teknik": ["tech", "it", "digital", "software", "saas", "ai", "data", "ict", "digitalisering"],
  "tech": ["tech", "it", "digital", "software", "saas", "ai", "data", "ict", "digitalisering"],
  "it": ["tech", "it", "digital", "software", "saas", "ai", "data", "ict", "digitalisering"],
  "digitalisering": ["digital", "tech", "it", "digitalisering"],
  "digitalization": ["digital", "tech", "it", "digitalisering"],
  "digital": ["digital", "tech", "it", "digitalisering"],
  "hälsa": ["health", "life_science", "medtech", "biotech", "pharma", "hälsa", "sjukvård", "medisin", "helse"],
  "health": ["health", "life_science", "medtech", "biotech", "pharma", "hälsa", "sjukvård", "medisin", "helse"],
  "healthtech": ["health", "life_science", "medtech", "healthtech", "hälsa", "sjukvård", "klinisk"],
  "lifescience": ["life_science", "health", "biotech", "pharma", "medtech", "hälsa", "klinisk"],
  "energi": ["energy", "cleantech", "climate", "energi", "klimat", "solceller", "fornybar", "förnybar"],
  "energy": ["energy", "cleantech", "climate", "environment", "energi", "klimat", "fornybar", "förnybar"],
  "jordbruk": ["agriculture", "food", "agtech", "agritech", "rural", "jordbruk", "livsmedel", "landsbygd", "landbruk"],
  "agriculture": ["agriculture", "food", "agtech", "agritech", "rural", "jordbruk", "livsmedel", "landsbygd", "landbruk"],
  "agtech": ["agtech", "agritech", "agriculture", "food", "rural", "jordbruk", "livsmedel", "landsbygd"],
  "foodtech": ["food", "agriculture", "agtech", "livsmedel", "matsvinn"],
  "livsmedel": ["agriculture", "food", "agtech", "livsmedel", "jordbruk", "matsvinn"],
  "miljö": ["environment", "cleantech", "climate", "sustainability", "miljö", "klimat", "hållbarhet"],
  "environment": ["environment", "cleantech", "climate", "sustainability", "miljö", "klimat", "hållbarhet"],
  "sustainability": ["environment", "cleantech", "climate", "sustainability", "miljö", "klimat", "hållbarhet", "bærekraft"],
  "hållbarhet": ["environment", "cleantech", "climate", "sustainability", "miljö", "klimat", "hållbarhet"],
  "bygg": ["construction", "infrastructure", "bygg", "bostad", "fastighet"],
  "construction": ["construction", "infrastructure", "bygg", "bostad", "fastighet"],
  "transport": ["transport", "logistics", "mobility", "mobilitet"],
  "kultur": ["culture", "creative", "kultur", "konst", "kreativ"],
  "culture": ["culture", "creative", "kultur", "konst", "kreativ"],
  "creative": ["creative", "culture", "kultur", "kreativ", "media", "film"],
  "media": ["media", "creative", "culture", "film", "audiovisual"],
  "utbildning": ["education", "utbildning"],
  "education": ["education", "utbildning"],
  "tillverkning": ["manufacturing", "production", "industri", "tillverkning", "automation"],
  "manufacturing": ["manufacturing", "production", "industri", "tillverkning", "automation"],
  "automation": ["automation", "manufacturing", "industri", "robotik"],
  "export": ["export", "trade", "internationalization", "internationalisering"],
  "skog": ["forestry", "bioeconomy", "skog"],
  "marin": ["maritime", "marine", "ocean", "maritim"],
  "turism": ["tourism", "hospitality", "turism"],
  "handel": ["retail", "commerce", "trade", "handel"],
  "försvar": ["defense", "security", "försvar"],
  "rymd": ["space", "aerospace", "rymd"],
  "social": ["social", "welfare", "välfärd"],
  "fintech": ["fintech", "finance", "banking"],
  "medtech": ["medtech", "health", "life_science", "healthtech", "hälsa", "sjukvård", "klinisk"],
  "biotech": ["biotech", "life_science", "health", "pharma", "biotech", "klinisk", "medisin"],
  "pharma": ["pharma", "biotech", "life_science", "health", "legemiddel"],
  "cleantech": ["cleantech", "energy", "environment", "climate", "miljö", "klimat", "hållbarhet", "energi"],
  "saas": ["saas", "tech", "software", "digital", "it"],
  "software": ["software", "tech", "digital", "saas", "it"],
  "ai": ["ai", "tech", "digital", "data"],
  "quantum": ["quantum", "deeptech", "tech"],
  "deeptech": ["deeptech", "tech", "digital"],
};

// Mål-grupper som beskriver organisationstyp/storlek snarare än sektor —
// de ska inte ge branschstraff.
const NON_SECTOR_TARGETS = new Set([
  "startup", "sme", "nonprofit", "all", "micro", "small", "medium", "large",
  "large_enterprise", "enterprise", "sole_proprietor",
  "research", "public_sector", "government", "public", "higher_education",
]);

const SIZE_TARGETS = new Set([
  "startup", "sme", "micro", "small", "medium", "large", "large_enterprise",
  "enterprise", "sole_proprietor",
]);

const ORG_TYPE_TARGETS = new Set([
  "nonprofit", "research", "public_sector", "government", "public", "higher_education",
]);

// Kända läns-/regionnamn som ibland dyker upp i targetGroup ("skåne") —
// hanteras som regionssignal, inte sektor.
const NORDIC_REGIONS = new Set([
  "stockholm", "uppsala", "sodermanland", "ostergotland", "jonkoping",
  "kronoberg", "kalmar", "gotland", "blekinge", "skane", "halland",
  "vastra gotaland", "varmland", "orebro", "vastmanland", "dalarna",
  "gavleborg", "vasternorrland", "jamtland", "vasterbotten", "norrbotten",
  "oslo", "vestland", "trondelag", "uusimaa", "pirkanmaa",
]);

const CITY_TO_REGION: Record<string, string> = {
  "stockholm": "stockholm", "solna": "stockholm", "sodertalje": "stockholm",
  "goteborg": "vastra gotaland", "boras": "vastra gotaland", "trollhattan": "vastra gotaland",
  "malmo": "skane", "lund": "skane", "helsingborg": "skane", "kristianstad": "skane",
  "lulea": "norrbotten", "kiruna": "norrbotten", "boden": "norrbotten", "pitea": "norrbotten",
  "falun": "dalarna", "borlange": "dalarna",
  "ostersund": "jamtland",
  "vasteras": "vastmanland",
  "uppsala": "uppsala",
  "orebro": "orebro",
  "umea": "vasterbotten", "skelleftea": "vasterbotten",
  "sundsvall": "vasternorrland",
  "linkoping": "ostergotland", "norrkoping": "ostergotland",
  "jonkoping": "jonkoping",
  "vaxjo": "kronoberg",
  "kalmar": "kalmar",
  "karlstad": "varmland",
  "gavle": "gavleborg",
  "halmstad": "halland",
  "karlskrona": "blekinge",
  "visby": "gotland",
  "nykoping": "sodermanland", "eskilstuna": "sodermanland",
  "oslo": "oslo", "bergen": "vestland", "trondheim": "trondelag",
  "helsinki": "uusimaa", "helsingfors": "uusimaa", "espoo": "uusimaa",
  "tampere": "pirkanmaa",
};

// Regionvärden som betyder "öppet för hela landet" respektive "öppet för
// EU/internationellt" — nationella program är i regel mer träffsäkra för ett
// enskilt bolag än breda EU-utlysningar, så de får något högre poäng.
const NATIONAL_REGIONS = [
  "hela_sverige", "hela sverige", "hela landet", "hele landet", "hele norge",
  "sverige", "norge", "finland", "suomi", "national", "nationell", "nasjonal",
];
const INTERNATIONAL_REGIONS = [
  "eu", "europa", "europe", "ees", "eea", "norden", "nordic", "international", "internationell",
];

// Mallord och allmänord som inte får ge nyckelordsträffar från beskrivningen.
const DESCRIPTION_STOPWORDS = new Set([
  "company", "companies", "based", "focused", "founded", "with", "employees",
  "employee", "revenue", "million", "from", "this", "that", "their", "have",
  "which", "also", "about", "than", "more", "most", "other", "over", "such",
  "företag", "företaget", "grundat", "grundades", "anställda", "omsättning",
  "fokus", "inom", "samt", "eller", "genom", "efter", "under", "mellan",
]);

function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeTerm(str: string): string {
  return stripDiacritics(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenizeWords(text: string): string[] {
  return stripDiacritics(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Termexpansion och företagstermer beräknas för varje bidrag som poängsätts —
// små cachar gör listrendrering av hundratals bidrag billig.
const sectorCache = new Map<string, Set<string>>();
const termCache = new Map<string, Set<string>>();
const CACHE_LIMIT = 50;

function expandIndustryToSectors(industry: string): Set<string> {
  const cached = sectorCache.get(industry);
  if (cached) return cached;
  const sectors = new Set<string>();
  const words = industry.toLowerCase().split(/[\/\s,&]+/).filter(Boolean);
  for (const word of words) {
    sectors.add(word);
    sectors.add(normalizeTerm(word));
    const synonyms = INDUSTRY_SYNONYMS[word] ?? INDUSTRY_SYNONYMS[stripDiacritics(word)];
    if (synonyms) {
      for (const s of synonyms) {
        sectors.add(s);
        sectors.add(normalizeTerm(s));
      }
    }
  }
  if (sectorCache.size >= CACHE_LIMIT) sectorCache.clear();
  sectorCache.set(industry, sectors);
  return sectors;
}

function checkIndustryMatch(
  company: Company,
  targetGroup: string[],
  eligibility: EligibilityCriteria | null
): MatchFactor {
  const maxPoints = MATCHING_WEIGHTS.industryMax;
  const SECTOR_PENALTY = MATCHING_WEIGHTS.sectorPenalty;
  const NEUTRAL = MATCHING_WEIGHTS.industryNeutral;
  const industries = eligibility?.industries || [];
  const allTargets = Array.from(new Set(
    [...targetGroup, ...industries].map(t => t.toLowerCase()).filter(t => t !== 'all')
  ));

  const companyIndustry = company.industry?.toLowerCase() || "";

  const sectorTargets = allTargets.filter(t =>
    !NON_SECTOR_TARGETS.has(t) && !NORDIC_REGIONS.has(normalizeTerm(t))
  );

  if (sectorTargets.length === 0) {
    return {
      name: "Bransch",
      points: NEUTRAL,
      maxPoints,
      met: false,
      description: "Inga specifika branschkrav"
    };
  }

  if (!companyIndustry) {
    return {
      name: "Bransch",
      points: 0,
      maxPoints,
      met: false,
      description: "Ange bransch i profilen"
    };
  }

  const companySectors = expandIndustryToSectors(companyIndustry);
  const matchingCount = sectorTargets.filter(sector =>
    companySectors.has(sector) || companySectors.has(normalizeTerm(sector))
  ).length;
  const totalSectors = sectorTargets.length;

  if (matchingCount > 0) {
    // Sektorlistan tolkas som "riktar sig till någon av dessa" (OR): en
    // träff räcker för relevans, fler träffar / smalare bidrag ger mer.
    const matchRatio = matchingCount / totalSectors;
    const floor = MATCHING_WEIGHTS.industryFloor;
    const points = Math.round(maxPoints * (floor + (1 - floor) * matchRatio));
    return {
      name: "Bransch",
      points,
      maxPoints,
      met: true,
      description: `Din inriktning matchar ${matchingCount}/${totalSectors} av bidragets sektorer`
    };
  }

  return {
    name: "Bransch",
    points: SECTOR_PENALTY,
    maxPoints,
    met: false,
    description: `Branschfel: bidraget riktar sig till ${sectorTargets.slice(0, 3).join(", ")}`
  };
}

function matchesSizeTarget(target: string, employees: number | null, foundedYear: number | null, orgType: string): boolean {
  const age = foundedYear ? new Date().getFullYear() - foundedYear : null;
  switch (target) {
    case "startup":
      return (age !== null && age <= 7) || (employees !== null && employees <= 10 && (age === null || age <= 10));
    case "micro": return employees !== null && employees <= 9;
    case "small": return employees !== null && employees <= 49;
    case "medium": return employees !== null && employees >= 10 && employees <= 249;
    case "sme": return employees !== null && employees <= 249;
    case "large":
    case "large_enterprise": return employees !== null && employees >= 250;
    case "enterprise": return true;
    case "sole_proprietor": return employees !== null && employees <= 1;
    default: return false;
  }
}

function checkEmployeeMatch(
  company: Company,
  eligibility: EligibilityCriteria | null,
  targetGroup: string[]
): MatchFactor {
  const maxPoints = MATCHING_WEIGHTS.sizeMax;
  const NEUTRAL = MATCHING_WEIGHTS.sizeNeutral;
  const minEmployees = eligibility?.min_employees;
  const maxEmployees = eligibility?.max_employees;

  if (minEmployees !== undefined || maxEmployees !== undefined) {
    if (company.employees == null) {
      return {
        name: "Företagsstorlek",
        points: 0,
        maxPoints,
        met: false,
        description: "Ange antal anställda i profilen"
      };
    }

    const employees = company.employees;
    const meetsMin = minEmployees === undefined || employees >= minEmployees;
    const meetsMax = maxEmployees === undefined || employees <= maxEmployees;
    const met = meetsMin && meetsMax;

    let description = "";
    if (met) {
      description = `${employees} anställda uppfyller kravet`;
    } else if (!meetsMin) {
      description = `Kräver minst ${minEmployees} anställda`;
    } else {
      description = `Kräver max ${maxEmployees} anställda`;
    }

    return {
      name: "Företagsstorlek",
      points: met ? maxPoints : 0,
      maxPoints,
      met,
      description
    };
  }

  // Inget uttryckligt storlekskrav — läs signal ur målgruppen i stället.
  const tg = targetGroup.map(t => t.toLowerCase());
  const sizeTargets = tg.filter(t => SIZE_TARGETS.has(t));
  const orgType = (company.orgType || "").toLowerCase();

  if (sizeTargets.length > 0) {
    const matched = sizeTargets.some(t => matchesSizeTarget(t, company.employees ?? null, company.foundedYear ?? null, orgType));
    const nonprofitMatch = tg.includes("nonprofit") && /ideell|stiftelse|förening|forening/.test(orgType);
    if (matched || nonprofitMatch) {
      return {
        name: "Företagsstorlek",
        points: MATCHING_WEIGHTS.sizeTargetGroupMatch,
        maxPoints,
        met: true,
        description: `Målgrupp: ${sizeTargets.slice(0, 3).join(", ")}`
      };
    }
    return {
      name: "Företagsstorlek",
      points: MATCHING_WEIGHTS.sizeMismatch,
      maxPoints,
      met: false,
      description: `Riktar sig främst till: ${sizeTargets.slice(0, 3).join(", ")}`
    };
  }

  // Målgrupp finns men gäller bara organisationstyper som inte är företag
  // (forskning, offentlig sektor, ideell) — svag matchning för bolag.
  const hasAll = tg.includes("all");
  const orgTypeTargets = tg.filter(t => ORG_TYPE_TARGETS.has(t));
  if (!hasAll && orgTypeTargets.length > 0 && orgTypeTargets.length === tg.filter(t => NON_SECTOR_TARGETS.has(t)).length && tg.every(t => NON_SECTOR_TARGETS.has(t) || NORDIC_REGIONS.has(normalizeTerm(t)))) {
    const nonprofitMatch = tg.includes("nonprofit") && /ideell|stiftelse|förening|forening/.test(orgType);
    if (!nonprofitMatch) {
      return {
        name: "Företagsstorlek",
        points: MATCHING_WEIGHTS.sizeMismatch,
        maxPoints,
        met: false,
        description: `Riktar sig främst till: ${orgTypeTargets.slice(0, 3).join(", ")}`
      };
    }
  }

  return {
    name: "Företagsstorlek",
    points: NEUTRAL,
    maxPoints,
    met: false,
    description: "Inga storlekskrav"
  };
}

function checkRevenueMatch(
  company: Company,
  eligibility: EligibilityCriteria | null
): MatchFactor {
  const maxPoints = MATCHING_WEIGHTS.revenueMax;
  const minRevenue = eligibility?.min_revenue;
  const maxRevenue = eligibility?.max_revenue;

  if (minRevenue === undefined && maxRevenue === undefined) {
    return {
      name: "Omsättning",
      points: MATCHING_WEIGHTS.revenueNeutral,
      maxPoints,
      met: false,
      description: "Inga omsättningskrav"
    };
  }

  const revenue = company.revenue ? parseFloat(company.revenue) : null;
  if (!revenue) {
    return {
      name: "Omsättning",
      points: 0,
      maxPoints,
      met: false,
      description: "Ange omsättning i profilen"
    };
  }

  const meetsMin = minRevenue === undefined || revenue >= minRevenue;
  const meetsMax = maxRevenue === undefined || revenue <= maxRevenue;
  const met = meetsMin && meetsMax;

  let description = "";
  if (met) {
    description = `Omsättning uppfyller kravet`;
  } else if (!meetsMin) {
    description = `Kräver minst ${formatCurrency(minRevenue)} SEK`;
  } else {
    description = `Kräver max ${formatCurrency(maxRevenue)} SEK`;
  }

  return {
    name: "Omsättning",
    points: met ? maxPoints : 0,
    maxPoints,
    met,
    description
  };
}

function checkLocationMatch(
  company: Company,
  eligibility: EligibilityCriteria | null,
  targetGroup: string[]
): MatchFactor {
  const maxPoints = MATCHING_WEIGHTS.regionMax;
  const NEUTRAL = MATCHING_WEIGHTS.regionNeutral;

  // Regionnamn kan även ligga i targetGroup ("skåne") — räkna med dem.
  const tgRegions = targetGroup.filter(t => NORDIC_REGIONS.has(normalizeTerm(t)));
  const regions = [...(eligibility?.regions || []), ...tgRegions];

  if (regions.length === 0) {
    return {
      name: "Region",
      points: NEUTRAL,
      maxPoints,
      met: false,
      description: "Inga regionkrav"
    };
  }

  const normRegions = regions.map(r => stripDiacritics(r).toLowerCase().replace(/[_-]+/g, ' ').trim());
  const isNational = normRegions.some(r => NATIONAL_REGIONS.some(u => r === u || r.includes(u)));
  const isInternational = !isNational && normRegions.some(r => INTERNATIONAL_REGIONS.some(u => r === u || r.includes(u)));
  const universalPoints = isNational ? MATCHING_WEIGHTS.regionNational : isInternational ? MATCHING_WEIGHTS.regionInternational : 0;
  const universalDesc = isNational ? "Öppet för hela landet" : "Öppet för EU/internationellt";

  if (!company.location) {
    return {
      name: "Region",
      points: universalPoints,
      maxPoints,
      met: isNational || isInternational,
      description: (isNational || isInternational) ? universalDesc : "Ange företagets plats i profilen"
    };
  }

  const companyCity = stripDiacritics(company.location).toLowerCase().trim();
  const companyRegion = CITY_TO_REGION[companyCity.replace(/[^a-z]/g, '')] || "";

  const met = normRegions.some(r =>
    companyCity.includes(r) || r.includes(companyCity) ||
    (companyRegion && (r.includes(companyRegion) || companyRegion.includes(r)))
  );

  if (met) {
    return {
      name: "Region",
      points: maxPoints,
      maxPoints,
      met: true,
      description: `${company.location} ingår i målregioner`
    };
  }

  if (isNational || isInternational) {
    return {
      name: "Region",
      points: universalPoints,
      maxPoints,
      met: true,
      description: universalDesc
    };
  }

  return {
    name: "Region",
    points: 0,
    maxPoints,
    met: false,
    description: `Gäller: ${regions.slice(0, 3).join(", ")}`
  };
}

// Bygger företagets relevanstermer: bransch + fokusområden (synonymexpanderade),
// plats + län, samt meningsfulla ord ur beskrivningen.
function buildCompanyTerms(company: Company): Set<string> {
  const cacheKey = `${company.industry}|${company.description}|${company.location}|${company.employees}|${company.foundedYear}`;
  const cached = termCache.get(cacheKey);
  if (cached) return cached;
  const terms = new Set<string>();

  if (company.industry) {
    for (const t of expandIndustryToSectors(company.industry.toLowerCase())) {
      const n = normalizeTerm(t);
      if (n.length >= 2) terms.add(n);
    }
  }

  if (company.location) {
    const city = normalizeTerm(company.location);
    if (city.length >= 3) terms.add(city);
    const region = CITY_TO_REGION[city];
    if (region) terms.add(normalizeTerm(region));
  }

  if (company.description) {
    for (const word of tokenizeWords(company.description)) {
      if (word.length >= 4 && !DESCRIPTION_STOPWORDS.has(word)) {
        terms.add(word);
      }
    }
  }

  // Unga, små bolag matchar startup-inriktade utlysningar.
  const age = company.foundedYear ? new Date().getFullYear() - company.foundedYear : null;
  if ((age !== null && age <= 7) || (company.employees !== null && company.employees !== undefined && company.employees <= 10)) {
    terms.add("startup");
  }

  if (termCache.size >= CACHE_LIMIT) termCache.clear();
  termCache.set(cacheKey, terms);
  return terms;
}

// Två normaliserade termer matchar om de är identiska eller om den ena är
// ett prefix av den andra och prefixet är minst 6 tecken ("energi" ⊂
// "energieffektivisering", "digital" ⊂ "digitalisering"). Korta termer som
// "it"/"ai" kräver exakt träff så att de inte träffar godtyckliga ord.
function termsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && long.startsWith(short);
}

// Specifika nyckelord ("digitalisering", "energilagring") säger mycket mer
// än generiska ("it", "ai") — poängen per träff viktas därför på ordlängd.
function keywordWeight(normalized: string): number {
  if (normalized.length >= 8) return MATCHING_WEIGHTS.keywordWeightLong;
  if (normalized.length >= 5) return MATCHING_WEIGHTS.keywordWeightMid;
  return MATCHING_WEIGHTS.keywordWeightShort;
}

function checkKeywordsMatch(
  company: Company,
  grantKeywords: string[],
  grantTitle: string
): MatchFactor {
  const maxPoints = MATCHING_WEIGHTS.keywordMax;
  const NEUTRAL = MATCHING_WEIGHTS.keywordNeutral;

  const companyTerms = buildCompanyTerms(company);

  if (companyTerms.size === 0) {
    return {
      name: "Nyckelord",
      points: 0,
      maxPoints,
      met: false,
      description: "Lägg till bransch och beskrivning i profilen"
    };
  }

  // Matcha bidragets nyckelord mot företagets termer. Källor duplicerar ofta
  // samma begrepp i flera nyckelord ("digitalt", "digitalt/ai") — därför
  // begränsas antalet räknade träffar av antalet DISTINKTA företags-termer
  // som träffades, så att dubbletter inte ger dubbel poäng.
  const matchedKeywords: { keyword: string; weight: number }[] = [];
  const matchedTerms = new Set<string>();
  for (const keyword of grantKeywords) {
    const nk = normalizeTerm(keyword);
    if (nk.length < 2) continue;
    let hit = false;
    for (const term of companyTerms) {
      if (termsMatch(term, nk)) {
        matchedTerms.add(term);
        hit = true;
      }
    }
    if (hit) matchedKeywords.push({ keyword, weight: keywordWeight(nk) });
  }

  matchedKeywords.sort((a, b) => b.weight - a.weight);
  const countedKeywords = matchedKeywords.slice(0, Math.min(matchedKeywords.length, matchedTerms.size));

  // Titeln bär ofta den tydligaste signalen ("Klimatklivet", "Deep Tech
  // Accelerator") — räkna upp till två extra träffar därifrån.
  const titleWords = tokenizeWords(grantTitle);
  const titleTokens = new Set<string>(titleWords);
  for (let i = 0; i < titleWords.length - 1; i++) {
    titleTokens.add(titleWords[i] + titleWords[i + 1]);
  }
  let titleMatches = 0;
  const matchedTitleTerms: { term: string; weight: number }[] = [];
  for (const term of companyTerms) {
    if (matchedTerms.has(term)) continue;
    if (titleMatches >= MATCHING_WEIGHTS.keywordTitleCap) break;
    for (const tok of titleTokens) {
      if (termsMatch(term, tok)) {
        titleMatches++;
        matchedTitleTerms.push({ term, weight: keywordWeight(term) });
        break;
      }
    }
  }

  const matchedCount = countedKeywords.length + titleMatches;
  const met = matchedCount > 0;

  if (!met) {
    if (grantKeywords.length === 0) {
      return {
        name: "Nyckelord",
        points: NEUTRAL,
        maxPoints,
        met: false,
        description: "Inga specifika nyckelord"
      };
    }
    return {
      name: "Nyckelord",
      points: 0,
      maxPoints,
      met: false,
      description: `Sökord: ${grantKeywords.slice(0, 3).join(", ")}`
    };
  }

  const rawPoints = countedKeywords.reduce((sum, k) => sum + k.weight, 0)
    + matchedTitleTerms.reduce((sum, t) => sum + t.weight, 0);
  const points = Math.min(maxPoints, rawPoints);
  const shown = [
    ...countedKeywords.map(k => k.keyword),
    ...matchedTitleTerms.map(t => t.term),
  ].slice(0, 3);

  return {
    name: "Nyckelord",
    points,
    maxPoints,
    met,
    description: `Matchande: ${shown.join(", ")}`
  };
}

function formatCurrency(value: number | undefined): string {
  if (!value) return "0";
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`;
  }
  return value.toString();
}

export function getDeadlineUrgency(deadline: Date | string | null): "critical" | "warning" | "normal" | "none" {
  if (!deadline) return "none";
  
  const deadlineDate = typeof deadline === "string" ? new Date(deadline) : deadline;
  const now = new Date();
  const daysUntil = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntil < 0) return "none";
  if (daysUntil <= 7) return "critical";
  if (daysUntil <= 30) return "warning";
  return "normal";
}

export function formatDeadline(deadline: Date | string | null): string {
  if (!deadline) return "Inget slutdatum";
  
  const date = typeof deadline === "string" ? new Date(deadline) : deadline;
  return date.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

export function formatAmount(min: string | null, max: string | null): string {
  const minNum = min ? parseFloat(min) : undefined;
  const maxNum = max ? parseFloat(max) : undefined;
  
  if (!minNum && !maxNum) return "Ej angivet";
  if (minNum && !maxNum) return `Från ${formatCurrency(minNum)} SEK`;
  if (!minNum && maxNum) return `Upp till ${formatCurrency(maxNum)} SEK`;
  return `${formatCurrency(minNum)} - ${formatCurrency(maxNum)} SEK`;
}
