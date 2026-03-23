import type { Company, Grant } from "@shared/schema";

export type CheckStatus = "met" | "not_met" | "unknown" | "partially_met";
export type CheckCategory = "hard" | "soft";

export interface EligibilityCheck {
  criterion: string;
  status: CheckStatus;
  category: CheckCategory;
  details: string;
  companyValue: string | null;
  requiredValue: string | null;
  actionRequired: string | null;
}

export type OverallStatus = "eligible" | "almost_eligible" | "not_eligible" | "unknown";

export interface EligibilityResult {
  grantId: string;
  grantTitle: string;
  overallStatus: OverallStatus;
  score: number;
  checksCompleted: number;
  checksPassed: number;
  checks: EligibilityCheck[];
  nextSteps: string[];
  estimatedTimeToEligible: string | null;
}

interface StructuredCriteria {
  company_types?: string[];
  company_sizes?: {
    min_employees?: number | null;
    max_employees?: number | null;
    size_category?: string[];
    description?: string;
  };
  revenue?: {
    max_turnover_msek?: number | null;
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
    co_financing_required?: boolean;
    co_financing_percentage?: number | null;
    description?: string;
  };
  confidence_score?: number;
}

function isStructuredCriteria(criteria: any): criteria is StructuredCriteria {
  return criteria && typeof criteria === "object" && "confidence_score" in criteria && "company_types" in criteria;
}

