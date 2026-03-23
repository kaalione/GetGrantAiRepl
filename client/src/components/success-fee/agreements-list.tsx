import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { Loader2, ExternalLink, XCircle, FileText, Trophy, Clock, AlertTriangle, CheckCircle2, Ban } from "lucide-react";

interface Agreement {
  id: string;
  grantTitle: string;
  funder: string;
  status: string;
  feePercentage: number;
  approvedAmountSek: number | null;
  calculatedFeeSek: number | null;
  stripeInvoiceUrl: string | null;
  invoiceDueDate: string | null;
  invoicePaidAt: string | null;
  agreedAt: string | null;
  createdAt: string;
  daysUntilDue: number | null;
  isOverdue: boolean;
}

interface AgreementsResponse {
  agreements: Agreement[];
  summary: {
    totalActive: number;
    totalWon: number;
    totalFeesPaidSek: number;
    totalFeesOutstandingSek: number;
  };
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: 'Inväntar', variant: 'outline', icon: Clock },
  active: { label: 'Aktivt', variant: 'default', icon: CheckCircle2 },
  grant_won: { label: 'Godkänt', variant: 'default', icon: Trophy },
  fee_invoiced: { label: 'Fakturerat', variant: 'secondary', icon: FileText },
  fee_paid: { label: 'Betalt', variant: 'default', icon: CheckCircle2 },
  rejected: { label: 'Avslaget', variant: 'outline', icon: XCircle },
  cancelled: { label: 'Avbrutet', variant: 'outline', icon: Ban },
  expired: { label: 'Förfallet', variant: 'outline', icon: Clock },
};

export function AgreementsList() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AgreementsResponse>({
    queryKey: ['/api/success-fee/agreements'],
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/success-fee/agreements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/agreements'] });
      toast({ title: t('successFee.toast.cancelled', 'Avtal avslutat') });
    },
  });

  const formatSek = (n: number) => n.toLocaleString('sv-SE');

  if (isLoading) {
    return <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  const agreements = data?.agreements || [];
  const summary = data?.summary;

  if (agreements.length === 0) {
    return (
      <Card data-testid="agreements-empty">
        <CardContent className="py-8 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium">{t('successFee.agreements.emptyTitle', 'Inga framgångsavtal')}</p>
          <p className="text-sm text-muted-foreground">
            {t('successFee.agreements.emptyDesc', 'Du kan aktivera framgångsavtal när du skickar in en ansökan.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="agreements-list">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">{t('successFee.summary.active', 'Aktiva')}</div>
            <div className="text-xl font-bold">{summary.totalActive}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">{t('successFee.summary.won', 'Vunna')}</div>
            <div className="text-xl font-bold">{summary.totalWon}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">{t('successFee.summary.paid', 'Betalt')}</div>
            <div className="text-xl font-bold">{formatSek(summary.totalFeesPaidSek)} SEK</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">{t('successFee.summary.outstanding', 'Utestående')}</div>
            <div className="text-xl font-bold">{formatSek(summary.totalFeesOutstandingSek)} SEK</div>
          </Card>
        </div>
      )}

      {agreements.map(agreement => {
        const config = statusConfig[agreement.status] || statusConfig.pending;
        const StatusIcon = config.icon;
        return (
          <Card key={agreement.id} data-testid={`agreement-${agreement.id}`}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{agreement.grantTitle}</span>
                    <Badge variant={config.variant} className="text-xs">
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                    {agreement.isOverdue && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {t('successFee.agreements.overdue', 'Försenad')}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">{agreement.funder}</div>

                  {agreement.calculatedFeeSek && (
                    <div className="text-sm mt-2">
                      <span className="text-muted-foreground">{t('successFee.agreements.fee', 'Avgift')}:</span>{' '}
                      <span className="font-semibold">{formatSek(agreement.calculatedFeeSek)} SEK</span>
                      {agreement.approvedAmountSek && (
                        <span className="text-muted-foreground"> ({agreement.feePercentage}% av {formatSek(agreement.approvedAmountSek)} SEK)</span>
                      )}
                    </div>
                  )}

                  {agreement.invoiceDueDate && agreement.status === 'fee_invoiced' && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {t('successFee.agreements.dueDate', 'Förfallodatum')}: {new Date(agreement.invoiceDueDate).toLocaleDateString('sv-SE')}
                      {agreement.daysUntilDue !== null && agreement.daysUntilDue > 0 && ` (${agreement.daysUntilDue} ${t('successFee.agreements.daysLeft', 'dagar kvar')})`}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  {agreement.stripeInvoiceUrl && (
                    <Button variant="outline" size="sm" asChild data-testid={`btn-view-invoice-${agreement.id}`}>
                      <a href={agreement.stripeInvoiceUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        {t('successFee.agreements.viewInvoice', 'Visa faktura')}
                      </a>
                    </Button>
                  )}
                  {['pending', 'active'].includes(agreement.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelMutation.mutate(agreement.id)}
                      disabled={cancelMutation.isPending}
                      data-testid={`btn-cancel-${agreement.id}`}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
