import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Building2, MapPin, Users, Calendar, Banknote, Save, Plus, Trash2, Bell, Sparkles, Target, FileText, Globe, Hash, Loader2, CheckCircle2, AlertCircle, X, ShieldCheck, Database, Brain, Flag, TrendingUp, CircleCheck, CircleX } from "lucide-react";
import { MARKETS, setMarket as setGlobalMarket, getMarket, type MarketCode } from "@/components/market-selector";
import { SEO } from '@/components/seo';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { FormSkeleton } from "@/components/loading-skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Company } from "@shared/schema";
import { insertCompanySchema } from "@shared/schema";
import { z } from "zod";

const formSchema = insertCompanySchema.extend({
  companyName: z.string().min(1, "Företagsnamn krävs"),
  orgNumber: z.string().optional().nullable(),
  orgType: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  employees: z.preprocess(
    (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
    z.number().int().positive().optional()
  ),
  revenue: z.preprocess(
    (val) => (val === "" || val === null || val === undefined) ? undefined : String(val),
    z.string().optional()
  ),
  foundedYear: z.preprocess(
    (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
    z.number().int().min(1800).max(new Date().getFullYear()).optional()
  ),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  websiteUrl: z.string().optional().nullable(),
  focusAreas: z.array(z.string()).optional().nullable(),
  notificationEmail: z.string().email("Ogiltig e-postadress").optional().nullable().or(z.literal("")),
  notificationsEnabled: z.boolean().optional().default(true),
  market: z.string().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

const orgTypes = [
  { value: "aktiebolag", label: "Aktiebolag (AB)" },
  { value: "enskild_firma", label: "Enskild firma" },
  { value: "handelsbolag", label: "Handelsbolag (HB)" },
  { value: "kommanditbolag", label: "Kommanditbolag (KB)" },
  { value: "ekonomisk_forening", label: "Ekonomisk förening" },
  { value: "ideell_forening", label: "Ideell förening" },
  { value: "stiftelse", label: "Stiftelse" },
];

interface AiExtractedProfile {
  companyName?: string;
  orgNumber?: string;
  industry?: string;
  employees?: number;
  foundedYear?: number;
  description?: string;
  location?: string;
  websiteUrl?: string;
  focusAreas?: string[];
  confidence?: Record<string, number>;
  fieldsFound?: number;
}

interface AiDiffField {
  key: string;
  label: string;
  aiValue: string;
  currentValue: string;
  selected: boolean;
  confidence: number;
}

function SmartOnboardingSection({ onProfileReady, autoFocus }: { onProfileReady: (profile: any) => void; autoFocus?: boolean }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [autoFocus]);

  async function handleResearch() {
    if (!input.trim()) return;
    setIsAnalyzing(true);
    setError("");

    try {
      const res = await apiRequest("POST", "/api/onboarding/extract", {
        websiteUrl: input.trim(),
        context: "profile_edit",
      });
      const data = await res.json();

      if (data.status === "success" || data.status === "partial") {
        onProfileReady({
          ...data.mappedProfile,
          confidence: data.confidenceScores,
          fieldsFound: data.fieldsFound,
          dataSources: ["website", "ai_analysis"],
        });
      } else {
        setError(data.message || t("smartOnboarding.notFound"));
      }
    } catch (err) {
      setError(t("smartOnboarding.error"));
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <Card className="max-w-2xl border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardContent className="p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h3 className="font-semibold text-lg mb-1" data-testid="text-smart-onboarding-title">
                {t("smartOnboarding.title")}
              </h3>
              <p className="text-sm text-muted-foreground" data-testid="text-smart-onboarding-desc">
                {t("smartOnboarding.description")}
              </p>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="https://dittforetag.se"
                  disabled={isAnalyzing}
                  onKeyDown={(e) => e.key === "Enter" && handleResearch()}
                  data-testid="input-smart-onboarding"
                />
              </div>
              <Button
                onClick={handleResearch}
                disabled={isAnalyzing || !input.trim()}
                data-testid="button-analyze-company"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("smartOnboarding.analyzing")}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t("smartOnboarding.analyze")}
                  </>
                )}
              </Button>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive" data-testid="text-smart-onboarding-error">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {t("smartOnboarding.hint")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AiDiffApplyPanel({
  diffFields,
  onApplySelected,
  onApplyAll,
  onDismiss,
  onToggleField,
}: {
  diffFields: AiDiffField[];
  onApplySelected: () => void;
  onApplyAll: () => void;
  onDismiss: () => void;
  onToggleField: (key: string) => void;
}) {
  const { t } = useTranslation();

  if (diffFields.length === 0) return null;

  return (
    <Card className="max-w-2xl border-blue-500/30 bg-blue-50/50 dark:bg-blue-900/10" data-testid="ai-diff-panel">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            <p className="font-medium text-sm">{t("smartOnboarding.reviewChanges")}</p>
          </div>
          <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground" data-testid="button-dismiss-diff">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {diffFields.map((field) => (
            <label
              key={field.key}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                field.selected ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-muted/50'
              }`}
              data-testid={`diff-field-${field.key}`}
            >
              <input
                type="checkbox"
                checked={field.selected}
                onChange={() => onToggleField(field.key)}
                className="mt-1 accent-primary"
                data-testid={`checkbox-diff-${field.key}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
                  {field.confidence >= 70 ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {field.confidence}%
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs gap-1">
                      <AlertCircle className="h-3 w-3" /> {field.confidence}%
                    </Badge>
                  )}
                </div>
                {field.currentValue && (
                  <p className="text-xs text-muted-foreground line-through">{field.currentValue}</p>
                )}
                <p className="text-sm font-medium">{field.aiValue}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={onApplyAll}
            data-testid="button-apply-all"
          >
            {t("smartOnboarding.applyAll")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onApplySelected}
            disabled={!diffFields.some((f) => f.selected)}
            data-testid="button-apply-selected"
          >
            {t("smartOnboarding.applySelected")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            data-testid="button-dismiss-changes"
          >
            {t("common.cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FocusAreasInput({ value, onChange }: { value: string[]; onChange: (areas: string[]) => void }) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");

  function addArea() {
    const trimmed = inputValue.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setInputValue("");
    }
  }

  function removeArea(area: string) {
    onChange(value.filter(a => a !== area));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={t("company.form.focusAreasPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addArea();
            }
          }}
          data-testid="input-focus-area"
        />
        <Button type="button" variant="outline" onClick={addArea} data-testid="button-add-focus-area">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((area) => (
            <Badge key={area} variant="secondary" className="gap-1">
              {area}
              <button
                type="button"
                onClick={() => removeArea(area)}
                className="ml-1"
                data-testid={`button-remove-focus-area-${area}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CompanyProfile() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const aiAutoFocus = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ai') === '1';
  const [aiProfileApplied, setAiProfileApplied] = useState(false);
  const [aiConfidence, setAiConfidence] = useState(0);
  const [aiDataSources, setAiDataSources] = useState<string[]>([]);
  const [aiFieldsCount, setAiFieldsCount] = useState(0);
  const [diffFields, setDiffFields] = useState<AiDiffField[]>([]);
  const [aiExtractedProfile, setAiExtractedProfile] = useState<AiExtractedProfile | null>(null);

  const industries = [
    { key: "techIT", label: t('company.industries.techIT') },
    { key: "healthMedicine", label: t('company.industries.healthMedicine') },
    { key: "energyEnvironment", label: t('company.industries.energyEnvironment') },
    { key: "manufacturing", label: t('company.industries.manufacturing') },
    { key: "services", label: t('company.industries.services') },
    { key: "retail", label: t('company.industries.retail') },
    { key: "transportLogistics", label: t('company.industries.transportLogistics') },
    { key: "constructionRealEstate", label: t('company.industries.constructionRealEstate') },
    { key: "finance", label: t('company.industries.finance') },
    { key: "education", label: t('company.industries.education') },
    { key: "mediaEntertainment", label: t('company.industries.mediaEntertainment') },
    { key: "agriculture", label: t('company.industries.agriculture') },
    { key: "other", label: t('company.industries.other') },
  ];

  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
    refetchOnMount: "always",
  });

  const existingCompany = companies?.[0];

  const revenueRef = useRef<HTMLDivElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);
  const focusAreasRef = useRef<HTMLDivElement>(null);
  const industryRef = useRef<HTMLDivElement>(null);
  const employeesRef = useRef<HTMLDivElement>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      orgNumber: "",
      orgType: "",
      industry: "",
      employees: undefined,
      revenue: "",
      foundedYear: undefined,
      description: "",
      location: "",
      websiteUrl: "",
      focusAreas: [],
      notificationEmail: "",
      notificationsEnabled: true,
      market: "se",
    },
    values: existingCompany ? {
      companyName: existingCompany.companyName,
      orgNumber: existingCompany.orgNumber || "",
      orgType: (existingCompany as any).orgType || "",
      industry: existingCompany.industry || "",
      employees: existingCompany.employees || undefined,
      revenue: existingCompany.revenue || "",
      foundedYear: existingCompany.foundedYear || undefined,
      description: existingCompany.description || "",
      location: existingCompany.location || "",
      websiteUrl: (existingCompany as any).websiteUrl || "",
      focusAreas: (existingCompany as any).focusAreas || [],
      notificationEmail: existingCompany.notificationEmail || "",
      notificationsEnabled: existingCompany.notificationsEnabled ?? true,
      market: (existingCompany as any).market || "se",
    } : undefined,
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("POST", "/api/companies", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/onboarding-progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile-completion"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grants/top-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grants"] });
      toast({
        title: "Profil skapad",
        description: "Profil skapad — dina matchningar har beräknats",
      });
    },
    onError: () => {
      toast({
        title: t('company.toast.createError'),
        description: t('company.toast.createErrorDesc'),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("PATCH", `/api/companies/${existingCompany!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/onboarding-progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile-completion"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grants/top-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grants"] });
      toast({
        title: "Profil uppdaterad",
        description: "Profil uppdaterad — dina matchningar har förbättrats",
      });
    },
    onError: async (error, variables) => {
      const errorMsg = error.message || "";
      if (errorMsg.includes("404") || errorMsg.includes("Company not found") || errorMsg.includes("not found")) {
        queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
        createMutation.mutate(variables);
        return;
      }
      toast({
        title: t('company.toast.updateError'),
        description: t('company.toast.updateErrorDesc'),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/companies/${existingCompany!.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      form.reset({
        companyName: "",
        orgNumber: "",
        orgType: "",
        industry: "",
        employees: undefined,
        revenue: "",
        foundedYear: undefined,
        description: "",
        location: "",
        websiteUrl: "",
        focusAreas: [],
        notificationEmail: "",
        notificationsEnabled: true,
      });
      toast({
        title: t('company.toast.deleted'),
        description: t('company.toast.deletedDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('company.toast.deleteError'),
        description: t('company.toast.deleteErrorDesc'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    const cleanedData = {
      companyName: data.companyName,
      orgNumber: data.orgNumber === "" ? undefined : data.orgNumber,
      orgType: data.orgType === "" ? undefined : data.orgType,
      industry: data.industry === "" ? undefined : data.industry,
      employees: data.employees,
      revenue: data.revenue === "" ? undefined : data.revenue,
      foundedYear: data.foundedYear,
      description: data.description === "" ? undefined : data.description,
      location: data.location === "" ? undefined : data.location,
      websiteUrl: data.websiteUrl === "" ? undefined : data.websiteUrl,
      focusAreas: data.focusAreas && data.focusAreas.length > 0 ? data.focusAreas : undefined,
      notificationEmail: data.notificationEmail === "" ? undefined : data.notificationEmail,
      notificationsEnabled: data.notificationsEnabled,
      market: data.market || "se",
    };

    if (data.market) {
      const mk = MARKETS.find((m) => m.code === data.market);
      if (mk) {
        setGlobalMarket(mk.code);
      }
    }
    
    if (existingCompany) {
      updateMutation.mutate(cleanedData as FormData);
    } else {
      createMutation.mutate(cleanedData as FormData);
    }
  };

  function handleAiProfile(profile: any) {
    setAiExtractedProfile(profile);

    const fieldLabels: Record<string, string> = {
      companyName: t("company.form.name"),
      orgNumber: t("company.form.orgNumber"),
      industry: t("company.form.industry"),
      employees: t("company.form.employees"),
      foundedYear: t("company.form.foundedYear"),
      description: t("company.form.description"),
      location: t("company.form.location"),
      focusAreas: t("company.form.focusAreas"),
    };

    const fieldMap: Record<string, { ai: any; current: any; formKey: keyof FormData }> = {
      companyName: { ai: profile.companyName, current: form.getValues("companyName"), formKey: "companyName" },
      orgNumber: { ai: profile.orgNumber, current: form.getValues("orgNumber"), formKey: "orgNumber" },
      industry: { ai: profile.industry, current: form.getValues("industry"), formKey: "industry" },
      employees: { ai: profile.employees, current: form.getValues("employees"), formKey: "employees" },
      foundedYear: { ai: profile.foundedYear, current: form.getValues("foundedYear"), formKey: "foundedYear" },
      description: { ai: profile.description, current: form.getValues("description"), formKey: "description" },
      location: { ai: profile.location, current: form.getValues("location"), formKey: "location" },
      focusAreas: { ai: profile.focusAreas?.join(", "), current: form.getValues("focusAreas")?.join(", "), formKey: "focusAreas" },
    };

    const confidence = profile.confidence || {};
    const newDiffFields: AiDiffField[] = [];

    for (const [key, { ai, current }] of Object.entries(fieldMap)) {
      const aiStr = ai != null ? String(ai) : "";
      const curStr = current != null ? String(current) : "";
      if (aiStr && aiStr !== curStr) {
        newDiffFields.push({
          key,
          label: fieldLabels[key] || key,
          aiValue: aiStr,
          currentValue: curStr,
          selected: true,
          confidence: confidence[key] ?? 0,
        });
      }
    }

    if (newDiffFields.length === 0) {
      toast({
        title: t("smartOnboarding.profileFound"),
        description: t("smartOnboarding.noChanges"),
      });
      return;
    }

    setDiffFields(newDiffFields);
    setAiConfidence(
      Object.values(confidence).length > 0
        ? Math.round(
            (Object.values(confidence) as number[]).reduce((a: number, b: number) => a + b, 0) /
            (Object.values(confidence) as number[]).length
          )
        : 0
    );
    setAiDataSources(profile.dataSources || []);
    setAiFieldsCount(newDiffFields.length);
  }

  function applyAiFields(fieldsToApply: AiDiffField[]) {
    if (!aiExtractedProfile) return;

    for (const field of fieldsToApply) {
      if (field.key === "focusAreas") {
        form.setValue("focusAreas", aiExtractedProfile.focusAreas || []);
      } else {
        form.setValue(field.key as keyof FormData, (aiExtractedProfile as any)[field.key] ?? "");
      }
    }

    setDiffFields([]);
    setAiProfileApplied(true);

    toast({
      title: t("smartOnboarding.profileFound"),
      description: t("smartOnboarding.profileFoundDesc"),
    });
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('company.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('company.subtitle')}
          </p>
        </div>
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{t('common.loading')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormSkeleton />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SEO title={t('company.title')} noindex={true} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-company-title">{t('company.title')}</h1>
        <p className="text-muted-foreground mt-1" data-testid="text-company-subtitle">
          {t('company.subtitle')}
        </p>
      </div>

      {!isLoading && !aiProfileApplied && diffFields.length === 0 && (
        <SmartOnboardingSection onProfileReady={handleAiProfile} autoFocus={aiAutoFocus} />
      )}

      {diffFields.length > 0 && (
        <AiDiffApplyPanel
          diffFields={diffFields}
          onApplyAll={() => applyAiFields(diffFields)}
          onApplySelected={() => applyAiFields(diffFields.filter((f) => f.selected))}
          onDismiss={() => setDiffFields([])}
          onToggleField={(key) =>
            setDiffFields((prev) =>
              prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f))
            )
          }
        />
      )}

      {aiProfileApplied && (
        <Card className="max-w-2xl border-green-500/30 bg-green-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm" data-testid="text-ai-profile-applied">{t("smartOnboarding.profileFound")}</p>
                <p className="text-xs text-muted-foreground">{t("smartOnboarding.reviewBeforeSave")}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={aiConfidence >= 0.7 ? "default" : "secondary"}
                data-testid="badge-ai-confidence"
              >
                <ShieldCheck className="h-3 w-3 mr-1" />
                {aiConfidence >= 0.7
                  ? t("smartOnboarding.confidenceHigh")
                  : aiConfidence >= 0.4
                    ? t("smartOnboarding.confidenceMedium")
                    : t("smartOnboarding.confidenceLow")}
              </Badge>

              <Badge variant="outline" data-testid="badge-ai-fields-count">
                {t("smartOnboarding.fieldsFound", { count: aiFieldsCount })}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {aiDataSources.includes("website") && (
                <Badge variant="outline" data-testid="badge-source-website">
                  <Globe className="h-3 w-3 mr-1" />
                  {t("smartOnboarding.sourceWebsite")}
                </Badge>
              )}
              {aiDataSources.includes("public_records") && (
                <Badge variant="outline" data-testid="badge-source-public">
                  <Database className="h-3 w-3 mr-1" />
                  {t("smartOnboarding.sourcePublicRecords")}
                </Badge>
              )}
              {aiDataSources.includes("ai_analysis") && (
                <Badge variant="outline" data-testid="badge-source-ai">
                  <Brain className="h-3 w-3 mr-1" />
                  {t("smartOnboarding.sourceAi")}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!existingCompany && !aiProfileApplied && (
        <Card className="max-w-2xl border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="p-6">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg mb-1" data-testid="text-company-cta-title">{t('company.whyCreate')}</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 shrink-0 text-primary" />
                    <span data-testid="text-cta-matching">{t('company.ctaMatching')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span data-testid="text-cta-generation">{t('company.ctaGeneration')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 shrink-0 text-primary" />
                    <span data-testid="text-cta-notifications">{t('company.ctaNotifications')}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {existingCompany && (() => {
        const watched = form.watch();
        const hasIndustry = !!(watched.industry && watched.industry.length > 0);
        const hasEmployees = !!(watched.employees && watched.employees > 0);
        const hasRevenue = !!(watched.revenue && watched.revenue.length > 0 && watched.revenue !== '0');
        const hasLocation = !!(watched.location && watched.location.length > 0);
        const hasFocusAreas = !!(watched.focusAreas && watched.focusAreas.length > 0);
        const strength = (hasIndustry ? 30 : 0) + (hasEmployees ? 20 : 0) + (hasRevenue ? 20 : 0) + (hasLocation ? 15 : 0) + (hasFocusAreas ? 15 : 0);
        const fields = [
          { name: 'Bransch', filled: hasIndustry, weight: 30, ref: industryRef },
          { name: 'Antal anställda', filled: hasEmployees, weight: 20, ref: employeesRef },
          { name: 'Omsättning', filled: hasRevenue, weight: 20, ref: revenueRef },
          { name: 'Ort', filled: hasLocation, weight: 15, ref: locationRef },
          { name: 'Fokusområden', filled: hasFocusAreas, weight: 15, ref: focusAreasRef },
        ];
        const missingFields = fields.filter(f => !f.filled);
        return (
          <Card className="max-w-2xl" data-testid="card-matching-strength">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5" />
                Matchningsstyrka
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Progress value={strength} className="flex-1 h-3" data-testid="progress-matching" />
                <span className="text-sm font-semibold w-10 text-right" data-testid="text-matching-pct">{strength}%</span>
              </div>
              {missingFields.length > 0 && (
                <p className="text-sm text-muted-foreground">Lägg till dessa fält för bättre träffar:</p>
              )}
              <div className="space-y-2">
                {fields.map(f => (
                  <div key={f.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {f.filled
                        ? <CircleCheck className="h-4 w-4 text-green-600" />
                        : <CircleX className="h-4 w-4 text-muted-foreground" />
                      }
                      <span className={f.filled ? 'text-foreground' : 'text-muted-foreground'}>
                        {f.name}
                        {!f.filled && <span className="ml-1 text-xs">(+{f.weight}% träffsäkerhet)</span>}
                      </span>
                    </div>
                    {!f.filled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-primary"
                        onClick={() => f.ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        data-testid={`button-fill-${f.name.toLowerCase().replace(/\s/g, '-')}`}
                      >
                        Fyll i
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {existingCompany ? t('company.editProfile') : t('company.createProfile')}
          </CardTitle>
          <CardDescription>
            {existingCompany 
              ? t('company.editDesc')
              : t('company.createDesc')
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('company.form.companyName')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('company.form.companyNamePlaceholder')} {...field} data-testid="input-company-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="orgNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('company.form.orgNumber')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('company.form.orgNumberPlaceholder')} {...field} value={field.value ?? ""} data-testid="input-org-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="orgType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('company.form.orgType')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-org-type">
                            <SelectValue placeholder={t('company.form.selectOrgType')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {orgTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="foundedYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('company.form.foundedYear')}</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="2020" 
                          {...field} 
                          value={field.value ?? ""}
                          data-testid="input-founded-year" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="websiteUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('company.form.websiteUrl')}</FormLabel>
                      <FormControl>
                        <Input placeholder="https://www.mittforetag.se" {...field} value={field.value ?? ""} data-testid="input-website-url" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div ref={industryRef}>
                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('company.form.industry')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-industry">
                            <SelectValue placeholder={t('company.form.selectIndustry')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {industries.map((industry) => (
                            <SelectItem key={industry.key} value={industry.label}>
                              {industry.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div ref={employeesRef} className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="employees"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('company.form.employees')}</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="10" 
                          {...field} 
                          value={field.value ?? ""}
                          data-testid="input-employees" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div ref={revenueRef}>
                <FormField
                  control={form.control}
                  name="revenue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('company.form.revenue')}</FormLabel>
                      <FormControl>
                        <Input placeholder="5000000" {...field} data-testid="input-revenue" />
                      </FormControl>
                      <FormDescription>{t('company.form.revenueDesc')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div ref={locationRef}>
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('company.form.location')}</FormLabel>
                        <FormControl>
                          <Input placeholder="Stockholm" {...field} value={field.value ?? ""} data-testid="input-location" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="market"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('company.form.market', 'Marknad')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? "se"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-market">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MARKETS.map((m) => (
                            <SelectItem key={m.code} value={m.code}>
                              {m.flag} {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>{t('company.form.marketDesc', 'Styr vilka bidrag och vilken valuta som visas')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('company.form.description')}</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={t('company.form.descriptionPlaceholder')}
                        className="min-h-[120px]"
                        {...field}
                        value={field.value ?? ""}
                        data-testid="textarea-description"
                      />
                    </FormControl>
                    <FormDescription>
                      {t('company.form.descriptionHelp')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div ref={focusAreasRef}>
                <FormField
                  control={form.control}
                  name="focusAreas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('company.form.focusAreas')}</FormLabel>
                      <FormControl>
                        <FocusAreasInput
                          value={field.value || []}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('company.form.focusAreasHelp')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    {t('company.notifications.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('company.notifications.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="notificationEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('company.notifications.emailLabel')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="email"
                            placeholder={t('company.notifications.emailPlaceholder')} 
                            {...field}
                            value={field.value ?? ""}
                            data-testid="input-notification-email" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notificationsEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{t('company.notifications.enableLabel')}</FormLabel>
                          <FormDescription>
                            {t('company.notifications.enableDesc')}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-notifications-enabled"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex gap-3 pt-4">
                <Button type="submit" disabled={isPending} data-testid="button-save-company">
                  {isPending ? (
                    <>{t('common.saving')}</>
                  ) : existingCompany ? (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {t('company.saveChanges')}
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('company.createProfileBtn')}
                    </>
                  )}
                </Button>
                {existingCompany && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete-company"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {deleteMutation.isPending ? t('common.deleting') : t('company.deleteProfile')}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
