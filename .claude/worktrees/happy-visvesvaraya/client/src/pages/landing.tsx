import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles, Target, Zap, CheckCircle, Clock, Users, FileText, Mail, Download, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/language-switcher';
import { analytics } from '@/lib/analytics';
import { SEO } from '@/components/seo';
import { Helmet } from 'react-helmet-async';

const FAQ_ITEMS = [
  {
    q: "Vilka bidrag kan mitt företag söka?",
    a: "getgrant.ai matchar ditt företag mot 2 000+ bidrag från Vinnova, Almi, Tillväxtverket, EU och svenska regioner baserat på din bransch, storlek och fokusområden."
  },
  {
    q: "Hur fungerar AI-matchningen?",
    a: "Vår AI analyserar ditt företags profil och matchar den mot bidragets behörighetskrav. Du får en matchningspoäng och en förklaring för varje bidrag."
  },
  {
    q: "Kostar det något att använda getgrant.ai?",
    a: "Grundfunktionerna är gratis. Pro-planen ger tillgång till AI-genererade ansökningar, PDF-export och prioriterade matchningar."
  },
  {
    q: "Täcker ni EU-bidrag?",
    a: "Ja, vi indexerar Horizon Europe, EIC Accelerator, Digital Europe och fler EU-program via EU Funding & Tenders Portal."
  }
];

