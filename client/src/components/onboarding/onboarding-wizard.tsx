import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Rocket, ArrowRight, ArrowLeft, Loader2, Globe, Sparkles, CheckCircle,
  AlertTriangle, Star, Target, Bell, X, Search,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { analytics } from '@/lib/analytics';
import { MARKETS, setMarket, getMarket, type MarketCode } from '@/components/market-selector';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { StepPreferences } from './StepPreferences';

interface OnboardingWizardProps {
  onComplete: () => void;
}

interface ExtractedData {
  companyName: string | null;
  description: string | null;
  tagline: string | null;
  foundedYear: number | null;
  orgNumber: string | null;
  sector: string | null;
  industryKeywords: string[];
  employeeCount: string | null;
  companyStage: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  isSwedish: boolean;
  technologyAreas: string[];
  hasRdFocus: boolean;
  innovationLevel: string | null;
  businessModel: string | null;
  isExportFocused: boolean;
  sustainabilityFocus: boolean;
  sustainabilityAreas: string[];
  confidence: Record<string, number>;
  extractionNotes: string | null;
}

interface SessionData {
  sessionId: string;
  currentStep: number;
  existingProfile: boolean;
  resuming: boolean;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [session, setSession] = useState<SessionData | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [profileData, setProfileData] = useState<Record<string, any>>({});
  const [autoFilledFields, setAutoFilledFields] = useState<string[]>([]);
  const [userEditedFields, setUserEditedFields] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const queryClient = useQueryClient();

  useEffect(() => {
    startSession();
    analytics.onboardingStarted();
  }, []);

  async function startSession() {
    try {
      const res = await apiRequest('POST', '/api/onboarding/start');
      const data = await res.json();
      setSession(data);
      if (data.resuming && data.currentStep > 1) {
        setCurrentStep(data.currentStep);
      }
    } catch (err) {
      console.error('Failed to start onboarding session:', err);
    }
  }

  async function updateStep(step: number) {
    setCurrentStep(step);
    if (session?.sessionId) {
      try {
        await apiRequest('PUT', '/api/onboarding/step', {
          sessionId: session.sessionId,
          step,
        });
      } catch {}
    }
  }

  async function handleSkip() {
    try {
      if (session?.sessionId) {
        analytics.onboardingSkipped(session.sessionId, currentStep);
      }
      await apiRequest('POST', '/api/onboarding/skip', {
        sessionId: session?.sessionId,
      });
      onComplete();
    } catch {
      onComplete();
    }
  }

  const { toast } = useToast();
  const totalSteps = 5;
  const progress = (currentStep / totalSteps) * 100;

