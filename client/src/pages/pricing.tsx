import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Sparkles, Crown, Rocket, Loader2, ArrowRight, DollarSign, ExternalLink, Building2, Users, Globe, Zap, Shield, Headphones } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { analytics } from '@/lib/analytics';
import { FeeCalculator } from "@/components/success-fee/fee-calculator";
import { SEO } from '@/components/seo';

interface Subscription {
  plan: string;
  subscriptionStatus?: string;
}

export default function Pricing() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: subscription } = useQuery<Subscription>({
    queryKey: ["/api/billing/subscription"],
    retry: false,
  });

  const currentPlan = subscription?.plan || "free";

  useEffect(() => {
    analytics.pricingPageViewed();
  }, []);

  async function handleUpgrade(plan: "pro" | "enterprise") {
    setLoading(plan);
    try {
      const response = await apiRequest("POST", "/api/billing/checkout", { plan });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || t('pricing.toast.paymentErrorDesc'));
      }
    } catch (error: any) {
      toast({
        title: t('pricing.toast.paymentError'),
        description: error.message || t('pricing.toast.paymentErrorDesc'),
        variant: "destructive",
      });
      setLoading(null);
    }
  }

  async function handleManageSubscription() {
    setLoading("manage");
    try {
      const response = await apiRequest("POST", "/api/billing/portal", {});
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || t('pricing.toast.portalErrorDesc'));
      }
    } catch (error: any) {
      toast({
        title: t('pricing.toast.portalError'),
        description: error.message || t('pricing.toast.portalErrorDesc'),
        variant: "destructive",
      });
      setLoading(null);
    }
  }

  const freeFeatures = t('pricing.freeFeatures', { returnObjects: true }) as string[];
  const freeDisabled = t('pricing.freeDisabled', { returnObjects: true }) as string[];
  const proFeatures = t('pricing.proFeatures', { returnObjects: true }) as string[];
  const enterpriseFeatures = t('pricing.enterpriseFeatures', { returnObjects: true }) as string[];

  return (
    <div className="container mx-auto px-4 py-16">
      <SEO
        title="Priser och abonnemang"
        description="Välj rätt plan för ditt företag. Gratis basplan med AI-matching. Pro-plan med obegränsade ansökningar och export."
        canonical="/priser"
      />
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-pricing-title">
            {t('pricing.title')}
          </h1>
          <p className="text-xl text-muted-foreground">
            {t('pricing.subtitle')}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <Card className={`border-2 ${currentPlan === "free" ? "border-primary" : "border-muted"}`}>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Rocket className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">{t('landing.pricing.free')}</span>
                {currentPlan === "free" && <Badge variant="secondary">{t('pricing.current')}</Badge>}
              </div>
              <CardTitle className="text-3xl font-bold">
                0 kr<span className="text-lg text-muted-foreground">/{t('common.month')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-3">
                {freeFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
                {freeDisabled.map((feature, index) => (
                  <li key={`disabled-${index}`} className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle className="h-5 w-5 text-muted-foreground/50 mt-0.5" />
                    <span className="line-through">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button variant="outline" className="w-full" disabled data-testid="button-free-plan">
                {currentPlan === "free" ? t('pricing.currentPlan') : t('pricing.free')}
              </Button>
            </CardContent>
          </Card>

          <Card className={`border-2 relative ${currentPlan === "pro" ? "border-primary scale-105 shadow-2xl" : "border-blue-500 scale-105 shadow-2xl"}`}>
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-bold shadow-lg">
              {t('landing.pricing.popular')}
            </div>
            <CardHeader className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-t-lg">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-semibold text-blue-600">PRO</span>
                {currentPlan === "pro" && <Badge>{t('pricing.current')}</Badge>}
              </div>
              <CardTitle className="text-3xl font-bold">
                795 kr<span className="text-lg text-muted-foreground">/{t('common.month')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <ul className="space-y-3">
                {proFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <span className={index === 0 ? "font-medium" : ""}>{feature}</span>
                  </li>
                ))}
              </ul>

              {currentPlan === "pro" ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleManageSubscription}
                  disabled={loading !== null}
                  data-testid="button-manage-subscription"
                >
                  {loading === "manage" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('pricing.manageSub')}
                </Button>
              ) : (
                <Button
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600"
                  onClick={() => handleUpgrade("pro")}
                  disabled={loading !== null}
                  data-testid="button-upgrade-pro"
                >
                  {loading === "pro" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('pricing.upgradePro')}
                </Button>
              )}

              <p className="text-xs text-center text-muted-foreground">
                {t('pricing.paymentNote')}
              </p>
            </CardContent>
          </Card>

          <Card className={`border-2 ${currentPlan === "enterprise" ? "border-primary" : "border-purple-200 dark:border-purple-700"}`}>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-5 w-5 text-purple-600" />
                <span className="text-sm font-semibold text-purple-600">ENTERPRISE</span>
                {currentPlan === "enterprise" && <Badge>{t('pricing.current')}</Badge>}
              </div>
              <CardTitle className="text-3xl font-bold">
                3 995 kr<span className="text-lg text-muted-foreground">/{t('common.month')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-3">
                {enterpriseFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <span className={index === 0 ? "font-medium" : ""}>{feature}</span>
                  </li>
                ))}
              </ul>

              {currentPlan === "enterprise" ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleManageSubscription}
                  disabled={loading !== null}
                  data-testid="button-manage-enterprise"
                >
                  {loading === "manage" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('pricing.manageSub')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleUpgrade("enterprise")}
                  disabled={loading !== null}
                  data-testid="button-upgrade-enterprise"
                >
                  {loading === "enterprise" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('pricing.contactUs')}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {currentPlan === "free" && (
          <div className="mt-16" data-testid="success-fee-pricing-section">
            <Separator className="mb-16" />
            <div className="text-center mb-8">
              <Badge variant="outline" className="mb-4 text-sm px-4 py-1">
                <DollarSign className="h-4 w-4 mr-1" />
                {t('pricing.successFee.badge', 'Alternativ för gratisanvändare')}
              </Badge>
              <h2 className="text-3xl font-bold mb-2" data-testid="text-success-fee-title">
                {t('pricing.successFee.title', 'Betala per vinst')}
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                {t('pricing.successFee.subtitle', 'Ansök gratis — betala bara 3% av det godkända beloppet om bidraget godkänns. Ingen kostnad vid avslag.')}
              </p>
            </div>

            <div className="max-w-3xl mx-auto">
              <Card className="border-2 border-emerald-200 dark:border-emerald-800">
                <CardHeader className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl mb-1">
                        {t('pricing.successFee.cardTitle', 'Framgångsavgift')}
                      </CardTitle>
                      <p className="text-muted-foreground">
                        {t('pricing.successFee.cardSubtitle', '0 kr att starta — betala bara vid vinst')}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-emerald-600">3%</div>
                      <div className="text-sm text-muted-foreground">{t('pricing.successFee.ofApproved', 'av godkänt belopp')}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      <span>{t('pricing.successFee.feature1', 'Ansök utan kostnad — betala bara om bidraget godkänns')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      <span>{t('pricing.successFee.feature2', 'Maxtak: 25 000 SEK per ansökan')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      <span>{t('pricing.successFee.feature3', 'Avbryt när som helst innan utfallet rapporteras')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      <span>{t('pricing.successFee.feature4', 'AI-stödd ansökningsskrivning inkluderad')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      <span>{t('pricing.successFee.feature5', 'Faktura via Stripe — 30 dagars betalningsvillkor')}</span>
                    </li>
                  </ul>

                  <Separator />
                  <FeeCalculator compact />

                  <div className="flex gap-3">
                    <Button asChild variant="outline" className="flex-1" data-testid="btn-view-success-fee-terms">
                      <Link href="/terms/success-fee">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t('pricing.successFee.viewTerms', 'Läs villkor')}
                      </Link>
                    </Button>
                    <Button asChild className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600" data-testid="btn-start-with-success-fee">
                      <Link href="/bidrag">
                        <Sparkles className="h-4 w-4 mr-2" />
                        {t('pricing.successFee.startApplying', 'Börja ansöka')}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="mt-16" data-testid="partner-pricing-section">
          <Separator className="mb-16" />
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 text-sm px-4 py-1">
              <Building2 className="h-4 w-4 mr-1" />
              White-Label
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-3" data-testid="text-partner-pricing-title">
              För Bidragskonsulter & Rådgivare
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Erbjud GetGrant.ai:s kraftfulla plattform under ditt eget varumärke. Egen subdomän, logotyp, färger och fullständig klienthantering.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="border-2 border-muted" data-testid="card-partner-starter">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Rocket className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground">STARTER</span>
                </div>
                <CardTitle className="text-3xl font-bold">
                  1 495 kr<span className="text-lg text-muted-foreground">/mån</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">Upp till 10 klienter</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Globe className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Egen subdomän (ditt-namn.getgrant.ai)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Anpassat varumärke (logotyp, färger, namn)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Klienthantering & inbjudningar</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>100 AI-förfrågningar/mån</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Grundläggande analys (30 dagar)</span>
                  </li>
                  <li className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle className="h-5 w-5 text-muted-foreground/50 mt-0.5 shrink-0" />
                    <span className="line-through">Egen domän</span>
                  </li>
                  <li className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle className="h-5 w-5 text-muted-foreground/50 mt-0.5 shrink-0" />
                    <span className="line-through">API-åtkomst</span>
                  </li>
                </ul>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => navigate("/partner/setup")}
                  data-testid="button-partner-starter"
                >
                  Kom igång
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-500 scale-105 shadow-2xl relative" data-testid="card-partner-professional">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-bold shadow-lg">
                Populärast
              </div>
              <CardHeader className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-t-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-600">PROFESSIONAL</span>
                </div>
                <CardTitle className="text-3xl font-bold">
                  3 995 kr<span className="text-lg text-muted-foreground">/mån</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">Upp till 50 klienter</p>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span className="font-medium">Allt i Starter, plus:</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Globe className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Egen domän (din-domän.se)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>API-åtkomst & integrationer</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Klient-självanmälan</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>500 AI-förfrågningar/mån</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Avancerad analys (365 dagar)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Headphones className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Prioriterad support</span>
                  </li>
                </ul>
                <Button
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600"
                  onClick={() => navigate("/partner/setup")}
                  data-testid="button-partner-professional"
                >
                  Kom igång
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-purple-200 dark:border-purple-700" data-testid="card-partner-enterprise">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="h-5 w-5 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-600">ENTERPRISE</span>
                </div>
                <CardTitle className="text-3xl font-bold">
                  Anpassat<span className="text-lg text-muted-foreground"> pris</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">Obegränsat antal klienter</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span className="font-medium">Allt i Professional, plus:</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Obegränsade klienter & AI-förfrågningar</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Dedikerad kontaktperson</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Anpassat SLA</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Skräddarsydda funktioner</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>Obegränsad analyshistorik</span>
                  </li>
                </ul>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.location.href = 'mailto:partner@getgrant.ai?subject=Enterprise%20Partner%20Plan'}
                  data-testid="button-partner-enterprise"
                >
                  Kontakta oss
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="mt-12 max-w-3xl mx-auto">
            <h3 className="text-xl font-bold text-center mb-6">Vanliga frågor om partnerplattformen</h3>
            <div className="space-y-4">
              <details className="group">
                <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-muted/50 font-semibold">
                  Hur fungerar white-label-plattformen?
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="p-4 text-muted-foreground">
                  Du får en egen subdomän (t.ex. ditt-namn.getgrant.ai) eller ansluter din egen domän. Du kan anpassa logotyp, färger och plattformsnamn så att dina klienter ser ditt varumärke. All funktionalitet från GetGrant.ai finns tillgänglig under ditt varumärke.
                </p>
              </details>
              <details className="group">
                <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-muted/50 font-semibold">
                  Kan mina klienter se att det drivs av GetGrant.ai?
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="p-4 text-muted-foreground">
                  På Starter-planen visas en diskret "Powered by GetGrant.ai" i sidfoten. På Professional och Enterprise kan du dölja den helt. Dina klienter ser bara ditt varumärke.
                </p>
              </details>
              <details className="group">
                <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-muted/50 font-semibold">
                  Vad händer om jag behöver fler klienter?
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="p-4 text-muted-foreground">
                  Du kan uppgradera till en högre plan när som helst. Professional tillåter 50 klienter och Enterprise har inga begränsningar. Kontakta oss för anpassade lösningar.
                </p>
              </details>
            </div>
          </div>
        </div>

        <div className="mt-24 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t('pricing.faq.title')}
          </h2>

          <div className="space-y-4">
            <details className="group">
              <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-muted/50 font-semibold">
                {t('pricing.faq.q1')}
                <span className="group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="p-4 text-muted-foreground">
                {t('pricing.faq.a1')}
              </p>
            </details>

            <details className="group">
              <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-muted/50 font-semibold">
                {t('pricing.faq.q2')}
                <span className="group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="p-4 text-muted-foreground">
                {t('pricing.faq.a2')}
              </p>
            </details>

            <details className="group">
              <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-muted/50 font-semibold">
                {t('pricing.faq.q3')}
                <span className="group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="p-4 text-muted-foreground">
                {t('pricing.faq.a3')}
              </p>
            </details>

            <details className="group">
              <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-muted/50 font-semibold">
                {t('pricing.faq.q4')}
                <span className="group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="p-4 text-muted-foreground">
                {t('pricing.faq.a4')}
              </p>
            </details>
          </div>
        </div>

        <div className="mt-16 text-center">
          <Button variant="outline" onClick={() => navigate("/")} data-testid="button-back-to-dashboard">
            <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
            {t('pricing.backToDashboard')}
          </Button>
        </div>
      </div>
    </div>
  );
}
