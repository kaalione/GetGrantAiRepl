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
  if (structured.sectors?.length && !structured.sectors.includes('all')) legacy.industries = structured.sectors;
  if (structured.company_age?.max_years != null) legacy.company_age = structured.company_age.max_years;
  return legacy;
}

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
      score: 35,
      factors: [{
        name: "Data saknas",
        points: 35,
        maxPoints: 100,
        met: false,
        description: "Inga behörighetskriterier extraherade — uppskattad poäng"
      }],
      explanation: "Behörighetskriterier saknas för detta bidrag. Poängen är uppskattad."
    };
  }

  if (lowConfidence && targetGroup.length === 0 && grantKeywords.length === 0) {
    return {
      score: 35,
      factors: [{
        name: "Låg konfidens",
        points: 35,
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
  // data (project-based matching); otherwise from the company as before.
  const profileFocus = profile?.focusAreas?.filter(Boolean) ?? [];
  const profileText = [profile?.description, profile?.goals, ...(profile?.keywords ?? [])]
    .filter(Boolean)
    .join(" ");
  const relevanceSource: Company = {
    ...company,
    industry: profileFocus.length > 0 ? profileFocus.join(", ") : company.industry,
    description: profileText.length > 0 ? profileText : company.description,
  };

  // Industry match (30 points) — relevance
  const industryMatch = checkIndustryMatch(relevanceSource, targetGroup, eligibility);
  factors.push(industryMatch);

  // Employee size match (20 points)
  const sizeMatch = checkEmployeeMatch(company, eligibility);
  factors.push(sizeMatch);

  // Revenue match (20 points)
  const revenueMatch = checkRevenueMatch(company, eligibility);
  factors.push(revenueMatch);

  // Location match (15 points)
  const locationMatch = checkLocationMatch(company, eligibility);
  factors.push(locationMatch);

  // Keywords overlap (15 points) — relevance
  const keywordsMatch = checkKeywordsMatch(relevanceSource, grantKeywords);
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

const INDUSTRY_SYNONYMS: Record<string, string[]> = {
  "teknik": ["tech", "it", "digital", "software", "saas", "ai", "data", "ict"],
  "it": ["tech", "it", "digital", "software", "saas", "ai", "data", "ict"],
  "hälsa": ["health", "life_science", "medtech", "biotech", "pharma"],
  "energi": ["energy", "cleantech", "climate"],
  "jordbruk": ["agriculture", "food", "agtech"],
  "livsmedel": ["agriculture", "food", "agtech"],
  "miljö": ["environment", "cleantech", "climate", "sustainability"],
  "bygg": ["construction", "infrastructure"],
  "transport": ["transport", "logistics", "mobility"],
  "kultur": ["culture", "creative"],
  "utbildning": ["education"],
  "tillverkning": ["manufacturing", "production"],
  "skog": ["forestry", "bioeconomy"],
  "marin": ["maritime", "marine", "ocean"],
  "turism": ["tourism", "hospitality"],
  "handel": ["retail", "commerce", "trade"],
  "försvar": ["defense", "security"],
  "rymd": ["space", "aerospace"],
  "social": ["social", "welfare"],
  "fintech": ["fintech", "finance", "banking"],
  "medtech": ["medtech", "health", "life_science"],
  "biotech": ["biotech", "life_science", "health", "pharma"],
  "cleantech": ["cleantech", "energy", "environment", "climate"],
  "saas": ["saas", "tech", "software", "digital", "it"],
  "software": ["software", "tech", "digital", "saas", "it"],
  "ai": ["ai", "tech", "digital", "data"],
};

function expandIndustryToSectors(industry: string): Set<string> {
  const sectors = new Set<string>();
  const words = industry.toLowerCase().split(/[\/\s,&]+/).filter(Boolean);
  for (const word of words) {
    sectors.add(word);
    const synonyms = INDUSTRY_SYNONYMS[word];
    if (synonyms) {
      for (const s of synonyms) sectors.add(s);
    }
  }
  return sectors;
}

function checkIndustryMatch(
  company: Company, 
  targetGroup: string[], 
  eligibility: EligibilityCriteria | null
): MatchFactor {
  const maxPoints = 30;
  const SECTOR_PENALTY = -15;
  const industries = eligibility?.industries || [];
  const hasSectorData = industries.length > 0 && !industries.every(i => i.toLowerCase() === 'all');
  const allTargets = [...targetGroup, ...industries].map(t => t.toLowerCase()).filter(t => t !== 'all');
  
  if (allTargets.length === 0) {
    return {
      name: "Bransch",
      points: Math.round(maxPoints * 0.3),
      maxPoints,
      met: false,
      description: "Inga specifika branschkrav"
    };
  }

  const companyIndustry = company.industry?.toLowerCase() || "";
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

  const sectorTargets = allTargets.filter(t =>
    !["startup", "sme", "nonprofit", "all", "micro", "small", "medium", "large"].includes(t)
  );

  if (sectorTargets.length === 0) {
    return {
      name: "Bransch",
      points: Math.round(maxPoints * 0.3),
      maxPoints,
      met: false,
      description: "Inga specifika branschkrav"
    };
  }

  const matchingCount = sectorTargets.filter(sector => companySectors.has(sector)).length;
  const totalSectors = sectorTargets.length;
  const matchRatio = matchingCount / totalSectors;

  if (matchRatio >= 0.5) {
    const points = Math.round(maxPoints * matchRatio);
    return {
      name: "Bransch",
      points,
      maxPoints,
      met: true,
      description: `Din bransch (${company.industry}) matchar ${matchingCount}/${totalSectors} sektorer`
    };
  }

  if (matchingCount === 1 && totalSectors >= 3) {
    return {
      name: "Bransch",
      points: 2,
      maxPoints,
      met: false,
      description: `Svag branschmatch: 1/${totalSectors} sektorer matchar`
    };
  }

  if (matchingCount > 0) {
    return {
      name: "Bransch",
      points: 8,
      maxPoints,
      met: false,
      description: `Delvis branschmatch: ${matchingCount}/${totalSectors} sektorer`
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

function checkEmployeeMatch(
  company: Company, 
  eligibility: EligibilityCriteria | null
): MatchFactor {
  const maxPoints = 20;
  const minEmployees = eligibility?.min_employees;
  const maxEmployees = eligibility?.max_employees;
  
  if (minEmployees === undefined && maxEmployees === undefined) {
    return {
      name: "Företagsstorlek",
      points: Math.round(maxPoints * 0.3),
      maxPoints,
      met: false,
      description: "Inga storlekskrav"
    };
  }

  if (!company.employees) {
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

function checkRevenueMatch(
  company: Company, 
  eligibility: EligibilityCriteria | null
): MatchFactor {
  const maxPoints = 20;
  const minRevenue = eligibility?.min_revenue;
  const maxRevenue = eligibility?.max_revenue;
  
  if (minRevenue === undefined && maxRevenue === undefined) {
    return {
      name: "Omsättning",
      points: Math.round(maxPoints * 0.3),
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
  eligibility: EligibilityCriteria | null
): MatchFactor {
  const maxPoints = 15;
  const regions = eligibility?.regions || [];
  
  if (regions.length === 0) {
    return {
      name: "Region",
      points: Math.round(maxPoints * 0.3),
      maxPoints,
      met: false,
      description: "Inga regionkrav"
    };
  }

  if (!company.location) {
    return {
      name: "Region",
      points: 0,
      maxPoints,
      met: false,
      description: "Ange företagets plats i profilen"
    };
  }

  const companyLocation = company.location.toLowerCase();
  const met = regions.some(r => 
    companyLocation.includes(r.toLowerCase()) || r.toLowerCase().includes(companyLocation)
  );

  return {
    name: "Region",
    points: met ? maxPoints : 0,
    maxPoints,
    met,
    description: met 
      ? `${company.location} ingår i målregioner` 
      : `Gäller: ${regions.slice(0, 3).join(", ")}`
  };
}

function checkKeywordsMatch(
  company: Company, 
  grantKeywords: string[]
): MatchFactor {
  const maxPoints = 15;
  
  if (grantKeywords.length === 0) {
    return {
      name: "Nyckelord",
      points: Math.round(maxPoints * 0.3),
      maxPoints,
      met: false,
      description: "Inga specifika nyckelord"
    };
  }

  if (!company.description) {
    return {
      name: "Nyckelord",
      points: 0,
      maxPoints,
      met: false,
      description: "Lägg till en beskrivning i profilen"
    };
  }

  const companyWords = company.description.toLowerCase().split(/\s+/);
  const matchedKeywords = grantKeywords.filter(keyword =>
    companyWords.some(word => 
      word.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(word)
    )
  );

  const matchedCount = matchedKeywords.length;
  const points = Math.min(maxPoints, matchedCount * 5);
  const met = matchedCount > 0;

  return {
    name: "Nyckelord",
    points,
    maxPoints,
    met,
    description: met 
      ? `Matchande: ${matchedKeywords.slice(0, 3).join(", ")}` 
      : `Sökord: ${grantKeywords.slice(0, 3).join(", ")}`
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
