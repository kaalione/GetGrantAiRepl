import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from 'react-i18next';
import { useLocation } from "wouter";
import { Building2, Star, Filter } from "lucide-react";
import { GrantCard } from "@/components/grants/grant-card";
import { GrantFiltersSidebar, type FilterState } from "@/components/grants/grant-filters-sidebar";
import { GrantCardSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/grants/empty-state";
import { SEO } from "@/components/seo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMarket } from "@/components/market-selector";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { useSearchProfiles } from "@/hooks/use-search-profiles";
import { calculateMatchScore } from "@/lib/matching";
import type { Grant, Company, Application, GrantBookmark } from "@shared/schema";

const initialFilters: FilterState = {
  search: "",
  status: "open,upcoming",
  source: "all",
  deadlineDays: "all",
  amountRange: [0, 50000000],
};

export default function Grants() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [activeTab, setActiveTab] = useState("all");
  const [showOnlyMatching, setShowOnlyMatching] = useState(true);
  const market = useMarket();

  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const company = companies?.[0] || null;
  const { selectedProfile } = useSearchProfiles();

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.source !== "all") params.set("source", filters.source);
    if (filters.deadlineDays !== "all") params.set("deadlineDays", filters.deadlineDays);
    if (filters.amountRange[0] > 0) params.set("amountMin", filters.amountRange[0].toString());
    if (filters.amountRange[1] < 50000000) params.set("amountMax", filters.amountRange[1].toString());
    if (showOnlyMatching && company) params.set("matchProfile", "true");
    // Selected search profile — consumed by the server once profile-based
    // relevance lands (spec E2); harmless extra param until then.
    if (selectedProfile && !selectedProfile.isDefault) params.set("profileId", selectedProfile.id);
    if (market) params.set("market", market);
    return params.toString();
  }, [filters, showOnlyMatching, company, market, selectedProfile]);

  const queryString = buildQueryString();
  const apiUrl = queryString ? `/api/grants?${queryString}` : "/api/grants";

  const { data: grants, isLoading } = useQuery<Grant[]>({
    queryKey: [apiUrl],
  });

  const { data: sources } = useQuery<string[]>({
    queryKey: ["/api/grants/sources"],
  });

  const { data: applications } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
    enabled: !!company,
  });

  interface EligibilityOverviewGrant {
    grantId: string;
    checksPassed: number;
    checksTotal: number;
  }

  interface EligibilityOverview {
    eligible: EligibilityOverviewGrant[];
    almost: EligibilityOverviewGrant[];
    not_eligible: EligibilityOverviewGrant[];
  }

  const { data: eligibilityOverview } = useQuery<EligibilityOverview>({
    queryKey: ["/api/grants/eligibility-overview"],
    enabled: !!company,
    staleTime: 5 * 60 * 1000,
  });

  const eligibilityByGrantId = useMemo(() => {
    if (!eligibilityOverview) return {};
    const map: Record<string, { status: 'eligible' | 'almost' | 'not_eligible'; passed: number; total: number }> = {};
    for (const g of eligibilityOverview.eligible) {
      map[g.grantId] = { status: 'eligible', passed: g.checksPassed, total: g.checksTotal };
    }
    for (const g of eligibilityOverview.almost) {
      map[g.grantId] = { status: 'almost', passed: g.checksPassed, total: g.checksTotal };
    }
    for (const g of eligibilityOverview.not_eligible) {
      map[g.grantId] = { status: 'not_eligible', passed: g.checksPassed, total: g.checksTotal };
    }
    return map;
  }, [eligibilityOverview]);

  const { data: bookmarks, isLoading: bookmarksLoading } = useQuery<(GrantBookmark & { grant: Grant })[]>({
    queryKey: ["/api/bookmarks"],
    enabled: activeTab === "bookmarks",
  });

  const applicationsByGrantId = useMemo(() => {
    if (!applications) return {};
    return applications.reduce((acc, app) => {
      if (app.grantId) {
        acc[app.grantId] = {
          id: app.id,
          status: app.status,
          submittedAt: app.submittedAt?.toString(),
        };
      }
      return acc;
    }, {} as Record<string, { id: string; status: string; submittedAt?: string }>);
  }, [applications]);

  const sortedGrants = useMemo(() => {
    if (!grants) return [];
    if (!showOnlyMatching || !company) return grants;
    return [...grants].sort((a, b) => {
      const scoreA = calculateMatchScore(company, a, selectedProfile).score;
      const scoreB = calculateMatchScore(company, b, selectedProfile).score;
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
  }, [grants, showOnlyMatching, company, selectedProfile]);

  const handleFilterChange = useCallback((key: keyof FilterState, value: unknown) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
  }, []);

  const hasActiveFilters = 
    filters.search !== "" ||
    filters.status !== "open,upcoming" ||
    filters.source !== "all" ||
    filters.deadlineDays !== "all" ||
    filters.amountRange[0] > 0 ||
    filters.amountRange[1] < 50000000;

  return (
    <>
      <SEO 
        title={t('grants.seoTitle')} 
        description={t('grants.seoDesc')}
        canonical="/bidrag"
      />
      <div className="space-y-6 min-w-0 overflow-hidden">
        <div className="min-w-0 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-grants-title">{t('grants.title')}</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base" data-testid="text-grants-subtitle">
              {t('grants.subtitle')}
            </p>
          </div>
          <ProfileSwitcher companyId={company?.id} />
        </div>

        {!companiesLoading && !company && (
          <Card className="p-4 sm:p-8 text-center border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 mb-6 overflow-hidden" data-testid="card-no-profile-banner">
            <Building2 className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">{t('grants.noProfileTitle')}</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {t('grants.noProfileDesc')}
            </p>
            <Button onClick={() => navigate('/company')} data-testid="button-create-profile-grants">
              <Building2 className="mr-2 h-4 w-4" />
              {t('grants.createProfile')}
            </Button>
          </Card>
        )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-grants">
          <TabsTrigger value="all" data-testid="tab-all-grants">{t('grants.allGrants')}</TabsTrigger>
          <TabsTrigger value="bookmarks" data-testid="tab-bookmarked">
            <Star className="h-4 w-4 mr-1" />
            {t('grants.bookmarked')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <div className="flex gap-6 min-w-0">
            <aside className="hidden lg:block w-64 shrink-0">
              <div className="sticky top-6 bg-card rounded-lg border p-4">
                <GrantFiltersSidebar
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  onClearFilters={clearFilters}
                  sources={sources || []}
                  isLoading={isLoading}
                />
              </div>
            </aside>

            <div className="flex-1 min-w-0 space-y-4">
              <div className="lg:hidden">
                <GrantFiltersSidebar
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  onClearFilters={clearFilters}
                  sources={sources || []}
                  isLoading={isLoading}
                />
              </div>

              {company && (
                <div className="flex items-center gap-2" data-testid="matching-toggle-container">
                  <Button
                    variant={showOnlyMatching ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowOnlyMatching(true)}
                    data-testid="button-show-matching"
                  >
                    <Filter className="h-3.5 w-3.5 mr-1.5" />
                    {t('grants.showMatching')}
                  </Button>
                  <Button
                    variant={!showOnlyMatching ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowOnlyMatching(false)}
                    data-testid="button-show-all"
                  >
                    {t('grants.showAll')}
                  </Button>
                </div>
              )}

              {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <GrantCardSkeleton key={i} />
                  ))}
                </div>
              ) : grants && grants.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground" data-testid="text-grants-count">
                    {t('grants.showingCount', { count: grants.length })}
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {sortedGrants.map((grant) => (
                      <GrantCard 
                        key={grant.id} 
                        grant={grant} 
                        company={company}
                        profile={selectedProfile} 
                        showMatchScore={!!company}
                        applicationInfo={applicationsByGrantId[grant.id] || null}
                        eligibilityStatus={eligibilityByGrantId[grant.id]?.status || null}
                        eligibilityDetail={eligibilityByGrantId[grant.id] ? t('eligibility.checksPassed', { passed: eligibilityByGrantId[grant.id].passed, total: eligibilityByGrantId[grant.id].total }) : undefined}
                      />
                    ))}
                  </div>
                </>
              ) : hasActiveFilters || showOnlyMatching ? (
                <EmptyState
                  title={t('grants.noMatching')}
                  description={t('grants.noMatchingDesc')}
                  actionLabel={showOnlyMatching && !hasActiveFilters ? t('grants.showAll') : t('grants.clearFilters')}
                  onAction={showOnlyMatching && !hasActiveFilters ? () => setShowOnlyMatching(false) : clearFilters}
                />
              ) : (
                <EmptyState
                  title={t('grants.noGrantsYet')}
                  description={t('grants.noGrantsDesc')}
                />
              )}

            </div>
          </div>
        </TabsContent>

        <TabsContent value="bookmarks" className="mt-4">
          {bookmarksLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <GrantCardSkeleton key={i} />
              ))}
            </div>
          ) : bookmarks && bookmarks.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4" data-testid="text-bookmarks-count">
                {t('grants.bookmarkedCount', { count: bookmarks.length })}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {bookmarks.map((b) => (
                  <GrantCard
                    key={b.id}
                    grant={b.grant}
                    company={company}
                        profile={selectedProfile}
                    showMatchScore={!!company}
                    applicationInfo={applicationsByGrantId[b.grant.id] || null}
                    eligibilityStatus={eligibilityByGrantId[b.grant.id]?.status || null}
                    eligibilityDetail={eligibilityByGrantId[b.grant.id] ? t('eligibility.checksPassed', { passed: eligibilityByGrantId[b.grant.id].passed, total: eligibilityByGrantId[b.grant.id].total }) : undefined}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={Star}
              title={t('grants.noBookmarks')}
              description={t('grants.noBookmarksDesc')}
            />
          )}
        </TabsContent>
      </Tabs>
      </div>
    </>
  );
}
