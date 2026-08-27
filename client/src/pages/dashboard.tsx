import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileText, FolderOpen, Calendar, ArrowRight, TrendingUp, Bell, AlertTriangle, Target, Zap, User, Handshake, X, Briefcase, Activity, Settings2 } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatsCard } from "@/components/grants/stats-card";
import { StatsCardSkeleton, MatchCardSkeleton } from "@/components/loading-skeleton";
import { SEO } from "@/components/seo";
import { ProgressTracker } from "@/components/progress-tracker";
import { ProfileCompletionAlert } from "@/components/profile-completion-alert";
import { EligibilityDashboard } from "@/components/eligibility-dashboard";
import { UpgradePromptBanner } from "@/components/success-fee/upgrade-prompt";
import { DashboardNewUser } from "@/components/dashboard-new-user";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { useSearchProfiles } from "@/hooks/use-search-profiles";
import { useToast } from "@/hooks/use-toast";
import type { Grant, Company, GrantProject } from "@shared/schema";
import { calculateMatchScore } from "@/lib/matching";
import { format, differenceInDays } from "date-fns";
import { sv } from "date-fns/locale";

interface DeadlineItem {
  id: string;
  title: string;
  deadline: string;
  sourceName: string;
}

interface DashboardStats {
  totalGrants: number;
  openGrants: number;
  upcomingDeadlines: number;
  totalApplications: number;
  draftApplications: number;
  newGrantsThisWeek: number;
  deadlinesNext7Days: DeadlineItem[];
  notificationsSent: number;
}

interface ProfileCompletion {
  percentage: number;
  missing: string[];
  company?: Company;
}

interface TopMatch extends Grant {
  matchScore: number;
}

interface OnboardingProgress {
  completedCount: number;
  totalSteps: number;
}

interface AgreementsSummary {
  agreements: any[];
  summary: {
    totalActive: number;
    totalWon: number;
    totalFeesPaidSek: number;
    totalFeesOutstandingSek: number;
  };
}