export default function Landing() {
  const { t } = useTranslation();
  const [statsVisible, setStatsVisible] = useState(false);

  useEffect(() => {
    analytics.pageView('landing');
  }, []);

  useEffect(() => {
    setTimeout(() => setStatsVisible(true), 300);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <SEO
        title="Hitta svenska bidrag med AI"
        description="Matcha ditt företag med rätt bidrag automatiskt. 2 000+ bidrag från Vinnova, Almi, EU och svenska regioner. Gratis att börja."
        canonical="/"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": FAQ_ITEMS.map(f => ({
            "@type": "Question",
            "name": f.q,
            "acceptedAnswer": { "@type": "Answer", "text": f.a }
          }))
        })}</script>
      </Helmet>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-600" />
            <span className="font-bold text-xl">getgrant.ai</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button
              variant="outline"
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              data-testid="button-pricing-nav"
            >
              {t('common.prices')}
            </Button>
            <Button
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-login-header"
            >
              {t('common.logIn')}
            </Button>
          </div>
        </div>
      </header>

      <section className="container mx-auto px-4 pt-32 pb-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium mb-6 animate-fade-in">
            <Sparkles className="h-4 w-4" />
            <span>{t('landing.hero.badge')}</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 animate-fade-in-up">
            {t('landing.hero.title')}
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400">
              {t('landing.hero.titleHighlight')}
            </span>
          </h1>

          <p className="text-xl text-gray-600 dark:text-gray-300 mb-10 max-w-2xl mx-auto animate-fade-in-up animation-delay-100">
            {t('landing.hero.description')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-fade-in-up animation-delay-200">
            <Button
              size="lg"
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-get-started"
            >
              {t('landing.hero.ctaPrimary')}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              data-testid="button-how-it-works"
            >
              {t('landing.hero.ctaSecondary')}
            </Button>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600 dark:text-gray-400 animate-fade-in-up animation-delay-300">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>{t('landing.hero.activeGrants')}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>{t('landing.hero.fromSources')}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>{t('landing.hero.autoUpdated')}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>{t('landing.hero.inSwedish')}</span>
            </div>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-6 text-center animate-fade-in-up animation-delay-300" data-testid="text-trust-signal">
            {t('landing.hero.trustSignal')}
          </p>
        </div>

        <div className="mt-16 max-w-5xl mx-auto animate-fade-in-up animation-delay-400">
          <div className="rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
            <div className="bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-white dark:bg-gray-800 rounded-md px-4 py-1 text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                  getgrant.ai
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8">
              <div className="grid grid-cols-3 gap-4 md:gap-6 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 md:p-5 text-center border border-blue-100 dark:border-blue-800/40">
                  <div className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">1 700+</div>
                  <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{t('landing.stats.activeGrants')}</div>
                </div>
                <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-xl p-4 md:p-5 text-center border border-cyan-100 dark:border-cyan-800/40">
                  <div className="text-2xl md:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-1">39+</div>
                  <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{t('landing.stats.sources')}</div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 md:p-5 text-center border border-purple-100 dark:border-purple-800/40">
                  <div className="text-2xl md:text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">85%</div>
                  <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{t('landing.mockImages.aiAnalysis')}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 md:gap-5">
                <div className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Target className="h-5 w-5 md:h-6 md:w-6 text-white" />
                  </div>
                  <span className="text-xs md:text-sm font-medium text-center text-gray-700 dark:text-gray-300">{t('landing.mockImages.findGrants')}</span>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div className="bg-blue-600 h-1.5 rounded-full" style={{width: '100%'}} />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-cyan-600 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-white" />
                  </div>
                  <span className="text-xs md:text-sm font-medium text-center text-gray-700 dark:text-gray-300">{t('landing.mockImages.aiAnalysis')}</span>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div className="bg-cyan-600 h-1.5 rounded-full" style={{width: '65%'}} />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-purple-600 flex items-center justify-center">
                    <Zap className="h-5 w-5 md:h-6 md:w-6 text-white" />
                  </div>
                  <span className="text-xs md:text-sm font-medium text-center text-gray-700 dark:text-gray-300">{t('landing.mockImages.generate')}</span>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                    <div className="bg-purple-600 h-1.5 rounded-full" style={{width: '30%'}} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-blue-600 dark:bg-blue-900">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center text-white">
            {[
              { value: '1 700+', label: t('landing.stats.activeGrants') },
              { value: '39+', label: t('landing.stats.sources') },
              { value: '5 min', label: t('landing.stats.firstMatch') },
              { value: '100%', label: t('landing.stats.freeToTest') },
            ].map((stat, i) => (
              <div
                key={i}
                className={`transition-all duration-500 ${
                  statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="text-4xl font-bold mb-2">{stat.value}</div>
                <div className="text-blue-100">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">{t('landing.howItWorks.title')}</h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              {t('landing.howItWorks.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                icon: Target,
                step: '1',
                title: t('landing.howItWorks.step1Title'),
                description: t('landing.howItWorks.step1Desc'),
              },
              {
                icon: Sparkles,
                step: '2',
                title: t('landing.howItWorks.step2Title'),
                description: t('landing.howItWorks.step2Desc'),
              },
              {
                icon: Zap,
                step: '3',
                title: t('landing.howItWorks.step3Title'),
                description: t('landing.howItWorks.step3Desc'),
              },
            ].map((item, i) => (
              <div
                key={i}
                className="relative p-8 rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow"
              >
                <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 text-white font-bold flex items-center justify-center text-xl shadow-lg">
                  {item.step}
                </div>
                <item.icon className="h-12 w-12 text-blue-600 dark:text-blue-400 mb-4" />
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold mb-4" data-testid="text-why-title">
              {t('landing.why.title')}
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              {t('landing.why.subtitle')}
            </p>
          </div>
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="p-8 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white">
                    <X className="h-6 w-6" />
                  </div>
                  <h3 className="text-2xl font-bold text-red-900 dark:text-red-100">
                    {t('landing.why.without.title')}
                  </h3>
                </div>
                <ul className="space-y-4">
                  {['time', 'manual', 'deadlines', 'qualify', 'writing'].map((key) => (
                    <li key={key} className="flex items-start gap-3">
                      <X className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">
                        {t(`landing.why.without.${key}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-8 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-500 dark:border-green-600 relative overflow-visible">
                <div className="flex items-center gap-3 mb-6 relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-white shadow-lg">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <h3 className="text-2xl font-bold text-green-900 dark:text-green-100">
                    {t('landing.why.with.title')}
                  </h3>
                </div>
                <ul className="space-y-4 relative">
                  {['time', 'ai', 'reminders', 'scoring', 'draft'].map((key) => (
                    <li key={key} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">
                        {t(`landing.why.with.${key}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">{t('landing.features.title')}</h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              {t('landing.features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                title: t('landing.features.grantSources'),
                description: t('landing.features.grantSourcesDesc'),
                icon: Target,
              },
              {
                title: t('landing.features.aiMatching'),
                description: t('landing.features.aiMatchingDesc'),
                icon: Sparkles,
              },
              {
                title: t('landing.features.autoApplications'),
                description: t('landing.features.autoApplicationsDesc'),
                icon: FileText,
              },
              {
                title: t('landing.features.emailNotifications'),
                description: t('landing.features.emailNotificationsDesc'),
                icon: Mail,
              },
              {
                title: t('landing.features.saveApplications'),
                description: t('landing.features.saveApplicationsDesc'),
                icon: Users,
              },
              {
                title: t('landing.features.exportWord'),
                description: t('landing.features.exportWordDesc'),
                icon: Download,
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="p-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
              >
                <feature.icon className="h-10 w-10 text-blue-600 dark:text-blue-400 mb-3" />
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold mb-4" data-testid="text-early-access-title">
              {t('landing.testimonials.comingSoon')}
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              {t('landing.testimonials.beta')}
            </p>
          </div>
          <div className="max-w-2xl mx-auto p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-800 text-center">
            <Sparkles className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-6" data-testid="text-early-access-desc">
              {t('landing.testimonials.earlyAccess')}
            </p>
            <Button
              size="lg"
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-early-access-cta"
            >
              {t('landing.hero.ctaPrimary')}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">{t('landing.pricing.title')}</h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              {t('landing.pricing.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto items-start">
            <div className="p-8 rounded-2xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
              <div className="text-sm font-semibold text-gray-500 mb-2">{t('landing.pricing.free')}</div>
              <div className="text-4xl font-bold mb-6">
                0 {t('common.kr')}<span className="text-lg text-gray-500">{t('common.perMonth')}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {(t('landing.pricing.freeFeatures', { returnObjects: true }) as string[]).map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" onClick={() => window.location.href = '/api/login'} data-testid="button-free-tier">
                {t('landing.pricing.startFree')}
              </Button>
            </div>

            <div className="p-8 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 text-white border-2 border-blue-500 relative md:scale-105 shadow-2xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-yellow-400 text-yellow-900 text-sm font-bold">
                {t('landing.pricing.popular')}
              </div>
              <div className="text-sm font-semibold mb-2">PRO</div>
              <div className="text-4xl font-bold mb-6">
                795 {t('common.kr')}<span className="text-lg opacity-80">{t('common.perMonth')}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {(t('landing.pricing.proFeatures', { returnObjects: true }) as string[]).map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button className="w-full bg-white text-blue-600" onClick={() => window.location.href = '/api/login'} data-testid="button-pro-tier">
                {t('landing.pricing.upgradePro')}
              </Button>
            </div>

            <div className="p-8 rounded-2xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
              <div className="text-sm font-semibold text-gray-500 mb-2">ENTERPRISE</div>
              <div className="text-4xl font-bold mb-6">
                3 995 {t('common.kr')}<span className="text-lg text-gray-500">{t('common.perMonth')}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {(t('landing.pricing.enterpriseFeatures', { returnObjects: true }) as string[]).map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" data-testid="button-enterprise-tier">
                {t('landing.pricing.contactUs')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-gradient-to-br from-blue-600 to-cyan-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            {t('landing.cta.title')}
          </h2>
          <p className="text-xl mb-10 opacity-90 max-w-2xl mx-auto">
            {t('landing.cta.description')}
          </p>
          <Button
            size="lg"
            className="text-lg px-12 py-6 bg-white text-blue-600"
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-final-cta"
          >
            {t('landing.cta.button')}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      <section className="py-20 bg-gray-50 dark:bg-gray-900/50" id="faq" data-testid="section-faq">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-12" data-testid="text-faq-title">Vanliga frågor</h2>
          <div className="space-y-4">
            {FAQ_ITEMS.map((faq, i) => (
              <details key={i} className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700" data-testid={`faq-item-${i}`}>
                <summary className="flex items-center justify-between p-5 cursor-pointer font-medium text-left list-none">
                  {faq.q}
                  <ChevronDown className="h-5 w-5 shrink-0 ml-2 transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-5 pb-5 text-muted-foreground">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 bg-gray-900 text-gray-400">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="text-white font-bold text-xl mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                getgrant.ai
              </div>
              <p className="text-sm">
                {t('landing.footer.tagline')}
              </p>
            </div>
            <div>
              <div className="text-white font-semibold mb-4">{t('landing.footer.product')}</div>
              <ul className="space-y-2 text-sm">
                <li><a href="#how-it-works" className="hover:text-white transition-colors">{t('landing.footer.features')}</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">{t('common.prices')}</a></li>
              </ul>
            </div>
            <div>
              <div className="text-white font-semibold mb-4">{t('landing.footer.company')}</div>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">{t('landing.footer.aboutUs')}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t('landing.footer.contact')}</a></li>
              </ul>
            </div>
            <div>
              <div className="text-white font-semibold mb-4">{t('landing.footer.legal')}</div>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">{t('landing.footer.privacy')}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t('landing.footer.terms')}</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            {t('landing.footer.copyright', { year: 2026 })}
          </div>
        </div>
      </footer>
    </div>
  );
}
