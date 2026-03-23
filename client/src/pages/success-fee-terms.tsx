import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";
import { FeeCalculator } from "@/components/success-fee/fee-calculator";
import { Shield, FileText, Clock, CreditCard, HelpCircle, Scale, Ban, AlertTriangle, Mail, CheckCircle2 } from "lucide-react";
import { SEO } from "@/components/seo";

export default function SuccessFeeTerms() {
  const { t } = useTranslation();

  const { data: terms } = useQuery<any>({
    queryKey: ['/api/success-fee/terms'],
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4" data-testid="success-fee-terms-page">
      <SEO title="Villkor för framgångsavgift | GetGrant.ai" description="Betala bara om ditt bidrag godkänns." />

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-terms-title">
          {t('successFee.terms.title', 'Villkor för framgångsavgift')}
        </h1>
        <p className="text-lg text-muted-foreground">
          GetGrant.ai Framgångsavgift — Version {terms?.termsVersion || '1.0'}
        </p>
        {terms?.termsVersion && (
          <Badge variant="outline" className="mt-2">
            Version {terms.termsVersion}
          </Badge>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              {t('successFee.terms.whatIs', 'Vad är framgångsavgiften?')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <p>
              {t('successFee.terms.whatIsDesc', 'Framgångsavgiften är ett alternativ till GetGrant.ai:s abonnemangspriser. Istället för en månadsavgift betalar du en procentuell avgift baserad på det beviljade bidraget, men bara om din ansökan godkänns.')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              {t('successFee.terms.howItWorks', 'Så fungerar det')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <Step number={1} title={t('successFee.terms.step1Title', 'Ansök utan kostnad')}>
                {t('successFee.terms.step1Desc', 'Skapa och skicka in din ansökan helt gratis. Ingen kostnad uppstår förrän du har fått ett positivt besked.')}
              </Step>
              <Step number={2} title={t('successFee.terms.step2Title', 'Rapportera utfall')}>
                {t('successFee.terms.step2Desc', 'När du får svar från finansiären rapporterar du resultatet. Om bidraget avslås betalar du ingenting.')}
              </Step>
              <Step number={3} title={t('successFee.terms.step3Title', 'Betala vid vinst')}>
                {t('successFee.terms.step3Desc', 'Bara om bidraget godkänns betalas en avgift på {{pct}}% av det godkända beloppet. En faktura skickas via Stripe.', { pct: terms?.feePercentage || 3 })}
              </Step>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Scale className="h-5 w-5" />
              {t('successFee.terms.feeCalcTitle', 'Avgiftsberäkning')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.feeRate', 'Avgiften är {{pct}}% av det beviljade beloppet', { pct: terms?.feePercentage || 3 })}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.feeCap', 'Maximal avgift: {{cap}} SEK per ansökan', { cap: (terms?.maxFeeCapSek || 25000).toLocaleString('sv-SE') })}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.feeMin', 'Minimiavgift: {{min}} SEK per ansökan', { min: (terms?.minFeeSek || 500).toLocaleString('sv-SE') })}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.feeBase', 'Avgiften beräknas på det faktiska beviljade beloppet, inte på det ansökta beloppet')}
              </li>
            </ul>
            <Separator />
            <FeeCalculator />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              {t('successFee.terms.whenApplies', 'När gäller avgiften?')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <p>{t('successFee.terms.whenAppliesDesc', 'Framgångsavgiften gäller för bidrag som:')}</p>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.whenCond1', 'Hittades via GetGrant.ai:s söktjänst, ELLER')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.whenCond2', 'Ansökan skrevs med hjälp av GetGrant.ai:s AI-tjänster')}
              </li>
            </ul>
            <p className="text-muted-foreground">
              {t('successFee.terms.whenCond3', 'Och där användaren aktivt aktiverat framgångsavgift för den specifika ansökan.')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5" />
              {t('successFee.terms.billing', 'Rapportering och fakturering')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.billing1', 'Du rapporterar själv om din ansökan beviljades')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.billing2', 'GetGrant.ai litar på din rapportering')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.billing3', 'Fakturan skickas till din registrerade e-postadress')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.billing4', 'Betalning sker via Stripe (kort eller faktura)')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.billing5', 'Betalning ska ske inom {{days}} dagar från fakturadatum', { days: terms?.invoiceDaysUntilDue || 30 })}
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Ban className="h-5 w-5" />
              {t('successFee.terms.cancellation', 'Avbokning')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                {t('successFee.terms.cancel1', 'Avtal kan avbokas innan utfall rapporteras')}
              </li>
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                {t('successFee.terms.cancel2', 'Avbokning sker via inställningssidan')}
              </li>
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                {t('successFee.terms.cancel3', 'Ingen avgift debiteras vid avbokning')}
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5" />
              {t('successFee.terms.limitations', 'Begränsningar')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                {t('successFee.terms.limit1', 'GetGrant.ai garanterar inte att ansökningar beviljas')}
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                {t('successFee.terms.limit2', 'GetGrant.ai ansvarar inte för beslut fattade av finansiärerna')}
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              {t('successFee.terms.changes', 'Ändringar av villkor')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.changes1', 'Villkorsändringar gäller från det datum de publiceras')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {t('successFee.terms.changes2', 'Befintliga aktiva avtal löper på de villkor som gällde när avtalet ingicks')}
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HelpCircle className="h-5 w-5" />
              {t('successFee.terms.faq', 'Vanliga frågor')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <FAQItem
              q={t('successFee.terms.faq1Q', 'Vad händer om bidraget avslås?')}
              a={t('successFee.terms.faq1A', 'Då betalar du ingenting. Avtalet markeras som avslutat utan avgift.')}
            />
            <FAQItem
              q={t('successFee.terms.faq2Q', 'Kan jag avbryta mitt framgångsavtal?')}
              a={t('successFee.terms.faq2A', 'Ja, du kan avbryta när som helst innan utfallet är rapporterat.')}
            />
            <FAQItem
              q={t('successFee.terms.faq3Q', 'Vad räknas som godkänt belopp?')}
              a={t('successFee.terms.faq3A', 'Det belopp som finansiären har godkänt i sitt beslut. Avgiften baseras på detta belopp.')}
            />
            <FAQItem
              q={t('successFee.terms.faq4Q', 'Är det billigare att prenumerera?')}
              a={t('successFee.terms.faq4A', 'Om du söker flera bidrag per år kan en prenumeration vara mer fördelaktig. Vi visar dig en jämförelse automatiskt.')}
            />
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground space-y-1 pt-4">
          <p>Senast uppdaterad: Februari 2026</p>
          <p>Villkorsversion: {terms?.termsVersion || '1.0'}</p>
          <p>
            <Mail className="h-3 w-3 inline mr-1" />
            Kontakt: legal@getgrant.ai
          </p>
        </div>
      </div>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
        {number}
      </div>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <p className="font-medium">{q}</p>
      <p className="text-muted-foreground mt-1">{a}</p>
    </div>
  );
}
