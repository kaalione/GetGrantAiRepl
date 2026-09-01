import { FundingBenchmark } from "@/components/grants/funding-benchmark";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useEffect } from "react";
import { ArrowLeft, Calendar, Banknote, ExternalLink, Building2, FileText, Sparkles, CheckCircle, Star, MapPin, Users, Briefcase, HandshakeIcon, XCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Grant, Company } from "@shared/schema";
import { format, differenceInDays } from "date-fns";
import { sv } from "date-fns/locale";
import { useSearchProfiles } from "@/hooks/use-search-profiles";
import { calculateMatchScore } from "@shared/matching";
import { MatchReport } from "@/components/grants/MatchReport";
import { useTranslation } from 'react-i18next';
import { analytics } from '@/lib/analytics';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useBookmark } from '@/hooks/useBookmark';
import { SEO } from '@/components/seo';

const ORG_TYPE_LABELS: Record<string, string> = {
  aktiebolag: "Aktiebolag (AB)",
  enskild_firma: "Enskild firma",
  handelsbolag: "Handelsbolag",
  kommanditbolag: "Kommanditbolag",
  ekonomisk_forening: "Ekonomisk förening",
  ideell_forening: "Ideell förening",
  stiftelse: "Stiftelse",
  kommun: "Kommun",
  region: "Region",
  statlig_myndighet: "Statlig myndighet",
  universitet: "Universitet/Högskola",
  forskningsinstitut: "Forskningsinstitut",
  privatperson: "Privatperson",
};

const SECTOR_LABELS: Record<string, string> = {
  all: "Alla branscher",
  tech: "Teknik",
  cleantech: "Cleantech",
  energy: "Energi",
  manufacturing: "Tillverkning",
  agriculture: "Jordbruk",
  food: "Livsmedel",
  health: "Hälsa",
  life_science: "Life Science",
  culture: "Kultur",
  creative: "Kreativa näringar",
  transport: "Transport",
  construction: "Bygg",
  digital: "Digitalisering",
  ai: "AI",
  space: "Rymd",
  defense: "Försvar",
  education: "Utbildning",
  social: "Socialt",
  environment: "Miljö",
  forestry: "Skog",
  maritime: "Marin",
  tourism: "Turism",
  retail: "Handel",
};

function isStructuredCriteria(criteria: Record<string, unknown>): boolean {
  return 'confidence_score' in criteria && 'company_types' in criteria;
}

