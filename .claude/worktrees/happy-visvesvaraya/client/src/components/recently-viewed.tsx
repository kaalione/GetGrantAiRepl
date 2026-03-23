import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, X, Target } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';

export function RecentlyViewed() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'sv' ? sv : undefined;
  const { recentlyViewed, clearRecentlyViewed } = useRecentlyViewed();

  if (recentlyViewed.length === 0) return null;

  return (
    <Card data-testid="recently-viewed-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t('recentlyViewed.title')}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearRecentlyViewed}
            data-testid="button-clear-recently-viewed"
          >
            <X className="h-3 w-3 mr-1" />
            {t('recentlyViewed.clear')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {recentlyViewed.map(grant => (
          <Link
            key={grant.id}
            href={`/bidrag/${grant.id}`}
          >
            <div
              className="p-2 rounded-md hover-elevate cursor-pointer transition-colors"
              data-testid={`recently-viewed-${grant.id}`}
            >
              <div className="text-sm font-medium line-clamp-1 mb-1">
                {grant.title}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{grant.sourceName}</span>
                {grant.matchScore != null && (
                  <>
                    <span className="text-muted-foreground/50">|</span>
                    <span className="flex items-center gap-1 text-primary font-medium">
                      <Target className="h-3 w-3" />
                      {grant.matchScore}%
                    </span>
                  </>
                )}
                <span className="text-muted-foreground/50">|</span>
                <span>
                  {formatDistanceToNow(grant.viewedAt, {
                    addSuffix: true,
                    locale,
                  })}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
