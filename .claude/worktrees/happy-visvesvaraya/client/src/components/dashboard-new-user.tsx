import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Building2, Sparkles, Target, FileText, ArrowRight, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ProgressTracker } from "@/components/progress-tracker";
import { MatchCardSkeleton } from "@/components/loading-skeleton";
import { SEO } from "@/components/seo";
import type { Grant, Company } from "@shared/schema";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface TopMatch extends Grant {
  matchScore: number;
}

interface ProfileCompletion {
  percentage: number;
  missing: string[];
  company?: Company;
}

export function DashboardNewUser() {
  const { t } = useTranslation();

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: profileCompletion } = useQuery<ProfileCompletion>({
    queryKey: ["/api/user/profile-completion"],
    retry: false,
  });

  const { data: topMatches, isLoading: matchesLoading } = useQuery<TopMatch[]>({
    queryKey: ["/api/grants/top-matches"],
  });

  const hasCompany = (companies?.length || 0) > 0;
  const companyName = companies?.[0]?.companyName;

  const fieldLabels: Record<string, string> = {
    companyName: t("dashboard.fieldLabels.companyName"),
    industry: t("dashboard.fieldLabels.industry"),
    employees: t("dashboard.fieldLabels.employees"),
    description: t("dashboard.fieldLabels.description"),
    location: t("dashboard.fieldLabels.location"),
    orgNumber: t("dashboard.fieldLabels.orgNumber"),
  };

  return (
    <>
      <SEO title="Dashboard" description={t("dashboard.subtitle")} noindex={true} />
      <div className="space-y-8 animate-fade-in">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 p-8 text-white">
          <div className="absolute inset-0 bg-grid-white/10" />
          <div className="relative z-10">
            <h1
              className="text-3xl font-bold tracking-tight mb-2"
              data-testid="text-new-user-welcome"
            >
              {companyName
                ? t("dashboard.newUser.welcomeHero", { name: companyName })
                : t("dashboard.newUser.welcomeHeroGeneric")}
            </h1>
            <p
              className="text-blue-100 max-w-xl"
              data-testid="text-new-user-subtitle"
            >
              {t("dashboard.newUser.heroSubtitle")}
            </p>
            <div className="mt-6 flex gap-3 flex-wrap">
              <Button
                variant="secondary"
                size="lg"
                asChild
                data-testid="button-new-user-explore"
              >
                <Link href="/bidrag">
                  <Target className="mr-2 h-5 w-5" />
                  {t("dashboard.exploreGrants")}
                </Link>
              </Button>
              {!hasCompany && (
                <Button
                  variant="outline"
                  size="lg"
                  className="bg-white/10 border-white/30 text-white"
                  asChild
                  data-testid="button-new-user-create-profile"
                >
                  <Link href="/company">
                    <Building2 className="mr-2 h-5 w-5" />
                    {t("dashboard.getStarted.createProfile")}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        <ProgressTracker />

        {profileCompletion &&
          profileCompletion.percentage < 90 &&
          hasCompany && (
            <Card
              className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20"
              data-testid="card-new-user-profile-completion"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                    <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg">
                        {t("dashboard.completeProfile.title")}
                      </h3>
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        {t("dashboard.completeProfile.progress", {
                          percent: profileCompletion.percentage,
                        })}
                      </span>
                    </div>
                    <Progress
                      value={profileCompletion.percentage}
                      className="h-2 mb-3"
                    />
                    <p className="text-sm text-muted-foreground mb-3">
                      {t("dashboard.completeProfile.description")}
                      {profileCompletion.missing.length > 0 && (
                        <>
                          {" "}
                          {t("dashboard.completeProfile.addFields", {
                            fields: profileCompletion.missing
                              .map((f) => fieldLabels[f] || f)
                              .join(", "),
                          })}
                        </>
                      )}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        data-testid="button-new-user-complete-profile"
                      >
                        <Link href="/company">
                          {t("dashboard.completeProfile.completeButton")}{" "}
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        asChild
                        data-testid="button-new-user-ai-profile"
                      >
                        <Link href="/company?ai=1">
                          {t("dashboard.completeProfile.useAi")}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

        <div data-testid="section-first-matches">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">
              {t("dashboard.newUser.firstMatches")}
            </h2>
          </div>
          {matchesLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              <MatchCardSkeleton />
              <MatchCardSkeleton />
              <MatchCardSkeleton />
            </div>
          ) : topMatches && topMatches.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {topMatches.slice(0, 3).map((match) => (
                <Link key={match.id} href={`/bidrag/${match.id}`}>
                  <Card
                    className="h-full hover-elevate cursor-pointer transition-shadow"
                    data-testid={`card-first-match-${match.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <Badge variant="secondary" className="text-xs">
                          {match.sourceName}
                        </Badge>
                        <div className="flex items-center gap-1 text-sm font-bold text-primary">
                          <Target className="h-4 w-4" />
                          {match.matchScore}%
                        </div>
                      </div>
                      <h3 className="font-medium mb-2 line-clamp-2">
                        {match.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {match.description?.substring(0, 100)}...
                      </p>
                      {match.deadline && (
                        <p className="text-xs text-muted-foreground">
                          {t("dashboard.deadline", {
                            date: format(
                              new Date(match.deadline),
                              "d MMMM yyyy",
                              { locale: sv }
                            ),
                          })}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="border-dashed" data-testid="card-no-matches-yet">
              <CardContent className="p-6 text-center">
                <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {t("dashboard.newUser.noMatchesYet")}
                </p>
                {!hasCompany && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    asChild
                    data-testid="button-create-profile-for-matches"
                  >
                    <Link href="/company">
                      {t("dashboard.getStarted.createProfile")}
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div data-testid="section-what-next">
          <h2 className="text-xl font-semibold mb-4">
            {t("dashboard.newUser.whatNext")}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Card
              className="relative overflow-hidden"
              data-testid="card-step-1"
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 shrink-0">
                    <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">
                    1
                  </div>
                </div>
                <h3 className="font-semibold mb-1">
                  {t("dashboard.newUser.step1Title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.newUser.step1Desc")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  asChild
                  data-testid="button-step-1-action"
                >
                  <Link href="/company">
                    {t("dashboard.getStarted.createProfile")}
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card
              className="relative overflow-hidden"
              data-testid="card-step-2"
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900 shrink-0">
                    <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-white text-xs font-bold shrink-0">
                    2
                  </div>
                </div>
                <h3 className="font-semibold mb-1">
                  {t("dashboard.newUser.step2Title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.newUser.step2Desc")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  asChild
                  data-testid="button-step-2-action"
                >
                  <Link href="/bidrag">
                    {t("dashboard.exploreGrants")}
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card
              className="relative overflow-hidden"
              data-testid="card-step-3"
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900 shrink-0">
                    <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white text-xs font-bold shrink-0">
                    3
                  </div>
                </div>
                <h3 className="font-semibold mb-1">
                  {t("dashboard.newUser.step3Title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.newUser.step3Desc")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  asChild
                  data-testid="button-step-3-action"
                >
                  <Link href="/bidrag">
                    {t("dashboard.exploreGrants")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
