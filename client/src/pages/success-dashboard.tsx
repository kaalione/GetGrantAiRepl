import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Trophy, Target, FileText, CheckCircle, Star, Clock, ArrowRight, TrendingUp } from "lucide-react";
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SEO } from "@/components/seo";
import { GrantCardSkeleton, StatsCardSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/grants/empty-state";
import type { Application, Company, Grant, GrantBookmark } from "@shared/schema";

interface DashboardStats {
  totalGrants: number;
  openGrants: number;
  totalApplications: number;
  draftApplications: number;
}

export default function SuccessDashboard() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { recentlyViewed } = useRecentlyViewed();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: applications, isLoading: appsLoading } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: bookmarks } = useQuery<(GrantBookmark & { grant: Grant })[]>({
    queryKey: ["/api/bookmarks"],
  });

  const company = companies?.[0];

  const submittedApps = applications?.filter(a => a.status === 'submitted') || [];
  const approvedApps = applications?.filter(a => a.status === 'approved') || [];
  const draftApps = applications?.filter(a => a.status === 'draft') || [];
  const totalApps = applications?.length || 0;
  const bookmarkCount = bookmarks?.length || 0;

  const milestones = [
    {
      id: 'profile',
      icon: Target,
      label: t('successDashboard.milestones.profileCreated'),
      completed: !!company,
    },
    {
      id: 'first_view',
      icon: FileText,
      label: t('successDashboard.milestones.firstGrantViewed'),
      completed: recentlyViewed.length > 0,
    },
    {
      id: 'first_bookmark',
      icon: Star,
      label: t('successDashboard.milestones.firstBookmark'),
      completed: bookmarkCount > 0,
    },
    {
      id: 'first_app',
      icon: FileText,
      label: t('successDashboard.milestones.firstApplication'),
      completed: totalApps > 0,
    },
    {
      id: 'first_submit',
      icon: CheckCircle,
      label: t('successDashboard.milestones.firstSubmission'),
      completed: submittedApps.length > 0 || approvedApps.length > 0,
    },
    {
      id: 'first_approval',
      icon: Trophy,
      label: t('successDashboard.milestones.firstApproval'),
      completed: approvedApps.length > 0,
    },
  ];

  const completedCount = milestones.filter(m => m.completed).length;
  const progressPercent = Math.round((completedCount / milestones.length) * 100);

  return (
    <>
      <SEO
        title={t('successDashboard.seoTitle')}
        description={t('successDashboard.seoDesc')}
        noindex={true}
      />
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-success-title">
            {t('successDashboard.title')}
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-success-subtitle">
            {t('successDashboard.subtitle')}
          </p>
        </div>

        <Card data-testid="card-milestones">
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                {t('successDashboard.milestones.title')}
              </CardTitle>
              <Badge variant="secondary" data-testid="badge-progress">
                {completedCount}/{milestones.length}
              </Badge>
            </div>
            <Progress value={progressPercent} className="mt-2" data-testid="progress-milestones" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {milestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className={`flex items-center gap-3 p-3 rounded-md border ${
                    milestone.completed
                      ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                      : 'border-dashed'
                  }`}
                  data-testid={`milestone-${milestone.id}`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    milestone.completed
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : 'bg-muted'
                  }`}>
                    <milestone.icon className={`h-4 w-4 ${
                      milestone.completed
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-muted-foreground'
                    }`} />
                  </div>
                  <span className={`text-sm font-medium ${
                    milestone.completed ? '' : 'text-muted-foreground'
                  }`}>
                    {milestone.label}
                  </span>
                  {milestone.completed && (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 ml-auto shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statsLoading ? (
            <>
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
            </>
          ) : (
            <>
              <Card data-testid="stat-total-apps">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalApps}</p>
                      <p className="text-xs text-muted-foreground">{t('successDashboard.stats.totalApplications')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="stat-submitted">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                      <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{submittedApps.length}</p>
                      <p className="text-xs text-muted-foreground">{t('successDashboard.stats.submitted')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="stat-approved">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{approvedApps.length}</p>
                      <p className="text-xs text-muted-foreground">{t('successDashboard.stats.approved')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="stat-bookmarks">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                      <Star className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{bookmarkCount}</p>
                      <p className="text-xs text-muted-foreground">{t('successDashboard.stats.savedGrants')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {appsLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <GrantCardSkeleton />
            <GrantCardSkeleton />
          </div>
        ) : submittedApps.length > 0 || approvedApps.length > 0 ? (
          <Card data-testid="card-recent-submissions">
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {t('successDashboard.recentSubmissions')}
                </CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/ansokan" data-testid="link-view-all-apps">
                    {t('common.viewAll')} <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...approvedApps, ...submittedApps].slice(0, 5).map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border"
                  data-testid={`submission-${app.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{t('successDashboard.applicationLabel')} #{app.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {app.status === 'approved' && app.approvedAmount
                        ? `${Number(app.approvedAmount).toLocaleString()} SEK`
                        : app.submissionMethod || ''}
                    </p>
                  </div>
                  <Badge variant={app.status === 'approved' ? 'default' : 'secondary'}>
                    {app.status === 'approved' ? t('successDashboard.statusApproved') : t('successDashboard.statusSubmitted')}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={Trophy}
            title={t('successDashboard.noSubmissions')}
            description={t('successDashboard.noSubmissionsDesc')}
            actionLabel={t('successDashboard.browseGrants')}
            onAction={() => navigate('/bidrag')}
          />
        )}

        {draftApps.length > 0 && (
          <Card data-testid="card-drafts">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('successDashboard.draftsInProgress')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {draftApps.slice(0, 5).map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border"
                  data-testid={`draft-${app.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{t('successDashboard.applicationLabel')} #{app.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {app.matchScore ? `${t('successDashboard.matchScore')}: ${app.matchScore}%` : ''}
                    </p>
                  </div>
                  <Badge variant="outline">{t('successDashboard.statusDraft')}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
