import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { TrendingUp, ArrowRight, X } from "lucide-react";
import { Link } from "wouter";

interface UpgradePromptData {
  showPrompt: boolean;
  annualSubscriptionSek: number;
  feesPaidSek: number;
  savingsSek: number;
  message: string;
  totalAgreements: number;
}

export function UpgradePromptBanner() {
  const { t } = useTranslation();

  const { data } = useQuery<UpgradePromptData>({
    queryKey: ['/api/success-fee/upgrade-prompt'],
  });

  const dismissMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/success-fee/upgrade-prompt/dismiss'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/upgrade-prompt'] });
    },
  });

  if (!data?.showPrompt) return null;

  const formatSek = (n: number) => n.toLocaleString('sv-SE');

  return (
    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" data-testid="upgrade-prompt-banner">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              {t('successFee.upgrade.title', 'Spara pengar med en prenumeration')}
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
              {data.message}
            </p>
            {data.savingsSek > 0 && (
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mt-1">
                {t('successFee.upgrade.savings', 'Du hade sparat {{amount}} SEK', { amount: formatSek(data.savingsSek) })}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <Button size="sm" asChild data-testid="btn-upgrade-from-prompt">
                <Link href="/pricing">
                  {t('successFee.upgrade.cta', 'Uppgradera')}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissMutation.mutate()}
                data-testid="btn-dismiss-upgrade"
              >
                {t('successFee.upgrade.dismiss', 'Nej tack')}
              </Button>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => dismissMutation.mutate()} data-testid="btn-close-upgrade-prompt">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
