import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchProfiles } from "@/hooks/use-search-profiles";
import {
  Target, Brain, CheckCircle, AlertTriangle, ThumbsUp,
  Loader2, Shield, RefreshCw, HelpCircle, XCircle,
  CheckCircle2, ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { calculateMatchScore } from "@/lib/matching";
import { MatchExplanation } from "@/components/grants/match-explanation";
import { EligibilityChecklist } from "@/components/grants/eligibility-checklist";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { analytics } from "@/lib/analytics";
import type { Grant, Company, EligibilityCheckResult, EligibilityCriterion } from "@shared/schema";

interface SemanticMatchResult {
  grantId: string;
  companyId: string;
  score: number;
  reasoning: string;
  strengths: string[];
  concerns: string[];
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostSEK: number;
  };
}

interface MatchReportProps {
  grant: Grant;
  company: Company | null;
  hasCompany: boolean;
}

const statusIcons: Record<string, typeof CheckCircle2> = {
  pass: CheckCircle2,
  fail: XCircle,
  warning: AlertTriangle,
  unknown: HelpCircle,
};

const statusColors: Record<string, string> = {
  pass: "text-green-600 dark:text-green-400",
  fail: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  unknown: "text-muted-foreground",
};

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "text-green-500" : score >= 40 ? "text-amber-500" : "text-red-500";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className={`-rotate-90 transform`} width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`transition-all duration-500 ${color}`}
        />
      </svg>
      <span className="absolute text-lg font-bold">{score}%</span>
    </div>
  );
}

function CriterionRow({ criterion }: { criterion: EligibilityCriterion }) {
  const StatusIcon = statusIcons[criterion.status] || HelpCircle;
  const color = statusColors[criterion.status] || "text-muted-foreground";

  return (
    <div className="flex items-start gap-2 text-sm py-2 border-b last:border-b-0" data-testid={`criterion-${criterion.name}`}>
      <StatusIcon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="font-medium text-foreground">{criterion.name}:</span>
          <span className="text-muted-foreground">{criterion.companyValue}</span>
          <span className="text-muted-foreground/60">({criterion.requirement})</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{criterion.explanation}</p>
      </div>
    </div>
  );
}