function ActiveAgreementsIndicator() {
  const { t } = useTranslation();
  const { data } = useQuery<AgreementsSummary>({
    queryKey: ['/api/success-fee/agreements'],
    retry: false,
  });

  const activeCount = data?.summary?.totalActive || 0;
  if (activeCount === 0) return null;

  return (
    <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800" data-testid="active-agreements-indicator">
      <CardContent className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-medium">
              {t('dashboard.activeAgreements', { count: activeCount })}
            </span>
          </div>
          <Button variant="ghost" size="sm" asChild data-testid="btn-report-outcome">
            <Link href="/ansokan">
              {t('dashboard.reportOutcome')}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [profileBannerDismissed, setProfileBannerDismissed] = useState(false);
  const [showCompletionAlert, setShowCompletionAlert] = useState(true);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: profileCompletion } = useQuery<ProfileCompletion>({
    queryKey: ["/api/user/profile-completion"],
    retry: false,
  });

  const { selectedProfile } = useSearchProfiles();
  const isProjectPursuit = selectedProfile?.kind === "project";
  const pursuitMeta = [
    isProjectPursuit && selectedProfile?.budgetSek
      ? `${Number(selectedProfile.budgetSek).toLocaleString("sv-SE")} SEK`
      : null,
    isProjectPursuit ? selectedProfile?.timeframe : null,
  ].filter(Boolean).join(" · ");
  const pursuitSubtitle = isProjectPursuit && selectedProfile?.description
    ? selectedProfile.description
    : t('dashboard.subtitle');
  const { data: topMatches, isLoading: matchesLoading } = useQuery<TopMatch[]>({
    queryKey: [
      selectedProfile && !selectedProfile.isDefault
        ? `/api/grants/top-matches?profileId=${selectedProfile.id}`
        : "/api/grants/top-matches",
    ],
  });

  // /api/projects returns completionPercentage computed from milestone progress.
  const { data: projects } = useQuery<(GrantProject & { completionPercentage?: number | null })[]>({
    queryKey: ["/api/projects"],
  });

  const { data: progress } = useQuery<OnboardingProgress>({
    queryKey: ["/api/user/onboarding-progress"],
    retry: false,
  });

  const { data: grants } = useQuery<Grant[]>({
    queryKey: ["/api/grants"],
  });

  const activeProjects = (projects || []).filter(p => p.status === "active").slice(0, 3);
  const hasCompany = (companies?.length || 0) > 0;

  const company = companies?.[0] || null;

  const urgentDeadlineGrants = useMemo(() => {
    const grantsArray = Array.isArray(grants) ? grants : [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return grantsArray
      .filter((g) => {
        if (!g.deadline) return false;
        const deadline = new Date(g.deadline);
        const daysLeft = Math.ceil(
          (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysLeft >= 0 && daysLeft <= 14;
      })
      .map((g) => {
        const scoreResult = company
          ? calculateMatchScore(company, g, selectedProfile)
          : null;
        return { ...g, matchScore: scoreResult?.score ?? 0 };
      })
      .filter((g) => !company || g.matchScore >= 25)
      .sort((a, b) =>
        new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
      )
      .slice(0, 5);
  }, [grants, company, selectedProfile]);

  const profilePct = profileCompletion?.percentage ?? 0;
  const totalInteractions = progress?.completedCount ?? 0;
  const isNewUser = profilePct < 40 && totalInteractions < 2;

  if (isNewUser && !companiesLoading) {
    return <DashboardNewUser />;
  }

  const fieldLabels: Record<string, string> = {
    companyName: t('dashboard.fieldLabels.companyName'),
    industry: t('dashboard.fieldLabels.industry'),
    employees: t('dashboard.fieldLabels.employees'),
    description: t('dashboard.fieldLabels.description'),
    location: t('dashboard.fieldLabels.location'),
    orgNumber: t('dashboard.fieldLabels.orgNumber'),
  };

  return (
    <>
      <SEO
        title="Dashboard"
        description={t('dashboard.subtitle')}
        noindex={true}
      />
      <div className="space-y-8 animate-fade-in">
        {/* Pursuit header — the selected search profile frames everything
            below it, replacing the decorative gradient banner. */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-foreground">
                {isProjectPursuit
                  ? t('dashboard.pursuit.project', 'Projektsatsning')
                  : t('dashboard.pursuit.core', 'Kärnverksamhet')}
              </span>
              {pursuitMeta && (
                <span className="text-xs text-muted-foreground" data-testid="text-pursuit-meta">{pursuitMeta}</span>
              )}
            </div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight" data-testid="text-dashboard-title">
              {selectedProfile?.name || company?.companyName || t('dashboard.welcome')}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground" data-testid="text-dashboard-subtitle">
              {pursuitSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasCompany && <ProfileSwitcher companyId={company?.id} />}
            <Button asChild data-testid="button-explore-grants">
              <Link href="/bidrag">
                <Target className="mr-2 h-4 w-4" />
                {t('dashboard.exploreGrants')}
              </Link>
            </Button>
            {hasCompany && (
              <Button variant="outline" asChild data-testid="button-my-applications">
                <Link href="/ansokan">
                  <FileText className="mr-2 h-4 w-4" />
                  {t('dashboard.myApplications')}
                </Link>
              </Button>
            )}
          </div>
        </div>

        {hasCompany && companies?.[0] && showCompletionAlert && (profileCompletion?.percentage ?? 100) >= 70 && (
          <ProfileCompletionAlert
            profile={companies[0]}
            onDismiss={() => setShowCompletionAlert(false)}
          />
        )}

        {profileCompletion && profileCompletion.percentage < 70 && hasCompany && !profileBannerDismissed && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 animate-fade-in-up" data-testid="card-profile-completion-banner">
            <CardContent className="p-6">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                  <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <h3 className="font-semibold text-lg">{t('dashboard.completeProfile.title')}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        {t('dashboard.completeProfile.progress', { percent: profileCompletion.percentage })}
                      </span>
                      <button
                        onClick={() => setProfileBannerDismissed(true)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                        aria-label="Dismiss"
                        data-testid="button-dismiss-profile-banner"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <Progress value={profileCompletion.percentage} className="h-2 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('dashboard.completeProfile.description')}
                    {profileCompletion.missing.length > 0 && (
                      <> {t('dashboard.completeProfile.addFields', { fields: profileCompletion.missing.map(f => fieldLabels[f] || f).join(', ') })}</>
                    )}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/company">
                        {t('dashboard.completeProfile.completeButton')} <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                    {profileCompletion.percentage < 40 && (
                      <Button size="sm" variant="default" asChild data-testid="button-resume-onboarding">
                        <Link href="/company?ai=1">
                          {t('dashboard.completeProfile.useAi')}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {urgentDeadlineGrants.length > 0 && (
          <div data-testid="section-deadline-alerts">
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-5 w-5" />
                    {t('dashboard.deadlines.soonTitle')}
                  </CardTitle>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/bidrag?deadlineDays=14" data-testid="link-view-deadlines-14d">
                      {t('common.viewAll')} <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {urgentDeadlineGrants.map((grant) => {
                    const daysLeft = differenceInDays(new Date(grant.deadline!), new Date());
                    return (
                      <Link key={grant.id} href={`/bidrag/${grant.id}`}>
                        <div className="flex items-center justify-between p-3 rounded-md bg-background hover-elevate cursor-pointer" data-testid={`deadline-grant-${grant.id}`}>
                          <div className="min-w-0 flex-1 mr-4">
                            <p className="font-medium truncate">{grant.title}</p>
                            <p className="text-sm text-muted-foreground">{grant.sourceName}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <Badge variant={daysLeft <= 1 ? "destructive" : daysLeft <= 3 ? "default" : "secondary"}>
                              {daysLeft <= 0 ? t('common.today') : t('common.daysLeft', { count: daysLeft })}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(grant.deadline!), "d MMMM", { locale: sv })}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {statsLoading || companiesLoading ? (
            <>
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
            </>
          ) : (
            <>
              <StatsCard
                title={t('dashboard.stats.availableGrants')}
                value={stats?.openGrants || 0}
                subtitle={t('dashboard.stats.totalInDb', { count: stats?.totalGrants || 0 })}
                icon={FileText}
              />
              <StatsCard
                title={t('dashboard.stats.newThisWeek')}
                value={stats?.newGrantsThisWeek || 0}
                subtitle={t('dashboard.stats.last7Days')}
                icon={TrendingUp}
              />
              <StatsCard
                title={t('dashboard.stats.ongoingDrafts')}
                value={stats?.draftApplications || 0}
                subtitle={t('dashboard.stats.totalApplications', { count: stats?.totalApplications || 0 })}
                icon={FolderOpen}
              />
              <StatsCard
                title={t('dashboard.stats.expiringSoon')}
                value={stats?.upcomingDeadlines || 0}
                subtitle={t('dashboard.stats.within30Days')}
                icon={Calendar}
              />
              <StatsCard
                title={t('dashboard.stats.sentNotifications')}
                value={stats?.notificationsSent || 0}
                subtitle={t('dashboard.stats.emails')}
                icon={Bell}
              />
            </>
          )}
        </div>

        {hasCompany && (matchesLoading || (topMatches && topMatches.length > 0)) && (
          <div className="animate-fade-in-up animate-delay-200">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">{t('dashboard.topMatches')}</h2>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/bidrag" data-testid="link-view-all-matches">
                  {t('common.viewAll')} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            {matchesLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <MatchCardSkeleton />
                <MatchCardSkeleton />
                <MatchCardSkeleton />
              </div>
            ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {topMatches!.slice(0, 3).map((match) => (
                <Link key={match.id} href={`/bidrag/${match.id}`}>
                  <Card className="h-full hover-elevate cursor-pointer transition-shadow">
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
                      <h3 className="font-medium mb-2 line-clamp-2">{match.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {match.description?.substring(0, 100)}...
                      </p>
                      {match.deadline && (
                        <p className="text-xs text-muted-foreground">
                          {t('dashboard.deadline', { date: format(new Date(match.deadline), "d MMMM yyyy", { locale: sv }) })}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
            )}
          </div>
        )}

        <ProgressTracker compact />

        {hasCompany && (
          <div className="animate-fade-in-up animate-delay-225">
            <EligibilityDashboard />
          </div>
        )}

        {activeProjects.length > 0 && (
          <div className="animate-fade-in-up animate-delay-225">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                {t('dashboard.activeProjects')}
              </h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/projekt" data-testid="link-view-all-projects">
                  {t('common.viewAll')} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {activeProjects.map((project) => {
                const healthColor = project.healthStatus === 'on_track' ? 'text-green-600 dark:text-green-400' :
                  project.healthStatus === 'at_risk' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
                const healthLabel = project.healthStatus === 'on_track' ? 'På spår' :
                  project.healthStatus === 'at_risk' ? 'Risk' : 'Försenat';
                return (
                  <Link key={project.id} href={`/projekt/${project.id}`}>
                    <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-project-${project.id}`}>
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-sm line-clamp-2" data-testid={`text-project-title-${project.id}`}>{project.title}</h3>
                          <Badge variant="outline" className={`shrink-0 text-xs ${healthColor}`}>
                            <Activity className="mr-1 h-3 w-3" />
                            {healthLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{project.funder}</p>
                        {project.approvedAmountSek && (
                          <p className="text-sm font-medium">
                            {new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(project.approvedAmountSek)}
                          </p>
                        )}
                        {project.completionPercentage !== null && project.completionPercentage !== undefined && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{t('projects.progress', 'Framsteg')}</span>
                              <span>{project.completionPercentage}%</span>
                            </div>
                            <Progress value={project.completionPercentage} className="h-1.5" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <ActiveAgreementsIndicator />

        <UpgradePromptBanner />

        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => toast({ description: t('dashboard.customiseComingSoon') })}
            data-testid="button-customise-dashboard"
          >
            <Settings2 className="mr-2 h-4 w-4" />
            {t('dashboard.customiseDashboard')}
          </Button>
        </div>
      </div>
    </>
  );
}
