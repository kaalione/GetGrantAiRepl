import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface EligibilitySummary {
  grantId: string;
  grantTitle: string;
  source: string;
  deadline: string | null;
  score: number;
  checksPassed: number;
  checksTotal: number;
  nextSteps: string[];
  overallStatus: string;
}

interface EligibilityOverview {
  eligible: EligibilitySummary[];
  almost: EligibilitySummary[];
  not_eligible: EligibilitySummary[];
  counts: { eligible: number; almost: number; not_eligible: number };
}

function EligibilityGrantRow({ grant, status }: { grant: EligibilitySummary; status: "eligible" | "almost" | "not_eligible" }) {
  const { t } = useTranslation();

  const progressColor = grant.score >= 80
    ? "[&>div]:bg-green-500"
    : grant.score >= 50
      ? "[&>div]:bg-amber-500"
      : "[&>div]:bg-red-400";

  return (
    <Link href={`/bidrag/${grant.grantId}`}>
      <div
        className="py-2.5 px-3 rounded-md hover-elevate cursor-pointer border-b last:border-b-0"
        data-testid={`eligibility-grant-${grant.grantId}`}
      >
        <div className="flex items-center gap-3">
          {status === "eligible" && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
          {status === "almost" && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
          {status === "not_eligible" && <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{grant.grantTitle}</p>
            <p className="text-xs text-muted-foreground">{grant.source}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={status === "eligible" ? "default" : "secondary"} className="text-xs">
              {grant.checksPassed}/{grant.checksTotal}
            </Badge>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
        {status === "almost" && (
          <div className="mt-1.5 ml-7 space-y-1">
            <Progress
              value={grant.score}
              className={`h-1.5 ${progressColor}`}
              data-testid={`progress-eligibility-${grant.grantId}`}
            />
            {grant.nextSteps?.[0] && (
              <p className="text-xs text-muted-foreground truncate">
                {grant.nextSteps[0]}
              </p>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export function EligibilityDashboard() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<EligibilityOverview>({
    queryKey: ["/api/grants/eligibility-overview"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("eligibility.dashboard.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const total = data.counts.eligible + data.counts.almost + data.counts.not_eligible;

  return (
    <Card data-testid="eligibility-dashboard">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t("eligibility.dashboard.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-md bg-green-50 dark:bg-green-950/30" data-testid="stat-eligible">
            <p className="text-2xl font-bold text-green-600">{data.counts.eligible}</p>
            <p className="text-xs text-muted-foreground">{t("eligibility.dashboard.readyToApply")}</p>
          </div>
          <div className="text-center p-3 rounded-md bg-amber-50 dark:bg-amber-950/30" data-testid="stat-almost">
            <p className="text-2xl font-bold text-amber-600">{data.counts.almost}</p>
            <p className="text-xs text-muted-foreground">{t("eligibility.dashboard.almostThere")}</p>
          </div>
          <div className="text-center p-3 rounded-md bg-muted" data-testid="stat-not-eligible">
            <p className="text-2xl font-bold text-muted-foreground">{data.counts.not_eligible}</p>
            <p className="text-xs text-muted-foreground">{t("eligibility.dashboard.needsChanges")}</p>
          </div>
        </div>

        {total === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">{t("eligibility.dashboard.noEligible")}</p>
        )}

        {data.eligible.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-1 text-green-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("eligibility.dashboard.readyToApply")} ({data.counts.eligible} {t("eligibility.dashboard.grants")})
            </p>
            <div className="space-y-0.5">
              {data.eligible.slice(0, 5).map((grant) => (
                <EligibilityGrantRow key={grant.grantId} grant={grant} status="eligible" />
              ))}
            </div>
            {data.eligible.length > 5 && (
              <Link href="/bidrag">
                <Button variant="ghost" size="sm" className="w-full mt-1" data-testid="button-show-all-eligible">
                  {t("eligibility.dashboard.showAll")}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>
        )}

        {data.almost.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-1 text-amber-600 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("eligibility.dashboard.almostThere")} ({data.counts.almost} {t("eligibility.dashboard.grants")})
            </p>
            <div className="space-y-0.5">
              {data.almost.slice(0, 3).map((grant) => (
                <EligibilityGrantRow key={grant.grantId} grant={grant} status="almost" />
              ))}
            </div>
            {data.almost.length > 3 && (
              <Link href="/bidrag">
                <Button variant="ghost" size="sm" className="w-full mt-1" data-testid="button-show-all-almost">
                  {t("eligibility.dashboard.showAll")}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