export function MatchReport({ grant, company, hasCompany }: MatchReportProps) {
  const { selectedProfile } = useSearchProfiles();
  const { t } = useTranslation();
  const [semanticMatch, setSemanticMatch] = useState<SemanticMatchResult | null>(null);

  const matchResult = calculateMatchScore(company, grant, selectedProfile);
  const displayScore = semanticMatch ? semanticMatch.score : matchResult.score;

  const semanticMutation = useMutation({
    mutationFn: async () => {
      if (!grant || !company) return null;
      analytics.aiAnalysisStarted(grant.id);
      const response = await apiRequest("POST", "/api/grants/match", {
        grantId: grant.id,
        companyId: company.id,
        profileId: selectedProfile?.id,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data) {
        setSemanticMatch(data);
        analytics.aiAnalysisCompleted(grant.id, data.score, (data.tokenUsage?.inputTokens || 0) + (data.tokenUsage?.outputTokens || 0));
      }
    },
  });

  const eligibilityQuery = useQuery<{ cached: boolean; result: EligibilityCheckResult | null }>({
    queryKey: [`/api/grants/${grant.id}/eligibility-check`],
    staleTime: 5 * 60 * 1000,
    enabled: hasCompany,
  });

  const eligibilityMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/grants/${grant.id}/eligibility-check`, { forceRefresh: false });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/grants/${grant.id}/eligibility-check`] });
    },
  });

  const eligibilityResult: EligibilityCheckResult | null = eligibilityMutation.data?.result || eligibilityQuery.data?.result || null;

  return (
    <Card data-testid="match-report">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <ScoreRing score={displayScore} />
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              {t('grantDetail.matchAnalysis')}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {semanticMatch ? t('grantDetail.aiMatchScore') : t('grantDetail.ruleBasedMatch')}
            </p>
          </div>
        </div>
        {hasCompany && !semanticMatch && (
          <Button
            onClick={() => semanticMutation.mutate()}
            disabled={semanticMutation.isPending}
            data-testid="button-run-analysis"
          >
            {semanticMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('grantDetail.analyzing')}
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                {t('grantDetail.runAiAnalysis')}
              </>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!hasCompany ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-3">{t('grantDetail.createProfileForAi')}</p>
            <Button variant="outline" asChild>
              <Link href="/company" data-testid="link-create-profile">{t('grantApply.companyRequired.createProfile')}</Link>
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="overview" data-testid="match-report-tabs">
            <TabsList className="w-full" data-testid="match-report-tab-list">
              <TabsTrigger value="overview" data-testid="tab-overview">{t('grantDetail.tabOverview')}</TabsTrigger>
              <TabsTrigger value="eligibility" data-testid="tab-eligibility">{t('grantDetail.tabEligibility')}</TabsTrigger>
              <TabsTrigger value="concerns" data-testid="tab-concerns">{t('grantDetail.tabConcerns')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              {semanticMatch ? (
                <>
                  <p className="text-sm text-muted-foreground" data-testid="text-ai-reasoning">{semanticMatch.reasoning}</p>
                  {semanticMatch.strengths.length > 0 && (
                    <div data-testid="ai-strengths">
                      <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2 flex items-center gap-2">
                        <ThumbsUp className="h-4 w-4" />
                        {t('grantDetail.strengths')}
                      </h4>
                      <ul className="space-y-1">
                        {semanticMatch.strengths.map((s, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('grantDetail.cost', { cost: semanticMatch.tokenUsage.estimatedCostSEK })}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{matchResult.explanation}</p>
                    </div>
                  </div>
                  {matchResult.score >= 40 && (
                    <MatchExplanation grantId={grant.id} matchScore={matchResult.score} variant="expanded" />
                  )}
                  <EligibilityChecklist factors={matchResult.factors} />
                </>
              )}
            </TabsContent>

            <TabsContent value="eligibility" className="space-y-4 mt-4">
              {eligibilityQuery.isLoading || eligibilityMutation.isPending ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('eligibility.checking')}</span>
                </div>
              ) : eligibilityResult ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t('eligibility.checkTitle')}</span>
                      <Badge variant="secondary" className="text-xs" data-testid="eligibility-verdict-badge">
                        {t(`eligibility.verdict.${eligibilityResult.verdict}`)} · {eligibilityResult.score}/100
                      </Badge>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => eligibilityMutation.mutate()}
                      disabled={eligibilityMutation.isPending}
                      data-testid="button-refresh-eligibility"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>

                  {eligibilityResult.summary && (
                    <p className="text-sm text-muted-foreground" data-testid="eligibility-summary">{eligibilityResult.summary}</p>
                  )}

                  {eligibilityResult.criteria.length > 0 && (
                    <div data-testid="eligibility-criteria-list">
                      {eligibilityResult.criteria.map((criterion, idx) => (
                        <CriterionRow key={idx} criterion={criterion} />
                      ))}
                    </div>
                  )}

                  {eligibilityResult.strengths.length > 0 && (
                    <div className="space-y-1" data-testid="eligibility-strengths">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400">{t('eligibility.strengths')}</p>
                      {eligibilityResult.strengths.map((s, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                          {s}
                        </p>
                      ))}
                    </div>
                  )}

                  {eligibilityResult.blockers.length > 0 && (
                    <div className="space-y-1" data-testid="eligibility-blockers">
                      <p className="text-xs font-medium text-red-700 dark:text-red-400">{t('eligibility.blockers')}</p>
                      {eligibilityResult.blockers.map((b, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <XCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                          {b}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6" data-testid="eligibility-not-analysed">
                  <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">{t('grantDetail.notYetAnalysed')}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t('grantDetail.runEligibilityPrompt')}</p>
                  <Button
                    onClick={() => eligibilityMutation.mutate()}
                    disabled={eligibilityMutation.isPending}
                    data-testid="button-run-eligibility-check"
                  >
                    {eligibilityMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('eligibility.checking')}
                      </>
                    ) : (
                      <>
                        <Shield className="mr-2 h-4 w-4" />
                        {t('eligibility.runCheck')}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="concerns" className="space-y-4 mt-4">
              {semanticMatch && semanticMatch.concerns.length > 0 ? (
                <div data-testid="ai-concerns">
                  <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t('grantDetail.concerns')}
                  </h4>
                  <ul className="space-y-2">
                    {semanticMatch.concerns.map((c, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {matchResult.factors.filter(f => !f.met).length > 0 && (
                <div data-testid="rule-based-mismatches">
                  <h4 className="font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    {t('grantDetail.ruleMismatches')}
                  </h4>
                  <ul className="space-y-2">
                    {matchResult.factors.filter(f => !f.met).map((factor, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium text-foreground">{factor.name}</span>
                          <p className="text-xs">{factor.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {eligibilityResult?.warnings && eligibilityResult.warnings.length > 0 && (
                <div className="space-y-1" data-testid="eligibility-warnings">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t('eligibility.warnings')}</p>
                  {eligibilityResult.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {(!semanticMatch || semanticMatch.concerns.length === 0) &&
               matchResult.factors.filter(f => !f.met).length === 0 &&
               (!eligibilityResult?.warnings || eligibilityResult.warnings.length === 0) && (
                <div className="text-center py-6" data-testid="no-concerns">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-3" />
                  <p className="text-sm font-medium">{t('grantDetail.noConcerns')}</p>
                  <p className="text-sm text-muted-foreground">{t('grantDetail.noConcernsDesc')}</p>
                  {!semanticMatch && (
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => semanticMutation.mutate()}
                      disabled={semanticMutation.isPending}
                      data-testid="button-run-ai-for-concerns"
                    >
                      <Brain className="mr-2 h-4 w-4" />
                      {t('grantDetail.runAiAnalysis')}
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
