import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { Trophy, XCircle, Loader2, ExternalLink, AlertTriangle, Calculator } from "lucide-react";

interface OutcomeReportingCardProps {
  agreementId: string;
  grantTitle: string;
  feePercentage: number;
  maxFeeCapSek: number;
  minFeeSek: number;
  onComplete?: () => void;
}

export function OutcomeReportingCard({
  agreementId, grantTitle, feePercentage, maxFeeCapSek, minFeeSek, onComplete
}: OutcomeReportingCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [outcome, setOutcome] = useState<'won' | 'rejected' | null>(null);
  const [approvedAmount, setApprovedAmount] = useState('');
  const [grantRef, setGrantRef] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [notes, setNotes] = useState('');

  const feePreview = useMemo(() => {
    const amount = parseInt(approvedAmount) || 0;
    if (amount <= 0) return null;
    const rawFee = Math.round(amount * (feePercentage / 100));
    const cappedFee = Math.min(rawFee, maxFeeCapSek);
    const finalFee = Math.max(cappedFee, minFeeSek);
    return {
      finalFee,
      capApplied: rawFee > maxFeeCapSek,
      minimumApplied: cappedFee < minFeeSek,
    };
  }, [approvedAmount, feePercentage, maxFeeCapSek, minFeeSek]);

  const reportOutcome = useMutation({
    mutationFn: async () => {
      const body: any = { outcome, notes };
      if (outcome === 'won') {
        body.approvedAmountSek = parseInt(approvedAmount);
        body.grantAgreementRef = grantRef || undefined;
        body.proofOfApprovalUrl = proofUrl || undefined;
      } else {
        body.rejectionReason = rejectionReason || undefined;
      }
      const res = await apiRequest('POST', `/api/success-fee/agreements/${agreementId}/report-outcome`, body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/agreements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/check'] });
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/upgrade-prompt'] });
      if (data.status === 'fee_invoiced') {
        toast({
          title: t('successFee.toast.invoiceCreated', 'Faktura skapad'),
          description: t('successFee.toast.invoiceCreatedDesc', 'Grattis! En faktura har skickats till din e-post.'),
        });
      } else {
        toast({
          title: t('successFee.toast.outcomeRecorded', 'Utfall registrerat'),
          description: t('successFee.toast.noFeeCharged', 'Ingen avgift debiteras.'),
        });
      }
      onComplete?.();
    },
    onError: () => {
      toast({
        title: t('successFee.toast.error', 'Något gick fel'),
        variant: 'destructive',
      });
    },
  });

  const formatSek = (n: number) => n.toLocaleString('sv-SE');

  if (!outcome) {
    return (
      <Card data-testid="outcome-reporting-card">
        <CardHeader>
          <CardTitle className="text-base">
            {t('successFee.outcome.title', 'Rapportera utfall')}
          </CardTitle>
          <CardDescription>{grantTitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => setOutcome('won')}
            className="w-full justify-start bg-green-600 hover:bg-green-700"
            data-testid="btn-outcome-won"
          >
            <Trophy className="h-4 w-4 mr-2" />
            {t('successFee.outcome.won', 'Bidraget godkändes!')}
          </Button>
          <Button
            onClick={() => setOutcome('rejected')}
            variant="outline"
            className="w-full justify-start"
            data-testid="btn-outcome-rejected"
          >
            <XCircle className="h-4 w-4 mr-2" />
            {t('successFee.outcome.rejected', 'Bidraget avslogs')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (outcome === 'rejected') {
    return (
      <Card data-testid="outcome-rejection-form">
        <CardHeader>
          <CardTitle className="text-base">{t('successFee.outcome.rejectedTitle', 'Bidraget avslogs')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t('successFee.outcome.rejectionReason', 'Anledning (valfritt)')}</Label>
            <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} data-testid="input-rejection-reason" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOutcome(null)}>{t('common.cancel', 'Avbryt')}</Button>
            <Button onClick={() => reportOutcome.mutate()} disabled={reportOutcome.isPending} data-testid="btn-submit-rejection">
              {reportOutcome.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('successFee.outcome.confirmRejection', 'Bekräfta avslag')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="outcome-won-form">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-5 w-5 text-green-600" />
          {t('successFee.outcome.wonTitle', 'Grattis till godkänt bidrag!')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>{t('successFee.outcome.approvedAmount', 'Godkänt belopp (SEK)')} *</Label>
          <Input
            type="number"
            value={approvedAmount}
            onChange={e => setApprovedAmount(e.target.value)}
            placeholder="500000"
            data-testid="input-approved-amount"
          />
        </div>

        {feePreview && (
          <div className="bg-primary/5 rounded-lg p-3 border" data-testid="fee-preview">
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="h-4 w-4" />
              <span className="text-sm font-medium">{t('successFee.outcome.feePreview', 'Avgiftsförhandsvisning')}</span>
            </div>
            <div className="text-2xl font-bold">{formatSek(feePreview.finalFee)} SEK</div>
            <div className="text-xs text-muted-foreground">
              {feePercentage}% × {formatSek(parseInt(approvedAmount))} SEK
            </div>
            {feePreview.capApplied && <Badge variant="secondary" className="mt-1">{t('successFee.calculator.capApplied', 'Maxtak tillämpat')}</Badge>}
            {feePreview.minimumApplied && <Badge variant="secondary" className="mt-1">{t('successFee.calculator.minimumApplied', 'Minimiavgift')}</Badge>}
          </div>
        )}

        <div>
          <Label>{t('successFee.outcome.grantRef', 'Bidragsreferens (valfritt)')}</Label>
          <Input value={grantRef} onChange={e => setGrantRef(e.target.value)} placeholder="2026-01234" data-testid="input-grant-ref" />
        </div>
        <div>
          <Label>{t('successFee.outcome.proofUrl', 'Länk till beslutsbrev (valfritt)')}</Label>
          <Input value={proofUrl} onChange={e => setProofUrl(e.target.value)} placeholder="https://..." data-testid="input-proof-url" />
        </div>
        <div>
          <Label>{t('successFee.outcome.notes', 'Anteckningar (valfritt)')}</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-outcome-notes" />
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {t('successFee.outcome.invoiceNote', 'En faktura skickas till din e-post via Stripe. Betalningsvillkor: 30 dagar.')}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOutcome(null)}>{t('common.cancel', 'Avbryt')}</Button>
          <Button
            onClick={() => reportOutcome.mutate()}
            disabled={!approvedAmount || parseInt(approvedAmount) <= 0 || reportOutcome.isPending}
            className="flex-1"
            data-testid="btn-submit-outcome"
          >
            {reportOutcome.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('successFee.outcome.submit', 'Rapportera vinst & skapa faktura')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
