import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { CheckCircle2, XCircle, HelpCircle, AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { Company } from "@shared/schema";

interface EligibilityCheck {
  criterion: string;
  status: "met" | "not_met" | "unknown" | "partially_met";
  category: "hard" | "soft";
  details: string;
  companyValue: string | null;
  requiredValue: string | null;
  actionRequired: string | null;
}

interface EligibilityResult {
  grantId: string;
  grantTitle: string;
  overallStatus: "eligible" | "almost_eligible" | "not_eligible" | "unknown";
  score: number;
  checksCompleted: number;
  checksPassed: number;
  checks: EligibilityCheck[];
  nextSteps: string[];
  estimatedTimeToEligible: string | null;
}

const statusIcons = {
  met: <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />,
  not_met: <XCircle className="h-5 w-5 text-red-500 shrink-0" />,
  unknown: <HelpCircle className="h-5 w-5 text-amber-500 shrink-0" />,
  partially_met: <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />,
};

const criterionLabels: Record<string, string> = {
  org_type: "eligibility.orgTypeCheck",
  company_size: "eligibility.companySizeCheck",
  revenue: "eligibility.revenueCheck",
  geography: "eligibility.geographyCheck",
  sector: "eligibility.sectorCheck",
  company_age: "eligibility.companyAgeCheck",
  collaboration: "eligibility.collaborationCheck",
  co_financing: "eligibility.coFinancingCheck",
};

function getStatusColor(status: string): string {
  switch (status) {
    case "eligible": return "text-green-600";
    case "almost_eligible": return "text-amber-600";
    case "not_eligible": return "text-red-500";
    default: return "text-muted-foreground";
  }
}

function getProgressColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

export function EligibilityRoadmap({ grantId, company }: { grantId: string; company: Company | null }) {
  const { t } = useTranslation();

  const { data: result, isLoading } = useQuery<EligibilityResult>({
    queryKey: ["/api/grants", grantId, "eligibility"],
    enabled: !!company,
  });

  if (!company) {
    return (
      <Card data-testid="eligibility-no-profile">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            {t("eligibility.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">{t("eligibility.noProfile")}</p>
          <Link href="/foretag">
            <Button size="sm" data-testid="button-create-profile-eligibility">
              {t("eligibility.createProfile")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            {t("eligibility.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result || result.checksCompleted === 0) {
    return (
      <Card data-testid="eligibility-no-data">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            {t("eligibility.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("eligibility.noData")}</p>
        </CardContent>
      </Card>
    );
  }

  const statusLabel = result.overallStatus === "eligible"
    ? t("eligibility.eligible")
    : result.overallStatus === "almost_eligible"
    ? t("eligibility.almostEligible")
    : result.overallStatus === "not_eligible"
    ? t("eligibility.notEligible")
    : t("eligibility.unknown");

  return (
    <Card data-testid="eligibility-checklist">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {result.overallStatus === "eligible" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
          {result.overallStatus === "almost_eligible" && <AlertTriangle className="h-5 w-5 text-amber-500" />}
          {result.overallStatus === "not_eligible" && <XCircle className="h-5 w-5 text-red-500" />}
          {result.overallStatus === "unknown" && <HelpCircle className="h-5 w-5 text-muted-foreground" />}
          {t("eligibility.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className={`font-medium ${getStatusColor(result.overallStatus)}`} data-testid="text-eligibility-status">
              {statusLabel}
            </span>
            <span className="text-muted-foreground" data-testid="text-eligibility-score">
              {t("eligibility.checksPassed", { passed: result.checksPassed, total: result.checksCompleted })}
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all ${getProgressColor(result.score)}`}
              style={{ width: `${result.score}%` }}
              data-testid="progress-eligibility"
            />
          </div>
        </div>

        <div className="space-y-2">
          {result.checks.map((check, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b last:border-b-0" data-testid={`eligibility-check-${check.criterion}`}>
              {statusIcons[check.status]}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {t(criterionLabels[check.criterion] || check.criterion)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{check.details}</p>
                {check.status === "unknown" && check.actionRequired && (
                  <Link href="/foretag">
                    <span className="text-xs text-primary cursor-pointer inline-flex items-center gap-1 mt-1">
                      <ArrowRight className="h-3 w-3" />
                      {t("eligibility.updateProfile")}
                    </span>
                  </Link>
                )}
                {check.status === "not_met" && check.actionRequired && (
                  <p className="text-xs text-red-500 mt-0.5">{check.actionRequired}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {result.nextSteps.length > 0 && (
          <div className="pt-2">
            <p className="text-sm font-medium mb-2">{t("eligibility.nextSteps")}</p>
            <ol className="space-y-1">
              {result.nextSteps.map((step, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="font-medium text-foreground shrink-0">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {result.estimatedTimeToEligible && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {t("eligibility.estimatedTime")}: {result.estimatedTimeToEligible}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
