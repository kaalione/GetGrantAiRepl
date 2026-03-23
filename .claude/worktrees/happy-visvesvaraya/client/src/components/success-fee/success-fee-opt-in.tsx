import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { Sparkles, ExternalLink, CheckCircle2, Loader2, Info, XCircle } from "lucide-react";
import { FeeCalculator } from "./fee-calculator";
import { Link } from "wouter";

interface SuccessFeeOptInProps {
  applicationId: string;
  grantTitle?: string;
}

export function SuccessFeeOptIn({ applicationId, grantTitle }: SuccessFeeOptInProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);

  const { data: eligibility } = useQuery<{ eligible: boolean; reason?: string; currentPlan: string }>({
    queryKey: ['/api/success-fee/eligibility'],
  });

  const { data: existingAgreement } = useQuery<{ hasAgreement: boolean; agreement: any }>({
    queryKey: ['/api/success-fee/check', applicationId],
    queryFn: () => fetch(`/api/success-fee/check/${applicationId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: terms } = useQuery<any>({
    queryKey: ['/api/success-fee/terms'],
  });

  const createAgreement = useMutation({
    mutationFn: async () => {
      if (!terms?.termsVersion) {
        throw new Error('Terms not loaded yet. Please try again.');
      }
      const res = await apiRequest('POST', '/api/success-fee/agreements', { applicationId });
      const data = await res.json();
      const agreeRes = await apiRequest('PUT', `/api/success-fee/agreements/${data.agreementId}/agree`, {
        termsVersion: terms.termsVersion
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/check', applicationId] });
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/agreements'] });
      toast({
        title: t('successFee.toast.agreed', 'Framgångsavtal aktiverat'),
        description: t('successFee.toast.agreedDesc', 'Du betalar bara om bidraget godkänns.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('successFee.toast.error', 'Något gick fel'),
        description: error.message || t('successFee.toast.errorDesc', 'Kunde inte skapa avtal'),
        variant: 'destructive',
      });
    },
  });

  if (!eligibility?.eligible) return null;
  if (!terms?.isEnabled) return null;

  if (existingAgreement?.hasAgreement) {
    const agreement = existingAgreement.agreement;
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800" data-testid="success-fee-active">
        <CardContent className="py-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-medium text-green-700 dark:text-green-400">
              {t('successFee.optIn.active', 'Framgångsavtal aktivt')}
            </span>
            <Badge variant="secondary" className="ml-auto">
              {agreement.feePercentage}% {t('successFee.optIn.fee', 'avgift')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t('successFee.optIn.activeDesc', 'Du betalar bara om detta bidrag godkänns. Max {{cap}} SEK.', { cap: agreement.maxFeeCapSek?.toLocaleString('sv-SE') })}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800" data-testid="success-fee-opt-in">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-5 w-5 text-blue-600" />
          {t('successFee.optIn.title', 'Betala per vinst')}
        </CardTitle>
        <CardDescription>
          {t('successFee.optIn.description', 'Ansök gratis — betala bara {{pct}}% om bidraget godkänns. Max {{cap}} SEK.', {
            pct: terms?.feePercentage || 3,
            cap: (terms?.maxFeeCapSek || 25000).toLocaleString('sv-SE')
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showCalculator && <FeeCalculator compact />}

        <div className="flex items-start gap-2">
          <Checkbox
            id="accept-terms"
            checked={acceptedTerms}
            onCheckedChange={(v) => setAcceptedTerms(!!v)}
            data-testid="checkbox-accept-terms"
          />
          <label htmlFor="accept-terms" className="text-sm leading-tight cursor-pointer">
            {t('successFee.optIn.acceptTerms', 'Jag godkänner')}
            {' '}
            <Link href="/terms/success-fee" className="text-primary underline" target="_blank">
              {t('successFee.optIn.termsLink', 'villkoren för framgångsavgift')}
            </Link>
            {' '}
            (v{terms?.termsVersion || '1.0'})
          </label>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => createAgreement.mutate()}
            disabled={!acceptedTerms || createAgreement.isPending || !terms?.termsVersion}
            className="flex-1"
            data-testid="btn-activate-success-fee"
          >
            {createAgreement.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {t('successFee.optIn.activate', 'Aktivera framgångsavtal')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCalculator(!showCalculator)} data-testid="btn-toggle-calculator">
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
