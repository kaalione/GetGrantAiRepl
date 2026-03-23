import { Calendar, ExternalLink, Banknote, Star, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Grant, Company } from "@shared/schema";
import { format, differenceInDays } from "date-fns";
import { sv } from "date-fns/locale";
import { calculateMatchScore } from "@/lib/matching";
import { MatchIndicator } from "./match-indicator";
import { MatchExplanation } from "./match-explanation";
import { useTranslation } from 'react-i18next';
import { useBookmark } from '@/hooks/useBookmark';

interface ApplicationInfo {
  id: string;
  status: string;
  submittedAt?: string;
}

export type EligibilityStatus = 'eligible' | 'almost' | 'not_eligible' | null;

interface GrantCardProps {
  grant: Grant;
  company?: Company | null;
  showMatchScore?: boolean;
  applicationInfo?: ApplicationInfo | null;
  eligibilityStatus?: EligibilityStatus;
  eligibilityDetail?: string;
}

export function GrantCard({ grant, company, showMatchScore = false, applicationInfo, eligibilityStatus, eligibilityDetail }: GrantCardProps) {
  const { t } = useTranslation();
  const matchResult = showMatchScore ? calculateMatchScore(company || null, grant) : null;
  const { bookmarked, toggleBookmark } = useBookmark(grant.id);

  function formatAmount(min: string | null, max: string | null): string {
    if (!min && !max) return t('grantCard.notSpecified');
    const formatNum = (n: string) => {
      const num = parseFloat(n);
      if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M kr`;
      if (num >= 1000) return `${(num / 1000).toFixed(0)}k kr`;
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

  function getSourceTypeBadge(sourceType: string) {
    const styles: Record<string, string> = {
      myndighet: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
      stiftelse: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
      eu: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
    };
    return (
      <Badge variant="outline" className={styles[sourceType] || ""}>
        {t(`grantCard.sourceType.${sourceType}`) || sourceType}
      </Badge>
    );
  }

  function getApplicationStatusBadge(info: ApplicationInfo) {
    const statusClassNames: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      ready: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      submitted: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
      under_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
      approved: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      withdrawn: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    };
    
    const className = statusClassNames[info.status] || statusClassNames.draft;
    
    return (
      <Badge variant="secondary" className={className}>
        {t(`grantCard.applicationStatus.${info.status}`)}
        {info.submittedAt && info.status !== 'draft' && info.status !== 'ready' && (
          <span className="ml-1 opacity-75">
            {format(new Date(info.submittedAt), "d/M", { locale: sv })}
          </span>
        )}
      </Badge>
    );
  }

  const isClosed = grant.status === 'closed';

  return (
    <Card className={`group hover-elevate transition-all duration-200 overflow-hidden ${isClosed ? 'opacity-60' : ''}`} data-testid={`grant-card-${grant.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Link href={`/bidrag/${grant.id}`}>
              <h3 className="font-semibold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors cursor-pointer" data-testid={`grant-title-${grant.id}`}>
                {grant.title}
              </h3>
            </Link>
            <p className="text-sm text-muted-foreground mt-1">{grant.sourceName}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {getStatusBadge(grant.status, grant.deadline)}
            {showMatchScore && matchResult && (
              <MatchIndicator matchResult={matchResult} size="sm" showLabel={false} />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3 min-w-0">
        {showMatchScore && matchResult && matchResult.score >= 40 && (
          <MatchExplanation grantId={grant.id} matchScore={matchResult.score} />
        )}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 break-words">
          {grant.description}
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {eligibilityStatus && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className={
                    eligibilityStatus === 'eligible'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : eligibilityStatus === 'almost'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  }
                  data-testid={`badge-eligibility-${grant.id}`}
                >
                  {eligibilityStatus === 'eligible' ? (
                    <><CheckCircle2 className="h-3 w-3 mr-1" />{t('eligibility.eligible')}</>
                  ) : eligibilityStatus === 'almost' ? (
                    <><AlertTriangle className="h-3 w-3 mr-1" />{t('eligibility.almostEligible')}</>
                  ) : (
                    <><XCircle className="h-3 w-3 mr-1" />{t('eligibility.notEligible')}</>
                  )}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{eligibilityDetail || t('eligibility.checksPassed', { passed: '?', total: '?' })}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {applicationInfo && getApplicationStatusBadge(applicationInfo)}
          {getSourceTypeBadge(grant.sourceType)}
          {grant.targetGroup?.slice(0, 2).map((group) => (
            <Badge key={group} variant="outline" className="text-xs">
              {group === "startup" ? t('grantCard.targetGroup.startup') : group === "sme" ? t('grantCard.targetGroup.sme') : group === "nonprofit" ? t('grantCard.targetGroup.nonprofit') : group}
            </Badge>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Banknote className="h-4 w-4 shrink-0" />
            <span className="truncate">{formatAmount(grant.amountMin, grant.amountMax)}</span>
          </div>
          {grant.deadline && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span className="truncate">{format(new Date(grant.deadline), "d MMM yyyy", { locale: sv })}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-3 border-t flex gap-2 min-w-0">
        <Button variant="default" size="sm" className="flex-1 min-w-0" asChild>
          <Link href={`/bidrag/${grant.id}`} data-testid={`button-view-grant-${grant.id}`}>
            {t('grants.viewDetails')}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleBookmark();
          }}
          data-testid={`button-bookmark-${grant.id}`}
        >
          <Star className={`h-4 w-4 ${bookmarked ? 'fill-yellow-500 text-yellow-500' : ''}`} />
        </Button>
        {grant.url && (
          <Button variant="outline" size="icon" asChild>
            <a href={grant.url} target="_blank" rel="noopener noreferrer" data-testid={`button-external-${grant.id}`}>
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
