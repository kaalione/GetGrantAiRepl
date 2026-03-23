import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { Calculator, TrendingUp, Shield } from "lucide-react";

interface FeeTerms {
  feePercentage: number;
  maxFeeCapSek: number;
  minFeeSek: number;
  isEnabled: boolean;
  termsVersion: string;
  invoiceDaysUntilDue: number;
  exampleCalculations: Array<{
    grantAmountSek: number;
    feeSek: number;
    capApplied?: boolean;
    minimumApplied?: boolean;
  }>;
}

export function FeeCalculator({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(500000);

  const { data: terms } = useQuery<FeeTerms>({
    queryKey: ['/api/success-fee/terms'],
  });

  const feePercentage = terms?.feePercentage || 3;
  const maxCap = terms?.maxFeeCapSek || 25000;
  const minFee = terms?.minFeeSek || 500;

  const calculation = useMemo(() => {
    const rawFee = Math.round(amount * (feePercentage / 100));
    const cappedFee = Math.min(rawFee, maxCap);
    const finalFee = Math.max(cappedFee, minFee);
    return {
      rawFee,
      finalFee,
      capApplied: rawFee > maxCap,
      minimumApplied: cappedFee < minFee,
    };
  }, [amount, feePercentage, maxCap, minFee]);

  const formatSek = (n: number) => n.toLocaleString('sv-SE');

  const examples = [
    { amount: 50000, label: '50k' },
    { amount: 100000, label: '100k' },
    { amount: 500000, label: '500k' },
    { amount: 1000000, label: '1M' },
    { amount: 5000000, label: '5M' },
  ];

  return (
    <Card data-testid="fee-calculator">
      <CardHeader className={compact ? "pb-2" : ""}>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calculator className="h-5 w-5" />
          {t('successFee.calculator.title', 'Beräkna din avgift')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {t('successFee.calculator.grantAmount', 'Bidragsbelopp')}
            </span>
            <span className="font-semibold text-lg">{formatSek(amount)} SEK</span>
          </div>
          <Slider
            data-testid="fee-slider"
            value={[amount]}
            onValueChange={([v]) => setAmount(v)}
            min={10000}
            max={10000000}
            step={10000}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>10 000</span>
            <span>10 000 000</span>
          </div>
        </div>

        <div className="bg-primary/5 rounded-lg p-4 text-center border">
          <div className="text-sm text-muted-foreground mb-1">
            {t('successFee.calculator.yourFee', 'Din framgångsavgift')}
          </div>
          <div className="text-3xl font-bold text-primary" data-testid="calculated-fee">
            {formatSek(calculation.finalFee)} SEK
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {feePercentage}% × {formatSek(amount)} SEK = {formatSek(calculation.rawFee)} SEK
          </div>
          <div className="flex gap-2 justify-center mt-2">
            {calculation.capApplied && (
              <Badge variant="secondary" data-testid="cap-badge">
                <Shield className="h-3 w-3 mr-1" />
                {t('successFee.calculator.capApplied', 'Maxtak tillämpat')}
              </Badge>
            )}
            {calculation.minimumApplied && (
              <Badge variant="secondary" data-testid="min-badge">
                {t('successFee.calculator.minimumApplied', 'Minimiavgift')}
              </Badge>
            )}
          </div>
        </div>

        {!compact && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              {t('successFee.calculator.examples', 'Exempel')}
            </h4>
            <div className="grid grid-cols-5 gap-2">
              {examples.map(ex => {
                const rawFee = Math.round(ex.amount * (feePercentage / 100));
                const fee = Math.max(Math.min(rawFee, maxCap), minFee);
                return (
                  <button
                    key={ex.amount}
                    onClick={() => setAmount(ex.amount)}
                    className={`text-center p-2 rounded-md border transition-colors cursor-pointer ${amount === ex.amount ? 'bg-primary/10 border-primary' : 'hover:bg-muted'}`}
                    data-testid={`example-${ex.label}`}
                  >
                    <div className="text-xs text-muted-foreground">{ex.label} SEK</div>
                    <div className="font-semibold text-sm">{formatSek(fee)} SEK</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
          <TrendingUp className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            {t('successFee.calculator.info', `${feePercentage}% av godkänt belopp. Maxtak ${formatSek(maxCap)} SEK. Minimiavgift ${formatSek(minFee)} SEK. Faktura skickas via Stripe med ${terms?.invoiceDaysUntilDue || 30} dagars betalningsvillkor.`)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