export function checkEligibility(company: Company, grant: Grant): EligibilityResult {
  const criteria = grant.eligibilityCriteria as any;
  const checks: EligibilityCheck[] = [];

  if (!criteria || !isStructuredCriteria(criteria)) {
    return {
      grantId: grant.id,
      grantTitle: grant.title,
      overallStatus: "unknown",
      score: 0,
      checksCompleted: 0,
      checksPassed: 0,
      checks: [],
      nextSteps: [],
      estimatedTimeToEligible: null,
    };
  }

  const companyAny = company as any;

  if (criteria.company_types && criteria.company_types.length > 0) {
    const orgType = companyAny.orgType;
    if (!orgType) {
      checks.push({
        criterion: "org_type",
        status: "unknown",
        category: "hard",
        details: `Krav: ${criteria.company_types.map(formatOrgType).join(", ")}`,
        companyValue: null,
        requiredValue: criteria.company_types.join(", "),
        actionRequired: "Ange organisationsform i din profil",
      });
    } else if (criteria.company_types.includes(orgType)) {
      checks.push({
        criterion: "org_type",
        status: "met",
        category: "hard",
        details: `${formatOrgType(orgType)} godkänd`,
        companyValue: formatOrgType(orgType),
        requiredValue: criteria.company_types.map(formatOrgType).join(", "),
        actionRequired: null,
      });
    } else {
      checks.push({
        criterion: "org_type",
        status: "not_met",
        category: "hard",
        details: `${formatOrgType(orgType)} uppfyller inte kravet`,
        companyValue: formatOrgType(orgType),
        requiredValue: criteria.company_types.map(formatOrgType).join(", "),
        actionRequired: `Kräver: ${criteria.company_types.map(formatOrgType).join(" eller ")}`,
      });
    }
  }

  if (criteria.company_sizes) {
    const sizes = criteria.company_sizes;
    const empCount = company.employees;

    if (sizes.max_employees || sizes.min_employees) {
      if (!empCount) {
        checks.push({
          criterion: "company_size",
          status: "unknown",
          category: "hard",
          details: sizes.description || `Max ${sizes.max_employees || "?"} anställda`,
          companyValue: null,
          requiredValue: sizes.description || `${sizes.min_employees || 0}-${sizes.max_employees || "?"}`,
          actionRequired: "Ange antal anställda i din profil",
        });
      } else {
        const meetsMin = !sizes.min_employees || empCount >= sizes.min_employees;
        const meetsMax = !sizes.max_employees || empCount <= sizes.max_employees;

        if (meetsMin && meetsMax) {
          checks.push({
            criterion: "company_size",
            status: "met",
            category: "hard",
            details: `${empCount} anställda${sizes.max_employees ? ` av max ${sizes.max_employees}` : ""}`,
            companyValue: String(empCount),
            requiredValue: `${sizes.min_employees || 0}-${sizes.max_employees || "?"}`,
            actionRequired: null,
          });
        } else {
          checks.push({
            criterion: "company_size",
            status: "not_met",
            category: "hard",
            details: `${empCount} anställda uppfyller inte kravet`,
            companyValue: String(empCount),
            requiredValue: `${sizes.min_employees || 0}-${sizes.max_employees || "?"}`,
            actionRequired: `Kräver ${sizes.min_employees || 0}-${sizes.max_employees || "?"} anställda`,
          });
        }
      }
    }
  }

  if (criteria.revenue && criteria.revenue.max_turnover_msek) {
    const maxRev = criteria.revenue.max_turnover_msek;
    const companyRev = company.revenue ? Number(company.revenue) : null;

    if (!companyRev) {
      checks.push({
        criterion: "revenue",
        status: "unknown",
        category: "hard",
        details: criteria.revenue.description || `Max ${maxRev} MSEK`,
        companyValue: null,
        requiredValue: `Max ${maxRev} MSEK`,
        actionRequired: "Ange omsättning i din profil",
      });
    } else {
      const revMsek = companyRev / 1000000;
      if (revMsek <= maxRev) {
        checks.push({
          criterion: "revenue",
          status: "met",
          category: "hard",
          details: `${revMsek.toFixed(1)} MSEK av max ${maxRev} MSEK`,
          companyValue: `${revMsek.toFixed(1)} MSEK`,
          requiredValue: `Max ${maxRev} MSEK`,
          actionRequired: null,
        });
      } else {
        checks.push({
          criterion: "revenue",
          status: "not_met",
          category: "hard",
          details: `${revMsek.toFixed(1)} MSEK överstiger max ${maxRev} MSEK`,
          companyValue: `${revMsek.toFixed(1)} MSEK`,
          requiredValue: `Max ${maxRev} MSEK`,
          actionRequired: `Omsättningen överstiger maxgränsen`,
        });
      }
    }
  }

  if (criteria.geography && criteria.geography.regions && criteria.geography.regions.length > 0) {
    const regions = criteria.geography.regions;
    const isNationwide = regions.includes("hela_sverige");
    const companyLocation = company.location;

    if (isNationwide) {
      checks.push({
        criterion: "geography",
        status: "met",
        category: "soft",
        details: "Hela Sverige — inga regionala begränsningar",
        companyValue: companyLocation || null,
        requiredValue: "Hela Sverige",
        actionRequired: null,
      });
    } else if (!companyLocation) {
      checks.push({
        criterion: "geography",
        status: "unknown",
        category: "soft",
        details: criteria.geography.description || `Begränsat till: ${regions.join(", ")}`,
        companyValue: null,
        requiredValue: regions.join(", "),
        actionRequired: "Ange ort i din profil",
      });
    } else {
      const locationLower = companyLocation.toLowerCase();
      const matchesRegion = regions.some((r: string) => locationLower.includes(r.toLowerCase()));
      const counties = criteria.geography.counties || [];
      const matchesCounty = counties.some((c: string) => locationLower.includes(c.toLowerCase()));

      if (matchesRegion || matchesCounty) {
        checks.push({
          criterion: "geography",
          status: "met",
          category: "soft",
          details: `${companyLocation} inom stödregionen`,
          companyValue: companyLocation,
          requiredValue: regions.join(", "),
          actionRequired: null,
        });
      } else {
        checks.push({
          criterion: "geography",
          status: "partially_met",
          category: "soft",
          details: `${companyLocation} kanske inte inom stödregionen`,
          companyValue: companyLocation,
          requiredValue: regions.join(", "),
          actionRequired: "Kontrollera om ert geografiska läge kvalificerar",
        });
      }
    }
  }

  if (criteria.sectors && criteria.sectors.length > 0) {
    const companyIndustry = company.industry;
    const focusAreas = companyAny.focusAreas || [];

    if (!companyIndustry && focusAreas.length === 0) {
      checks.push({
        criterion: "sector",
        status: "unknown",
        category: "soft",
        details: `Riktade sektorer: ${criteria.sectors.join(", ")}`,
        companyValue: null,
        requiredValue: criteria.sectors.join(", "),
        actionRequired: "Ange bransch och fokusområden i din profil",
      });
    } else {
      const allCompanyTerms = [companyIndustry, ...focusAreas]
        .filter(Boolean)
        .map((s: string) => s.toLowerCase());
      const hasMatch = criteria.sectors.some((sector: string) =>
        allCompanyTerms.some((term: string) => term.includes(sector.toLowerCase()) || sector.toLowerCase().includes(term)),
      );

      if (hasMatch) {
        checks.push({
          criterion: "sector",
          status: "met",
          category: "soft",
          details: `Bransch matchar krav`,
          companyValue: companyIndustry || focusAreas.join(", "),
          requiredValue: criteria.sectors.join(", "),
          actionRequired: null,
        });
      } else {
        checks.push({
          criterion: "sector",
          status: "partially_met",
          category: "soft",
          details: `Ingen direkt branschmatch, men kan ändå kvalificera`,
          companyValue: companyIndustry || focusAreas.join(", "),
          requiredValue: criteria.sectors.join(", "),
          actionRequired: "Kontrollera om er verksamhet matchar kravprofilen",
        });
      }
    }
  }

  if (criteria.company_age && (criteria.company_age.min_years || criteria.company_age.max_years)) {
    const age = criteria.company_age;
    const foundedYear = company.foundedYear;
    const currentYear = new Date().getFullYear();

    if (!foundedYear) {
      checks.push({
        criterion: "company_age",
        status: "unknown",
        category: "hard",
        details: age.description || `${age.min_years ? `Min ${age.min_years} år` : ""}${age.max_years ? ` Max ${age.max_years} år` : ""}`,
        companyValue: null,
        requiredValue: age.description || `${age.min_years || 0}-${age.max_years || "?"}`,
        actionRequired: "Ange grundat år i din profil",
      });
    } else {
      const companyAge = currentYear - foundedYear;
      const meetsMin = !age.min_years || companyAge >= age.min_years;
      const meetsMax = !age.max_years || companyAge <= age.max_years;

      if (meetsMin && meetsMax) {
        checks.push({
          criterion: "company_age",
          status: "met",
          category: "hard",
          details: `Företagsålder ${companyAge} år uppfyller kravet`,
          companyValue: `${companyAge} år (grundat ${foundedYear})`,
          requiredValue: `${age.min_years || 0}-${age.max_years || "?"} år`,
          actionRequired: null,
        });
      } else {
        checks.push({
          criterion: "company_age",
          status: "not_met",
          category: "hard",
          details: `Företagsålder ${companyAge} år uppfyller inte kravet`,
          companyValue: `${companyAge} år (grundat ${foundedYear})`,
          requiredValue: `${age.min_years || 0}-${age.max_years || "?"} år`,
          actionRequired: `Kräver ${age.min_years || 0}-${age.max_years || "?"} år`,
        });
      }
    }
  }

  if (criteria.collaboration_required && criteria.collaboration_required.required) {
    const collab = criteria.collaboration_required;
    checks.push({
      criterion: "collaboration",
      status: "unknown",
      category: "soft",
      details: collab.description || `Samarbetspartner krävs: ${collab.partner_types?.join(", ") || "Ej specificerat"}`,
      companyValue: null,
      requiredValue: collab.partner_types?.join(", ") || "Samarbetspartner krävs",
      actionRequired: collab.partner_types && collab.partner_types.length > 0
        ? `Hitta samarbetspartner: ${collab.partner_types.join(", ")}`
        : "Säkerställ samarbetspartner",
    });
  }

  if (criteria.funding_details && criteria.funding_details.co_financing_required) {
    const funding = criteria.funding_details;
    checks.push({
      criterion: "co_financing",
      status: "unknown",
      category: "soft",
      details: funding.description || `${funding.co_financing_percentage || "?"}% medfinansiering krävs`,
      companyValue: null,
      requiredValue: `${funding.co_financing_percentage || "?"}%`,
      actionRequired: `Säkerställ ${funding.co_financing_percentage || "?"}% medfinansiering`,
    });
  }

  const checksCompleted = checks.length;
  const checksPassed = checks.filter((c) => c.status === "met").length;
  const hardFails = checks.filter((c) => c.category === "hard" && c.status === "not_met").length;
  const unknowns = checks.filter((c) => c.status === "unknown").length;

  const score = checksCompleted > 0 ? Math.round((checksPassed / checksCompleted) * 100) : 0;

  let overallStatus: OverallStatus;
  if (hardFails > 0) {
    overallStatus = "not_eligible";
  } else if (checksPassed === checksCompleted && checksCompleted > 0) {
    overallStatus = "eligible";
  } else if (score >= 50 || (checksCompleted > 0 && hardFails === 0)) {
    overallStatus = "almost_eligible";
  } else {
    overallStatus = "not_eligible";
  }

  const nextSteps = checks
    .filter((c) => c.status !== "met" && c.actionRequired)
    .sort((a, b) => {
      if (a.category === "hard" && b.category === "soft") return -1;
      if (b.category === "hard" && a.category === "soft") return 1;
      return 0;
    })
    .slice(0, 3)
    .map((c) => c.actionRequired!);

  let estimatedTimeToEligible: string | null = null;
  if (overallStatus === "almost_eligible") {
    const unknownCount = checks.filter((c) => c.status === "unknown").length;
    if (unknownCount > 0 && hardFails === 0) {
      estimatedTimeToEligible = "5 minuter (fyll i profilen)";
    } else {
      estimatedTimeToEligible = "2-4 veckor";
    }
  }

  return {
    grantId: grant.id,
    grantTitle: grant.title,
    overallStatus,
    score,
    checksCompleted,
    checksPassed,
    checks,
    nextSteps,
    estimatedTimeToEligible,
  };
}

function formatOrgType(type: string | null): string {
  if (!type) return "Okänd";
  const map: Record<string, string> = {
    aktiebolag: "Aktiebolag (AB)",
    enskild_firma: "Enskild firma",
    handelsbolag: "Handelsbolag (HB)",
    kommanditbolag: "Kommanditbolag (KB)",
    ekonomisk_forening: "Ekonomisk förening",
    ideell_forening: "Ideell förening",
    stiftelse: "Stiftelse",
    kommun: "Kommun",
    region: "Region",
    universitet: "Universitet/Högskola",
  };
  return map[type] || type;
}