  const stepDots = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl p-6 md:p-8" data-testid="onboarding-wizard">
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              Steg {currentStep} av {totalSteps}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-center gap-2 mt-3">
            {stepDots.map((s) => (
              <div
                key={s}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  s === currentStep
                    ? 'bg-primary'
                    : s < currentStep
                    ? 'bg-green-500'
                    : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2" data-testid="text-time-estimate">
            ~4 minuter till din första matchning
          </p>
        </div>

        {currentStep === 1 && (
          <WelcomeStep
            onNext={() => updateStep(2)}
            onSkip={handleSkip}
          />
        )}
        {currentStep === 2 && (
          <MarketStep
            onNext={() => updateStep(3)}
            onBack={() => updateStep(1)}
          />
        )}
        {currentStep === 3 && (
          <UrlInputStep
            sessionId={session?.sessionId || ''}
            onSuccess={(data, mapped, autoFields) => {
              setExtractedData(data);
              setProfileData(mapped);
              setAutoFilledFields(autoFields);
              updateStep(4);
            }}
            onSkipToManual={() => {
              updateStep(4);
            }}
            onBack={() => updateStep(2)}
          />
        )}
        {currentStep === 4 && (
          <ReviewProfileStep
            extractedData={extractedData}
            profileData={profileData}
            autoFilledFields={autoFilledFields}
            onProfileChange={(field, value) => {
              setProfileData((prev) => ({ ...prev, [field]: value }));
              const wasAiFilled = autoFilledFields.includes(field);
              if (wasAiFilled && !userEditedFields.includes(field)) {
                setUserEditedFields((prev) => [...prev, field]);
              }
              analytics.fieldEdited(field, wasAiFilled, extractedData?.confidence?.[field] ?? 0);
            }}
            onSave={async (finalProfile) => {
              try {
                const res = await apiRequest('POST', '/api/onboarding/save-profile', {
                  sessionId: session?.sessionId,
                  profileData: finalProfile,
                  autoFilledFields,
                  userEditedFields,
                });
                const result = await res.json();
                if (!result.companyId) {
                  throw new Error('Företagsprofilen kunde inte sparas');
                }
                setCompanyId(result.companyId);
                queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
                queryClient.invalidateQueries({ queryKey: ['/api/user/onboarding-progress'] });
                queryClient.invalidateQueries({ queryKey: ['/api/user/status'] });
                queryClient.invalidateQueries({ queryKey: ['/api/user/profile-completion'] });
                updateStep(5);
              } catch (err: any) {
                console.error('Failed to save profile:', err);
                return { error: err.message || 'Kunde inte spara profilen. Försök igen.' };
              }
            }}
            onBack={() => updateStep(3)}
          />
        )}
        {currentStep === 5 && (
          <StepPreferences
            sessionId={session?.sessionId || ''}
            onComplete={async () => {
              try {
                await apiRequest('POST', '/api/onboarding/complete', {
                  sessionId: session?.sessionId,
                });
              } catch {}
              analytics.onboardingCompleted({
                sessionId: session?.sessionId,
                totalSteps: 5,
                timeToCompleteMs: Date.now() - startedAt,
                usedAiExtraction: !!extractedData,
                fieldsAutoFilled: autoFilledFields.length,
                fieldsUserEdited: userEditedFields.length,
              });
              queryClient.invalidateQueries({ queryKey: ['/api/user/status'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/onboarding-progress'] });
              queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
              queryClient.invalidateQueries({ queryKey: ['/api/user/profile-completion'] });
              toast({
                title: 'Profil klar!',
                description: 'Din profil har sparats. Nu hittar vi bidrag som matchar ditt företag.',
              });
              onComplete();
            }}
            onBack={() => updateStep(4)}
          />
        )}
      </Card>
    </div>
  );
}

function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="text-center space-y-6" data-testid="step-welcome">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
        <Rocket className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-3xl font-bold mb-2">Välkommen till GetGrant.ai!</h2>
        <p className="text-muted-foreground text-lg">
          Vi hjälper dig hitta rätt bidrag på under 5 minuter.
        </p>
      </div>

      <div className="text-left bg-muted/50 rounded-lg p-4 space-y-2">
        <p className="font-medium">Steg 1 av 5: Berätta om ditt företag →</p>
        <p className="text-sm text-muted-foreground">
          Det enklaste sättet: klistra in din hemsideadress
          så analyserar vår AI din webbplats och fyller i
          företagsprofilen automatiskt.
        </p>
        <p className="text-sm text-muted-foreground">
          Du kan granska och ändra allt innan vi sparar.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { icon: <Search className="h-6 w-6 text-primary" />, title: 'AI analyserar', text: 'Vi läser din webbplats och extraherar företagsinformation' },
          { icon: <CheckCircle className="h-6 w-6 text-primary" />, title: 'Du granskar', text: 'Kontrollera att allt stämmer och gör ändringar' },
          { icon: <Target className="h-6 w-6 text-primary" />, title: 'Matchning', text: 'Vi hittar bidrag som passar ditt företag' },
        ].map((f, i) => (
          <div key={i} className="p-4 rounded-lg bg-background border text-center">
            <div className="flex justify-center mb-2">{f.icon}</div>
            <div className="font-semibold text-sm mb-1">{f.title}</div>
            <div className="text-xs text-muted-foreground">{f.text}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <Button onClick={onNext} size="lg" className="w-full" data-testid="button-onboarding-start">
          Kom igång
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground underline"
          data-testid="button-skip-wizard"
        >
          Jag vill fylla i manuellt
        </button>
      </div>
    </div>
  );
}

function MarketStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { i18n } = useTranslation();
  const [selectedMarket, setSelectedMarket] = useState<MarketCode>(getMarket());

  function handleSelect(code: MarketCode) {
    setSelectedMarket(code);
    const m = MARKETS.find((mk) => mk.code === code);
    if (m) {
      setMarket(code);
      i18n.changeLanguage(m.lang);
      try {
        apiRequest('PUT', '/api/companies/market', { market: code });
      } catch {}
    }
  }

  return (
    <div className="text-center space-y-6" data-testid="step-market">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
        <Globe className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-2">Vilken marknad verkar du i?</h2>
        <p className="text-muted-foreground">
          Vi anpassar bidrag, valuta och sprak efter din marknad.
        </p>
      </div>

      <div className="grid gap-3 max-w-md mx-auto">
        {MARKETS.map((m) => (
          <button
            key={m.code}
            onClick={() => handleSelect(m.code)}
            className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left ${
              selectedMarket === m.code
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                : 'border-border hover:border-primary/40 hover:bg-muted/50'
            }`}
            data-testid={`market-card-${m.code}`}
          >
            <span className="text-3xl">{m.flag}</span>
            <div className="flex-1">
              <p className="font-semibold">{m.label}</p>
              <p className="text-sm text-muted-foreground">
                {m.code === 'se' && 'Svenska bidrag i SEK'}
                {m.code === 'no' && 'Norske tilskudd i NOK'}
                {m.code === 'fi' && 'Suomalaiset avustukset euroina'}
              </p>
            </div>
            {selectedMarket === m.code && (
              <CheckCircle className="h-5 w-5 text-primary shrink-0" />
            )}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center pt-4 border-t">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-market">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <Button onClick={onNext} data-testid="button-next-market">
          Fortsatt
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function UrlInputStep({
  sessionId,
  onSuccess,
  onSkipToManual,
  onBack,
}: {
  sessionId: string;
  onSuccess: (data: ExtractedData, mapped: Record<string, any>, autoFields: string[]) => void;
  onSkipToManual: () => void;
  onBack: () => void;
}) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'scraping' | 'extracting' | 'creating' | 'success' | 'partial' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [attempts, setAttempts] = useState(0);

  async function handleExtract() {
    if (!url.trim()) return;
    setStatus('scraping');
    setError('');

    analytics.extractionStarted(sessionId, url.trim(), attempts + 1);

    const animationStages = [
      { delay: 3000, status: 'extracting' as const },
      { delay: 8000, status: 'creating' as const },
    ];

    const timers = animationStages.map((stage) =>
      setTimeout(() => {
        setStatus((prev) => {
          if (prev === 'scraping' || prev === 'extracting' || prev === 'creating') return stage.status;
          return prev;
        });
      }, stage.delay)
    );

    try {
      const res = await apiRequest('POST', '/api/onboarding/extract', {
        sessionId,
        websiteUrl: url,
      });
      const data = await res.json();
      timers.forEach(clearTimeout);

      if (data.status === 'success' || data.status === 'partial') {
        setStatus(data.status);
        setResult(data);

        const confidenceValues = Object.values(data.confidenceScores || {}) as number[];
        const avgConfidence = confidenceValues.length > 0
          ? Math.round(confidenceValues.reduce((a: number, b: number) => a + b, 0) / confidenceValues.length)
          : 0;
        analytics.extractionCompleted({
          status: data.status,
          fieldsFound: data.fieldsFound || 0,
          avgConfidence,
          pagesScraped: data.pagesScraped?.length || 0,
          durationMs: data.durationMs || 0,
        });
      } else {
        setStatus('failed');
        setError(data.message || 'Kunde inte analysera webbplatsen');
        analytics.extractionCompleted({
          status: 'failed',
          fieldsFound: 0,
          avgConfidence: 0,
          pagesScraped: 0,
          durationMs: data.durationMs || 0,
        });
      }
      setAttempts((a) => a + 1);
    } catch (err: any) {
      timers.forEach(clearTimeout);
      setStatus('failed');
      let msg = 'Ett oväntat fel inträffade';
      try {
        const parsed = JSON.parse(err.message.split(': ').slice(1).join(': '));
        msg = parsed.message || parsed.error || msg;
      } catch {
        if (err.message.includes('429')) msg = 'För många försök. Vänta en stund.';
        else if (err.message.includes('422')) msg = 'Webbplatsen kunde inte nås.';
      }
      setError(msg);
      setAttempts((a) => a + 1);
    }
  }

  const animationMessages: Record<string, { title: string; subtitle: string }> = {
    scraping: { title: 'Hämtar din webbplats...', subtitle: 'Vi laddar din webbplats och eventuella undersidor.' },
    extracting: { title: 'Analyserar innehållet...', subtitle: 'Vår AI läser igenom webbplatsen.' },
    creating: { title: 'Skapar din företagsprofil...', subtitle: 'Nästan klart!' },
  };

  const isProcessing = status === 'scraping' || status === 'extracting' || status === 'creating';

  return (
    <div className="space-y-6" data-testid="step-url-input">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <Globe className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Ange din företagswebbplats</h2>
        <p className="text-muted-foreground">
          Vi analyserar din webbplats och skapar din företagsprofil automatiskt.
        </p>
      </div>

      {status === 'idle' || status === 'failed' ? (
        <>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://dittforetag.se"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1"
                data-testid="input-website-url"
                onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
              />
              <Button
                onClick={handleExtract}
                disabled={!url.trim()}
                data-testid="button-analyze-website"
              >
                Analysera min webbplats →
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tips: Fungerar bäst med webbplatser som har en "Om oss"-sida.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Kunde inte analysera webbplatsen</p>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                  {attempts < 3 && (
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => { setStatus('idle'); setError(''); }}>
                        Prova en annan URL
                      </Button>
                      <Button size="sm" variant="outline" onClick={onSkipToManual}>
                        Fyll i manuellt
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      ) : isProcessing ? (
        <div className="text-center py-12 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <div>
            <h3 className="text-lg font-semibold">{animationMessages[status]?.title}</h3>
            <p className="text-sm text-muted-foreground">{animationMessages[status]?.subtitle}</p>
          </div>
          <div className="flex justify-center gap-1">
            {['scraping', 'extracting', 'creating'].map((s, i) => (
              <div
                key={s}
                className={`w-12 h-1 rounded-full transition-colors ${
                  ['scraping', 'extracting', 'creating'].indexOf(status) >= i
                    ? 'bg-primary'
                    : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
      ) : (status === 'success' || status === 'partial') && result ? (
        <div className="space-y-4">
          <div className={`p-4 rounded-lg border ${
            status === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
          }`}>
            <div className="flex items-start gap-3">
              {status === 'success' ? (
                <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
              )}
              <div>
                <p className="font-semibold">
                  {status === 'success'
                    ? 'Vi hittade information om ditt företag!'
                    : 'Vi hittade en del information'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.message}
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={() => {
              onSuccess(
                result.extractedData,
                result.mappedProfile,
                Object.keys(result.extractedData).filter(
                  (k) =>
                    result.extractedData[k] !== null &&
                    result.extractedData[k] !== undefined &&
                    k !== 'confidence' &&
                    k !== 'extractedFrom' &&
                    k !== 'extractionNotes'
                )
              );
            }}
            size="lg"
            className="w-full"
            data-testid="button-review-profile"
          >
            {status === 'success' ? 'Granska uppgifterna →' : 'Granska och komplettera →'}
          </Button>
        </div>
      ) : null}

      <div className="flex justify-between items-center pt-4 border-t">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-step2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <button
          onClick={onSkipToManual}
          className="text-sm text-muted-foreground hover:text-foreground underline"
          data-testid="button-manual-entry"
        >
          Har ingen webbplats? Fyll i manuellt
        </button>
      </div>
    </div>
  );
}

function ConfidenceBadge({ field, confidence, isAutoFilled }: { field: string; confidence: Record<string, number>; isAutoFilled: boolean }) {
  if (!isAutoFilled) return null;
  const score = confidence[field] ?? 0;
  if (score >= 70) {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs gap-1">
        <CheckCircle className="h-3 w-3" /> AI
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs gap-1">
      <AlertTriangle className="h-3 w-3" /> Osäker ({score}%)
    </Badge>
  );
}

function ReviewProfileStep({
  extractedData,
  profileData,
  autoFilledFields,
  onProfileChange,
  onSave,
  onBack,
}: {
  extractedData: ExtractedData | null;
  profileData: Record<string, any>;
  autoFilledFields: string[];
  onProfileChange: (field: string, value: any) => void;
  onSave: (profile: Record<string, any>) => Promise<{ error: string } | undefined | void>;
  onBack: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [revenueRange, setRevenueRange] = useState<string>('');
  const [locationInput, setLocationInput] = useState<string>('');
  const [focusAreaTags, setFocusAreaTags] = useState<string[]>([]);
  const [focusAreaInput, setFocusAreaInput] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    const extractedLocation = extractedData?.city
      ? `${extractedData.city}${extractedData.region ? `, ${extractedData.region}` : ''}`
      : '';
    if (extractedLocation && !locationInput) setLocationInput(extractedLocation);
  }, [extractedData]);

  useEffect(() => {
    if (focusAreaTags.length === 0) {
      const extracted = [
        ...(extractedData?.technologyAreas || []),
        ...(extractedData?.industryKeywords || []),
      ].filter(Boolean);
      if (extracted.length > 0) setFocusAreaTags(extracted.slice(0, 10));
    }
  }, [extractedData]);

  const confidence = extractedData?.confidence || {};

  const sectorOptions = [
    { value: 'tech', label: 'Tech & Mjukvara' },
    { value: 'cleantech', label: 'Cleantech & Hållbarhet' },
    { value: 'life_science', label: 'Life Science & Medicin' },
    { value: 'manufacturing', label: 'Tillverkning & Industri' },
    { value: 'creative', label: 'Kreativa näringar' },
    { value: 'agriculture', label: 'Jordbruk & Livsmedel' },
    { value: 'social', label: 'Social verksamhet' },
    { value: 'other', label: 'Annat' },
  ];

  const employeeOptions = [
    { value: '1-10', label: '1–10' },
    { value: '11-50', label: '11–50' },
    { value: '51-200', label: '51–200' },
    { value: '201-500', label: '201–500' },
    { value: '500+', label: '500+' },
  ];

  const regionOptions = [
    'Stockholm', 'Uppsala', 'Södermanland', 'Östergötland', 'Jönköping',
    'Kronoberg', 'Kalmar', 'Gotland', 'Blekinge', 'Skåne', 'Halland',
    'Västra Götaland', 'Värmland', 'Örebro', 'Västmanland', 'Dalarna',
    'Gävleborg', 'Västernorrland', 'Jämtland', 'Västerbotten', 'Norrbotten',
  ];

  const revenueRangeOptions = [
    { value: '500000', label: 'Under 1 MSEK' },
    { value: '3000000', label: '1–5 MSEK' },
    { value: '12000000', label: '5–20 MSEK' },
    { value: '60000000', label: '20–100 MSEK' },
    { value: '150000000', label: 'Över 100 MSEK' },
  ];

  const businessModelOptions = [
    { value: 'B2B', label: 'B2B' },
    { value: 'B2C', label: 'B2C' },
    { value: 'B2G', label: 'B2G (Offentlig sektor)' },
    { value: 'mixed', label: 'Blandad' },
  ];

  const employeeCountToNumber = (range: string | undefined): number | undefined => {
    const map: Record<string, number> = { '1-10': 5, '11-50': 30, '51-200': 100, '201-500': 350, '500+': 500 };
    return range ? map[range] : undefined;
  };

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const empCount = extractedData?.employeeCount || profileData.employeeCount;
    const finalFocusAreas = focusAreaTags.length > 0 ? focusAreaTags : [];
    const finalProfile = {
      companyName: profileData.companyName || extractedData?.companyName || '',
      orgNumber: profileData.orgNumber || extractedData?.orgNumber,
      industry: profileData.industry || extractedData?.sector,
      employees: employeeCountToNumber(empCount),
      revenue: revenueRange || undefined,
      foundedYear: profileData.foundedYear || extractedData?.foundedYear,
      description: profileData.description || extractedData?.description,
      location: locationInput || (extractedData?.city ? `${extractedData.city}${extractedData.region ? `, ${extractedData.region}` : ''}` : ''),
      websiteUrl: profileData.websiteUrl,
      focusAreas: finalFocusAreas,
    };
    const result = await onSave(finalProfile);
    if (result?.error) {
      setSaveError(result.error);
      toast({
        title: 'Kunde inte spara',
        description: 'Kontrollera att företagsnamn är ifyllt och försök igen.',
        variant: 'destructive',
      });
    }
    setSaving(false);
  }

  const companyName = profileData.companyName ?? extractedData?.companyName ?? '';
  const orgNumber = profileData.orgNumber ?? extractedData?.orgNumber ?? '';
  const foundedYear = profileData.foundedYear ?? extractedData?.foundedYear ?? '';
  const description = profileData.description ?? extractedData?.description ?? '';
  const sector = profileData.industry ?? extractedData?.sector ?? '';
  const employeeCount = profileData.employeeCount ?? extractedData?.employeeCount ?? '';
  const city = profileData.city ?? extractedData?.city ?? '';
  const region = profileData.region ?? extractedData?.region ?? '';
  const businessModel = profileData.businessModel ?? extractedData?.businessModel ?? '';
  const isExportFocused = profileData.isExportFocused ?? extractedData?.isExportFocused ?? false;
  const hasRdFocus = profileData.hasRdFocus ?? extractedData?.hasRdFocus ?? false;
  const sustainabilityFocus = profileData.sustainabilityFocus ?? extractedData?.sustainabilityFocus ?? false;

  return (
    <div className="space-y-6" data-testid="step-review-profile">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Granska din företagsprofil</h2>
        <p className="text-muted-foreground">
          {extractedData
            ? 'Vi har fyllt i uppgifterna baserat på din webbplats. Kontrollera att allt stämmer.'
            : 'Fyll i uppgifterna om ditt företag.'}
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Förbättrar din matchning</span>
          </div>
          <div>
            <Label className="mb-1.5 block">Ungefärlig årsomsättning</Label>
            <Select value={revenueRange} onValueChange={setRevenueRange}>
              <SelectTrigger data-testid="select-review-revenue">
                <SelectValue placeholder="Välj omsättningsintervall" />
              </SelectTrigger>
              <SelectContent>
                {revenueRangeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">Var finns företaget?</Label>
            <Input
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder="t.ex. Stockholm, Göteborg, Malmö"
              data-testid="input-review-location"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Fokusområden</Label>
            <p className="text-xs text-muted-foreground mb-2">Vad jobbar ni med? Lägg till nyckelord.</p>
            {(() => {
              const sectorVal = (profileData.industry || extractedData?.sector || '').toLowerCase();
              let suggestions: string[];
              if (sectorVal.includes('tech') || sectorVal.includes('it') || sectorVal.includes('mjukvara') || sectorVal.includes('teknik')) {
                suggestions = ['AI', 'SaaS', 'digitalisering', 'mjukvara'];
              } else if (sectorVal.includes('hälsa') || sectorVal.includes('life') || sectorVal.includes('medicin') || sectorVal.includes('health')) {
                suggestions = ['medtech', 'life science', 'hälsodata'];
              } else if (sectorVal.includes('energi') || sectorVal.includes('clean') || sectorVal.includes('hållbar')) {
                suggestions = ['cleantech', 'förnybar energi', 'energieffektivisering'];
              } else {
                suggestions = ['innovation', 'hållbarhet', 'export', 'forskning'];
              }
              const availableSuggestions = suggestions.filter(s => !focusAreaTags.some(t => t.toLowerCase() === s.toLowerCase()));
              return availableSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-2" data-testid="focus-area-suggestions">
                  {availableSuggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      className="px-2.5 py-1 text-xs rounded-full border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      onClick={() => setFocusAreaTags(prev => [...prev, s])}
                      data-testid={`suggestion-${s.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
            {focusAreaTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2" data-testid="focus-area-tags">
                {focusAreaTags.map((tag, i) => (
                  <span
                    key={`${tag}-${i}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-primary/10 text-primary font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setFocusAreaTags(prev => prev.filter((_, idx) => idx !== i))}
                      className="hover:text-destructive transition-colors"
                      data-testid={`remove-tag-${i}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              value={focusAreaInput}
              onChange={(e) => setFocusAreaInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ',') && focusAreaInput.trim()) {
                  e.preventDefault();
                  const newTag = focusAreaInput.replace(/,/g, '').trim();
                  if (newTag && !focusAreaTags.some(t => t.toLowerCase() === newTag.toLowerCase())) {
                    setFocusAreaTags(prev => [...prev, newTag]);
                  }
                  setFocusAreaInput('');
                }
              }}
              placeholder="t.ex. AI, hållbarhet, SaaS, e-handel..."
              data-testid="input-review-focus-areas"
            />
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Grundinformation</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label>Företagsnamn *</Label>
                <ConfidenceBadge field="companyName" confidence={confidence} isAutoFilled={autoFilledFields.includes('companyName')} />
              </div>
              <Input
                value={companyName}
                onChange={(e) => onProfileChange('companyName', e.target.value)}
                placeholder="Ditt företagsnamn"
                data-testid="input-review-company-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Label>Org.nummer</Label>
                  <ConfidenceBadge field="orgNumber" confidence={confidence} isAutoFilled={autoFilledFields.includes('orgNumber')} />
                </div>
                <Input
                  value={orgNumber}
                  onChange={(e) => onProfileChange('orgNumber', e.target.value)}
                  placeholder="556123-4567"
                  data-testid="input-review-org-number"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Label>Grundat år</Label>
                  <ConfidenceBadge field="foundedYear" confidence={confidence} isAutoFilled={autoFilledFields.includes('foundedYear')} />
                </div>
                <Input
                  type="number"
                  value={foundedYear}
                  onChange={(e) => onProfileChange('foundedYear', parseInt(e.target.value) || null)}
                  placeholder="2019"
                  data-testid="input-review-founded-year"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label>Beskrivning *</Label>
                <ConfidenceBadge field="description" confidence={confidence} isAutoFilled={autoFilledFields.includes('description')} />
              </div>
              <Textarea
                value={description}
                onChange={(e) => onProfileChange('description', e.target.value)}
                placeholder="Beskriv ditt företag i 2-4 meningar..."
                rows={4}
                data-testid="input-review-description"
              />
              {confidence.description > 0 && confidence.description < 70 && (
                <p className="text-xs text-amber-600 mt-1">
                  AI-konfidens: {confidence.description}% — verifiera gärna
                </p>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Bransch & Teknik</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label>Sektor *</Label>
                <ConfidenceBadge field="sector" confidence={confidence} isAutoFilled={autoFilledFields.includes('sector')} />
              </div>
              <Select value={sector} onValueChange={(v) => onProfileChange('industry', v)}>
                <SelectTrigger data-testid="select-review-sector">
                  <SelectValue placeholder="Välj sektor" />
                </SelectTrigger>
                <SelectContent>
                  {sectorOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {extractedData?.technologyAreas && extractedData.technologyAreas.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Label>Teknikområden</Label>
                  <ConfidenceBadge field="technologyAreas" confidence={confidence} isAutoFilled={autoFilledFields.includes('technologyAreas')} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {extractedData.technologyAreas.map((area) => (
                    <Badge key={area} variant="secondary">{area}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label>Antal anställda *</Label>
                <ConfidenceBadge field="employeeCount" confidence={confidence} isAutoFilled={autoFilledFields.includes('employeeCount')} />
              </div>
              <Select value={employeeCount} onValueChange={(v) => onProfileChange('employeeCount', v)}>
                <SelectTrigger data-testid="select-review-employees">
                  <SelectValue placeholder="Välj antal" />
                </SelectTrigger>
                <SelectContent>
                  {employeeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Geografi</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label>Stad *</Label>
                <ConfidenceBadge field="city" confidence={confidence} isAutoFilled={autoFilledFields.includes('city')} />
              </div>
              <Input
                value={city}
                onChange={(e) => onProfileChange('city', e.target.value)}
                placeholder="Stockholm"
                data-testid="input-review-city"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label>Län/Region *</Label>
              </div>
              <Select value={region} onValueChange={(v) => onProfileChange('region', v)}>
                <SelectTrigger data-testid="select-review-region">
                  <SelectValue placeholder="Välj region" />
                </SelectTrigger>
                <SelectContent>
                  {regionOptions.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">För bättre matchning (valfritt)</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label>Affärsmodell</Label>
                <ConfidenceBadge field="businessModel" confidence={confidence} isAutoFilled={autoFilledFields.includes('businessModel')} />
              </div>
              <Select value={businessModel} onValueChange={(v) => onProfileChange('businessModel', v)}>
                <SelectTrigger data-testid="select-review-business-model">
                  <SelectValue placeholder="Välj modell" />
                </SelectTrigger>
                <SelectContent>
                  {businessModelOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="export"
                  checked={isExportFocused}
                  onCheckedChange={(c) => onProfileChange('isExportFocused', !!c)}
                  data-testid="checkbox-export"
                />
                <label htmlFor="export" className="text-sm">Vi säljer internationellt</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rd"
                  checked={hasRdFocus}
                  onCheckedChange={(c) => onProfileChange('hasRdFocus', !!c)}
                  data-testid="checkbox-rd"
                />
                <label htmlFor="rd" className="text-sm">Vi bedriver aktiv forskning och produktutveckling</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sustainability"
                  checked={sustainabilityFocus}
                  onCheckedChange={(c) => onProfileChange('sustainabilityFocus', !!c)}
                  data-testid="checkbox-sustainability"
                />
                <label htmlFor="sustainability" className="text-sm">Hållbarhet är centralt för vår verksamhet</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {saveError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{saveError}</p>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-4 border-t">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-step3">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Ändra URL
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !companyName}
          data-testid="button-save-profile"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Spara och fortsätt →
        </Button>
      </div>
    </div>
  );
}

