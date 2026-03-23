import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Loader2, Shield, ChevronDown, ChevronUp, RefreshCw, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import type { EligibilityCheckResult, EligibilityCriterion } from "@shared/schema";

interface EligibilityBadgeProps {
  grantId: string;
  variant?: "inline" | "panel";
  autoCheck?: boolean;
  showActions?: boolean;
}

const verdictConfig = {
  eligible: {
    icon: CheckCircle2,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-200 dark:border-green-800",
    badgeBg: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300",
  },
  partial: {
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    badgeBg: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
  },
  ineligible: {
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    badgeBg: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
  },
  unknown: {
    icon: HelpCircle,
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-border",
    badgeBg: "bg-muted text-muted-foreground",
  },
};

const statusIcons = {
  pass: CheckCircle2,
  fail: XCircle,
  warning: AlertTriangle,
  unknown: HelpCircle,
};

const statusColors = {
  pass: "text-green-600 dark:text-green-400",
  fail: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  unknown: "text-muted-foreground",
};

export function EligibilityBadge({ grantId, variant = "panel", autoCheck = false, showActions = true }: EligibilityBadgeProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(variant === "panel");
  const [autoCheckTriggered, setAutoCheckTriggered] = useState(false);

  const cachedQuery = useQuery<{ cached: boolean; result: EligibilityCheckResult | null; checkedAt?: string; source?: string }>({
    queryKey: [`/api/grants/${grantId}/eligibility-check`],
    staleTime: 5 * 60 * 1000,
  });

  const checkMutation = useMutation({
    mutationFn: async (forceRefresh: boolean) => {
      const res = await apiRequest("POST", `/api/grants/${grantId}/eligibility-check`, { forceRefresh });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/grants/${grantId}/eligibility-check`] });
    },
  });

  useEffect(() => {
    if (autoCheck && !autoCheckTriggered && cachedQuery.data && !cachedQuery.data.cached && !cachedQuery.data.result && !checkMutation.isPending) {
      setAutoCheckTriggered(true);
      checkMutation.mutate(false);
    }
  }, [autoCheck, autoCheckTriggered, cachedQuery.data, checkMutation.isPending]);

  const result: EligibilityCheckResult | null = checkMutation.data?.result || cachedQuery.data?.result || null;
  const isLoading = cachedQuery.isLoading || checkMutation.isPending;

  if (cachedQuery.isLoading) {
    return null;
  }

  if (!cachedQuery.data?.result && !checkMutation.data && !checkMutation.isPending && !autoCheck) {
    if (variant === "inline") return null;

    return (
      <Card data-testid="eligibility-check-prompt">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t('eligibility.checkTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('eligibility.checkDescription')}</p>
            </div>
            <Button
              size="sm"
              onClick={() => checkMutation.mutate(false)}
              disabled={checkMutation.isPending}
              data-testid="button-run-eligibility-check"
            >
              {checkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('eligibility.runCheck')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !result) {
    if (variant === "inline") {
      return (
        <Badge variant="secondary" className="text-xs gap-1" data-testid="eligibility-badge-loading">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('eligibility.checking')}
        </Badge>
      );
    }

    return (
      <Card data-testid="eligibility-panel-loading">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t('eligibility.checking')}</p>
              <p className="text-xs text-muted-foreground">{t('eligibility.checkingDesc')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  const config = verdictConfig[result.verdict];
  const VerdictIcon = config.icon;

  if (variant === "inline") {
    return (
      <Badge
        variant="secondary"
        className={`text-xs gap-1 ${config.badgeBg}`}
        data-testid={`eligibility-badge-${result.verdict}`}
      >
        <VerdictIcon className="h-3 w-3" />
        {t(`eligibility.verdict.${result.verdict}`)}
      </Badge>
    );
  }

  return (
    <Card className={`${config.bg} ${config.border} border`} data-testid={`eligibility-panel-${result.verdict}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <VerdictIcon className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{t('eligibility.checkTitle')}</p>
              <Badge variant="secondary" className={`text-xs ${config.badgeBg}`}>
                {t(`eligibility.verdict.${result.verdict}`)} &middot; {result.score}/100
              </Badge>
            </div>
            {result.summary && (
              <p className="text-sm text-muted-foreground mt-1" data-testid="eligibility-summary">{result.summary}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!checkMutation.isPending && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => checkMutation.mutate(true)}
                data-testid="button-refresh-eligibility"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            {checkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              data-testid="button-toggle-eligibility-details"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="space-y-3 pt-1">
            {result.criteria.length > 0 && (
              <div className="space-y-2" data-testid="eligibility-criteria-list">
                {result.criteria.map((criterion, idx) => (
                  <CriterionRow key={idx} criterion={criterion} />
                ))}
              </div>
            )}

            {result.strengths.length > 0 && (
              <div className="space-y-1" data-testid="eligibility-strengths">
                <p className="text-xs font-medium text-green-700 dark:text-green-400">{t('eligibility.strengths')}</p>
                {result.strengths.map((s, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                    {s}
                  </p>
                ))}
              </div>
            )}

            {result.blockers.length > 0 && (
              <div className="space-y-1" data-testid="eligibility-blockers">
                <p className="text-xs font-medium text-red-700 dark:text-red-400">{t('eligibility.blockers')}</p>
                {result.blockers.map((b, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <XCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                    {b}
                  </p>
                ))}
              </div>
            )}

            {result.warnings.length > 0 && (
              <div className="space-y-1" data-testid="eligibility-warnings">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t('eligibility.warnings')}</p>
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            {showActions && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <Button size="sm" variant="outline" asChild data-testid="button-update-profile">
                  <Link href="/company">
                    {t('eligibility.updateProfile')}
                  </Link>
                </Button>
                {result.verdict !== "ineligible" && (
                  <Button size="sm" asChild data-testid="button-proceed-to-application">
                    <Link href={`/bidrag/${grantId}/apply`}>
                      {t('eligibility.proceedToApplication')}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CriterionRow({ criterion }: { criterion: EligibilityCriterion }) {
  const StatusIcon = statusIcons[criterion.status];
  const color = statusColors[criterion.status];

  return (
    <div className="flex items-start gap-2 text-xs" data-testid={`criterion-${criterion.name}`}>
      <StatusIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="font-medium text-foreground">{criterion.name}:</span>
          <span className="text-muted-foreground">{criterion.companyValue}</span>
          <span className="text-muted-foreground/60">({criterion.requirement})</span>
        </div>
        <p className="text-muted-foreground">{criterion.explanation}</p>
      </div>
    </div>
  );
}

export function EligibilityInlineBadge({ grantId }: { grantId: string }) {
  return <EligibilityBadge grantId={grantId} variant="inline" autoCheck={false} showActions={false} />;
}
