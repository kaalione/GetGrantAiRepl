import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { categorizeGrantsByDeadline, getUrgencyColor } from '@/lib/deadlines';
import type { Grant } from '@shared/schema';

interface DeadlineAlertsProps {
  grants: Grant[];
}

export function DeadlineAlerts({ grants }: DeadlineAlertsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'sv' ? sv : undefined;

  const categorized = categorizeGrantsByDeadline(grants);

  if (
    categorized.critical.length === 0 &&
    categorized.urgent.length === 0 &&
    categorized.upcoming.length === 0
  ) {
    return null;
  }

  const sections = [
    {
      urgency: 'critical' as const,
      icon: AlertTriangle,
      label: t('deadlines.critical'),
      description: t('deadlines.criticalDesc'),
      grants: categorized.critical,
    },
    {
      urgency: 'urgent' as const,
      icon: Clock,
      label: t('deadlines.urgent'),
      description: t('deadlines.urgentDesc'),
      grants: categorized.urgent,
    },
    {
      urgency: 'upcoming' as const,
      icon: Calendar,
      label: t('deadlines.upcoming'),
      description: t('deadlines.upcomingDesc'),
      grants: categorized.upcoming,
    },
  ].filter(section => section.grants.length > 0);

  return (
    <div className="grid gap-4 md:grid-cols-3" data-testid="deadline-alerts">
      {sections.map(section => {
        const colors = getUrgencyColor(section.urgency);
        const Icon = section.icon;

        return (
          <Card
            key={section.urgency}
            className={`border-2 ${colors.border} ${colors.bg}`}
            data-testid={`deadline-card-${section.urgency}`}
          >
            <CardHeader className="pb-3">
              <CardTitle className={`flex items-center gap-2 text-base ${colors.text}`}>
                <Icon className={`h-5 w-5 ${colors.icon}`} />
                {section.label.toUpperCase()} ({section.grants.length})
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {section.description}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.grants.slice(0, 3).map((grant: Grant) => (
                <Link
                  key={grant.id}
                  href={`/bidrag/${grant.id}`}
                  data-testid={`deadline-grant-${grant.id}`}
                >
                  <div className="block p-3 rounded-md bg-white/80 dark:bg-gray-800/80 hover-elevate border border-gray-200 dark:border-gray-700 cursor-pointer">
                    <div className="font-medium text-sm mb-1 line-clamp-2">
                      {grant.title}
                    </div>
                    <div className={`text-xs ${colors.icon} font-semibold`}>
                      {formatDistanceToNow(new Date(grant.deadline!), {
                        addSuffix: true,
                        locale,
                      })}
                    </div>
                  </div>
                </Link>
              ))}
              {section.grants.length > 3 && (
                <Link href="/bidrag" data-testid={`link-deadline-view-all-${section.urgency}`}>
                  <span className="block text-sm text-center text-muted-foreground font-medium cursor-pointer">
                    {t('deadlines.viewAll', { count: section.grants.length - 3 })}
                  </span>
                </Link>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