function EligibilityCriteriaDisplay({ criteria, t }: { criteria: Record<string, unknown>; t: (key: string) => string }) {
  if (!isStructuredCriteria(criteria)) {
    return (
      <ul className="space-y-2" data-testid="eligibility-legacy">
        {Object.entries(criteria).map(([key, value]) => (
          <li key={key} className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 mt-1 shrink-0" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">{key}:</strong> {String(value)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  const c = criteria as unknown as {
    company_types?: string[];
    company_sizes?: { description?: string; size_category?: string[] };
    revenue?: { description?: string };
    geography?: { description?: string; regions?: string[] };
    sectors?: string[];
    company_age?: { description?: string };
    collaboration_required?: { required?: boolean; description?: string; partner_types?: string[] };
    funding_details?: { description?: string; co_financing_required?: boolean; co_financing_percentage?: number | null };
    other_requirements?: string[];
    who_cannot_apply?: string[];
    confidence_score?: number;
  };

  return (
    <div className="space-y-5" data-testid="eligibility-structured">
      {(c.confidence_score ?? 0) < 0.5 && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t('grantDetail.eligibilityLowConfidence')}
          </p>
        </div>
      )}

      {(c.company_types?.length ?? 0) > 0 && (
        <div data-testid="eligibility-company-types">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('grantDetail.eligibilityOrgType')}</h4>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.company_types!.map((type: string) => (
              <Badge key={type} variant="secondary" className="text-xs">
                {ORG_TYPE_LABELS[type] || type}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {c.company_sizes?.description && (
        <div data-testid="eligibility-company-size">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('grantDetail.eligibilitySize')}</h4>
          </div>
          <p className="text-sm text-muted-foreground">{c.company_sizes.description}</p>
        </div>
      )}

      {c.revenue?.description && (
        <div data-testid="eligibility-revenue">
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('grantDetail.eligibilityRevenue')}</h4>
          </div>
          <p className="text-sm text-muted-foreground">{c.revenue.description}</p>
        </div>
      )}

      {c.geography?.description && (
        <div data-testid="eligibility-geography">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('grantDetail.eligibilityGeography')}</h4>
          </div>
          <p className="text-sm text-muted-foreground">{c.geography.description}</p>
        </div>
      )}

      {(c.sectors?.length ?? 0) > 0 && !c.sectors?.includes('all') && (
        <div data-testid="eligibility-sectors">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('grantDetail.eligibilitySectors')}</h4>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.sectors!.map((sector: string) => (
              <Badge key={sector} variant="outline" className="text-xs">
                {SECTOR_LABELS[sector] || sector}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {c.company_age?.description && (
        <div data-testid="eligibility-age">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('grantDetail.eligibilityAge')}</h4>
          </div>
          <p className="text-sm text-muted-foreground">{c.company_age.description}</p>
        </div>
      )}

      {c.collaboration_required?.required && (
        <div data-testid="eligibility-collaboration">
          <div className="flex items-center gap-2 mb-1">
            <HandshakeIcon className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('grantDetail.eligibilityCollaboration')}</h4>
          </div>
          <p className="text-sm text-muted-foreground">{c.collaboration_required.description}</p>
          {(c.collaboration_required.partner_types?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {c.collaboration_required.partner_types!.map((p: string) => (
                <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {c.funding_details?.description && (
        <div data-testid="eligibility-funding">
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('grantDetail.eligibilityFunding')}</h4>
          </div>
          <p className="text-sm text-muted-foreground">{c.funding_details.description}</p>
        </div>
      )}

      {(c.other_requirements?.length ?? 0) > 0 && (
        <div data-testid="eligibility-other">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('grantDetail.eligibilityOther')}</h4>
          </div>
          <ul className="space-y-1 ml-6">
            {c.other_requirements!.map((req: string, i: number) => (
              <li key={i} className="text-sm text-muted-foreground list-disc">{req}</li>
            ))}
          </ul>
        </div>
      )}

      {(c.who_cannot_apply?.length ?? 0) > 0 && (
        <div data-testid="eligibility-exclusions">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-4 w-4 text-red-500" />
            <h4 className="text-sm font-medium text-red-600 dark:text-red-400">{t('grantDetail.eligibilityExclusions')}</h4>
          </div>
          <ul className="space-y-1 ml-6">
            {c.who_cannot_apply!.map((exc: string, i: number) => (
              <li key={i} className="text-sm text-red-600 dark:text-red-400 list-disc">{exc}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function GrantDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { addToRecentlyViewed } = useRecentlyViewed();
  const { bookmarked, toggleBookmark, toggling } = useBookmark(id || '');

  function formatAmount(min: string | null, max: string | null): string {
    if (!min && !max) return t('grantCard.notSpecified');
    const formatNum = (n: string) => {
      const num = parseFloat(n);
      if (num >= 1000000) return `${(num / 1000000).toFixed(1)} miljoner kr`;
      if (num >= 1000) return `${Math.round(num / 1000)} 000 kr`;
      return `${num} kr`;
    };
    if (min && max) return `${formatNum(min)} - ${formatNum(max)}`;
    if (min) return t('grantCard.from', { amount: formatNum(min) });
    return t('grantCard.upTo', { amount: formatNum(max!) });
  }

  function getStatusBadge(status: string, deadline: Date | null) {
    if (status === "closed") {
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">{t('grantCard.status.closed')}</Badge>;
    }
    if (status === "upcoming") {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">{t('grantCard.status.upcoming')}</Badge>;
    }
    if (deadline) {
      const daysLeft = differenceInDays(deadline, new Date());
      if (daysLeft < 0) {
        return <Badge variant="secondary" className="bg-muted text-muted-foreground">{t('grantCard.status.closed')}</Badge>;
      }
      if (daysLeft <= 7) {
        return <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">{t('common.daysLeft', { count: daysLeft })}</Badge>;
      }
      if (daysLeft <= 30) {
        return <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">{t('common.daysLeft', { count: daysLeft })}</Badge>;
      }
    }
    return <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">{t('grantCard.status.open')}</Badge>;
  }

  const { data: grant, isLoading, error, isError } = useQuery<Grant>({
    queryKey: ['/api/grants', id],
    enabled: !!id,
    retry: 2,
    staleTime: 60000,
  });

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const hasCompany = (companies?.length || 0) > 0;
  const company = companies?.[0] || null;
  const { selectedProfile } = useSearchProfiles();
  const matchResult = grant ? calculateMatchScore(company, grant, selectedProfile) : null;

  useEffect(() => {
    if (grant) {
      analytics.grantViewed(grant.id, grant.sourceName, matchResult?.score);
      addToRecentlyViewed({
        id: grant.id,
        title: grant.title,
        sourceName: grant.sourceName,
        matchScore: matchResult?.score,
      });
    }
  }, [grant?.id]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/bidrag">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t('grants.backToGrants')}
          </Link>
        </Button>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2" data-testid="text-grant-error">{t('grants.notFound')}</h2>
          <p className="text-muted-foreground">{t('grants.notFoundDesc')}</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()} data-testid="button-retry-grant">
            {t('common.tryAgain', { defaultValue: 'Försök igen' })}
          </Button>
        </div>
      </div>
    );
  }

  if (!grant) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/bidrag">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t('grants.backToGrants')}
          </Link>
        </Button>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2" data-testid="text-grant-not-found">{t('grants.notFound')}</h2>
          <p className="text-muted-foreground">{t('grants.notFoundDesc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SEO
        title={grant?.title ?? 'Bidragsdetaljer'}
        description={grant?.description?.slice(0, 155) ?? 'Läs mer om detta bidrag och se om ditt företag är behörigt att söka.'}
        canonical={`/bidrag/${grant?.id}`}
      />
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/bidrag" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="grant-detail-title">{grant.title}</h1>
            {getStatusBadge(grant.status, grant.deadline)}
          </div>
          <p className="text-muted-foreground mt-1">{grant.sourceName}</p>
        </div>
        <Button
          variant={bookmarked ? "default" : "outline"}
          onClick={toggleBookmark}
          disabled={toggling}
          className="shrink-0"
          data-testid="button-bookmark-grant"
        >
          <Star className={`h-4 w-4 mr-2 ${bookmarked ? 'fill-current' : ''}`} />
          {bookmarked ? t('bookmarks.saved') : t('bookmarks.save')}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('grantDetail.description')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-wrap" data-testid="grant-description">
                {grant.description}
              </p>
            </CardContent>
          </Card>

          {grant.eligibilityCriteria && Object.keys(grant.eligibilityCriteria).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  {t('grantDetail.eligibility')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EligibilityCriteriaDisplay criteria={grant.eligibilityCriteria} t={t} />
              </CardContent>
            </Card>
          )}

          {grant.applicationRequirements && Object.keys(grant.applicationRequirements).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t('grantDetail.requirements')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {Object.entries(grant.applicationRequirements).map(([key, value]) => (
                    <li key={key} className="flex items-start gap-2">
                      <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                      <span className="text-muted-foreground">
                        <strong className="text-foreground">{key}:</strong> {String(value)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <MatchReport grant={grant} company={company} hasCompany={hasCompany} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Banknote className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('grantDetail.amount')}</p>
                  <p className="font-semibold">{formatAmount(grant.amountMin, grant.amountMax)}</p>
                </div>
              </div>

              {grant.deadline && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('grantDetail.deadline')}</p>
                    <p className="font-semibold">{format(new Date(grant.deadline), "d MMMM yyyy", { locale: sv })}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('grantDetail.source')}</p>
                  <p className="font-semibold">{grant.sourceName}</p>
                </div>
              </div>

              {grant.targetGroup && grant.targetGroup.length > 0 && (
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground mb-2">{t('grantDetail.targetGroup')}</p>
                  <div className="flex flex-wrap gap-2">
                    {grant.targetGroup.map((group) => (
                      <Badge key={group} variant="outline">
                        {group === "startup" ? "Startup" : group === "sme" ? "SME" : group === "nonprofit" ? t('grantCard.targetGroup.nonprofit') : group}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {grant.keywords && grant.keywords.length > 0 && (
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground mb-2">{t('grantDetail.keywords')}</p>
                  <div className="flex flex-wrap gap-2">
                    {grant.keywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary" className="text-xs">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* The advertised ceiling above says what a call may give;
              this says what the funder has actually given companies. */}
          <FundingBenchmark sourceName={grant.sourceName} />

          <Card>
            <CardContent className="p-6 space-y-4">
              {hasCompany ? (
                <Button 
                  className="w-full" 
                  asChild
                  disabled={grant.status === "closed"}
                  data-testid="button-start-application"
                >
                  <Link href={`/bidrag/${id}/apply`}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t('grantApply.title')}
                  </Link>
                </Button>
              ) : (
                <Button className="w-full" asChild data-testid="button-create-company-first">
                  <Link href="/company">
                    <Building2 className="mr-2 h-4 w-4" />
                    {t('grantDetail.createProfileFirst')}
                  </Link>
                </Button>
              )}

              {grant.url && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={grant.url} target="_blank" rel="noopener noreferrer" data-testid="button-external-link">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t('grantDetail.openOriginal')}
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
