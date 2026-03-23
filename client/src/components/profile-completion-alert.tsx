import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { AlertCircle, TrendingUp, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { calculateProfileCompletion, getProfileCompletionBenefits } from '@/lib/profileCompletion';
import type { Company } from "@shared/schema";

interface ProfileCompletionAlertProps {
  profile: Company;
  onDismiss?: () => void;
}

export function ProfileCompletionAlert({ profile, onDismiss }: ProfileCompletionAlertProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  const completion = useMemo(() => calculateProfileCompletion(profile), [profile]);
  const benefits = useMemo(() => getProfileCompletionBenefits(completion.percentage), [completion.percentage]);

  if (completion.percentage >= 90) return null;

  const Icon = completion.percentage < 50 ? AlertCircle 
    : completion.percentage < 70 ? TrendingUp 
    : Sparkles;

  const borderColor = completion.percentage < 50 
    ? 'border-red-500 dark:border-red-700' 
    : completion.percentage < 70 
    ? 'border-amber-500 dark:border-amber-700' 
    : 'border-blue-500 dark:border-blue-700';

  const bgColor = completion.percentage < 50
    ? 'bg-red-50 dark:bg-red-900/20'
    : completion.percentage < 70
    ? 'bg-amber-50 dark:bg-amber-900/20'
    : 'bg-blue-50 dark:bg-blue-900/20';

  return (
    <Alert className={`${borderColor} ${bgColor}`} data-testid="alert-profile-completion">
      <Icon className="h-5 w-5" />
      <AlertTitle className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <span>{t('profileCompletion.title')}</span>
        <span className="text-2xl font-bold">{completion.percentage}%</span>
      </AlertTitle>
      <AlertDescription className="space-y-4">
        <Progress value={completion.percentage} className="h-2" />
        
        <div className="text-sm space-y-2">
          <p className="font-medium">{t(benefits.messageKey)}</p>
          
          <div className="grid grid-cols-3 gap-4 p-3 rounded-lg bg-white/50 dark:bg-gray-800/50">
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400">{t('profileCompletion.expectedMatches')}</div>
              <div className="text-lg font-bold text-blue-600">{benefits.expectedMatches}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400">{t('profileCompletion.aiAccuracy')}</div>
              <div className="text-lg font-bold text-green-600">{benefits.aiAccuracy}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400">{t('profileCompletion.matchQuality')}</div>
              <div className="text-lg font-bold capitalize" data-testid="text-match-quality">{t(`profileCompletion.quality.${benefits.matchQuality}`)}</div>
            </div>
          </div>

          {completion.missingFields.length > 0 && (
            <div>
              <p className="font-medium mb-1">{t('profileCompletion.missingFields')}</p>
              <div className="flex flex-wrap gap-2">
                {completion.missingFields.slice(0, 5).map(fieldKey => (
                  <Badge key={fieldKey} variant="secondary" className="text-xs">
                    {t(fieldKey)}
                  </Badge>
                ))}
                {completion.missingFields.length > 5 && (
                  <Badge variant="secondary" className="text-xs">
                    +{completion.missingFields.length - 5} {t('profileCompletion.more')}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button 
            size="sm" 
            onClick={() => navigate('/company')}
            data-testid="button-complete-profile"
          >
            {t('profileCompletion.completeBtn')}
          </Button>
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={onDismiss} data-testid="button-dismiss-completion">
              {t('profileCompletion.remindLater')}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
