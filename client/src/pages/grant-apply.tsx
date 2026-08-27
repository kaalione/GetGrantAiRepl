import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import {
  ArrowLeft, ArrowRight, Sparkles, Save, RefreshCw, FileText, Building2,
  Target, Loader2, Download, Copy, Check, ChevronDown, File, ClipboardList,
  AlertTriangle, CheckCircle2, Pencil, Users, MessageSquare, History,
  ShieldCheck, Library, BookOpen, X
} from "lucide-react";
import { ProgressDialog } from "@/components/progress-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Grant, Company, Application, ApplicationSection, ComplianceReport as ComplianceReportType, ContentBlock } from "@shared/schema";
import { useSearchProfiles } from "@/hooks/use-search-profiles";
import { calculateMatchScore } from "@/lib/matching";
import { MatchIndicator } from "@/components/grants/match-indicator";
import { useTranslation } from "react-i18next";
import { analytics } from "@/lib/analytics";
import { EligibilityBadge } from "@/components/eligibility-badge";
import { useAuth } from "@/hooks/use-auth";
import { useCollaborationWS } from "@/hooks/use-collaboration-ws";
import { CollaborationModal } from "@/components/collaboration/collaboration-modal";
import { PresenceBar, SectionPresenceIndicator } from "@/components/collaboration/presence-bar";
import { CommentPanel, CommentTrigger } from "@/components/collaboration/comment-panel";
import { SectionHistoryDrawer } from "@/components/collaboration/section-history-drawer";
import { ComplianceReportPanel } from "@/components/compliance/compliance-report";
import { SuccessFeeOptIn } from "@/components/success-fee/success-fee-opt-in";
import { SEO } from '@/components/seo';

interface GenerationResponse {
  application: Application;
  isFreeTrial?: boolean;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostSEK: number;
  };
}

interface RegenerateResponse {
  application: Application;
  regeneratedSection: ApplicationSection;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostSEK: number;
  };
}

function SectionLibrarySuggestions({ sectionKey, onInsert }: { sectionKey: string; onInsert: (content: string) => void }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const suggestionsQuery = useQuery<ContentBlock[]>({
    queryKey: ['/api/content-library/suggestions', sectionKey],
    staleTime: 60 * 1000,
    retry: false,
  });
  const suggestions = suggestionsQuery.data?.slice(0, 2) || [];
  const isEmpty = !suggestionsQuery.isLoading && suggestions.length === 0;

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-xs text-muted-foreground hover:text-foreground py-1.5 px-1" data-testid={`trigger-library-suggestions-${sectionKey}`}>
        <BookOpen className="h-3.5 w-3.5" />
        <span>{t("contentLibrary.suggestedFromLibrary", "Föreslaget från ditt bibliotek")}</span>
        <ChevronDown className="h-3 w-3 ml-auto" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1 pb-2 px-1">
        {suggestionsQuery.isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("common.loading", "Laddar...")}
          </div>
        )}
        {suggestions.length > 0 && suggestions.map((block) => (
          <div key={block.id} className="border rounded-md p-2.5 mb-1.5 bg-muted/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">{block.title}</span>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => onInsert(block.content)} data-testid={`button-insert-block-${block.id}`}>
                {t("contentLibrary.insert", "Infoga")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{block.content}</p>
          </div>
        ))}
        {isEmpty && (
          <div className="text-xs text-muted-foreground py-2">
            <span>{t("contentLibrary.buildLibraryPrompt", "Bygg ditt bibliotek för att återanvända innehåll i ansökningar")}</span>
            {" "}
            <button className="text-primary underline" onClick={() => navigate("/bibliotek")} data-testid="link-build-library">→</button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

const STEPS = [
  { key: "grant", label: "Bidrag" },
  { key: "company", label: "Företag" },
  { key: "project", label: "Projekt" },
  { key: "result", label: "Ansökan" },
];

export default function GrantApply() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [sections, setSections] = useState<ApplicationSection[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tokenUsage, setTokenUsage] = useState<GenerationResponse["tokenUsage"] | null>(null);
  const [copied, setCopied] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<string>("draft");
  const [approvedAmount, setApprovedAmount] = useState<string>("");
  const [exportLoading, setExportLoading] = useState<"docx" | "pdf" | null>(null);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateDialogStatus, setGenerateDialogStatus] = useState<"loading" | "success" | "error">("loading");
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [projectDescription, setProjectDescription] = useState("");
  const [projectGoals, setProjectGoals] = useState("");
  const [projectBudget, setProjectBudget] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [previousExperience, setPreviousExperience] = useState("");

  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [regenerateSectionKey, setRegenerateSectionKey] = useState("");
  const [regenerateInstructions, setRegenerateInstructions] = useState("");
  const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [activeCommentSection, setActiveCommentSection] = useState<string | null>(null);
  const [activeHistorySection, setActiveHistorySection] = useState<string | null>(null);
  const [libraryDrawerSection, setLibraryDrawerSection] = useState<string | null>(null);
  const [complianceReport, setComplianceReport] = useState<ComplianceReportType | null>(null);
  const [complianceCheckProgress, setComplianceCheckProgress] = useState(0);
  const [complianceDialogOpen, setComplianceDialogOpen] = useState(false);
  const [complianceDialogStatus, setComplianceDialogStatus] = useState<"loading" | "success" | "error">("loading");
  const [isFreeTrial, setIsFreeTrial] = useState(false);

  const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : null;
  const { presenceUsers, updateSectionFocus, notifySectionUpdate, notifyCommentAdded } = useCollaborationWS(
    applicationId,
    user?.id || null,
    userName,
  );

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearProgressInterval();
  }, [clearProgressInterval]);

  const { data: grant, isLoading: grantLoading } = useQuery<Grant>({
    queryKey: ["/api/grants", id],
    queryFn: async () => {
      const res = await fetch(`/api/grants/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Grant not found");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const company = companies?.[0] || null;
  const { selectedProfile } = useSearchProfiles();
  const matchResult = grant && company ? calculateMatchScore(company, grant, selectedProfile) : null;

  const { data: existingApplications } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
    enabled: !!company,
  });

  const existingApp = existingApplications
    ?.filter((app) => app.grantId === id)
    .sort((a, b) => b.id.localeCompare(a.id))[0];

  useEffect(() => {
    if (existingApp) {
      setApplicationId(existingApp.id);
      setApplicationStatus(existingApp.status);
      if (existingApp.approvedAmount) {
        setApprovedAmount(existingApp.approvedAmount.toString());
      }
      if (existingApp.sections && Array.isArray(existingApp.sections) && (existingApp.sections as ApplicationSection[]).length > 0) {
        setSections(existingApp.sections as ApplicationSection[]);
        setStep(3);
      } else if (existingApp.generatedContent) {
        setSections([{
          sectionKey: "legacy_content",
          sectionTitle: "Ansökan",
          content: existingApp.generatedContent,
          wordCount: existingApp.generatedContent.split(/\s+/).filter(Boolean).length,
        }]);
        setStep(3);
      }
      if (existingApp.projectData) {
        const pd = existingApp.projectData as any;
        setProjectDescription(pd.projectDescription || "");
        setProjectGoals(pd.projectGoals || "");
        setProjectBudget(pd.projectBudget?.toString() || "");
        setRequestedAmount(pd.requestedAmount?.toString() || "");
        setPreviousExperience(pd.previousExperience || "");
      }
      if ((existingApp as any).complianceReport) {
        setComplianceReport((existingApp as any).complianceReport as ComplianceReportType);
      }
    }
  }, [existingApp?.id]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      analytics.applicationGenerationStarted(id!);
      setGenerateDialogOpen(true);
      setGenerateDialogStatus("loading");
      setGenerateProgress(0);

      progressIntervalRef.current = setInterval(() => {
        setGenerateProgress((prev) => Math.min(prev + Math.random() * 5 + 1, 90));
      }, 800);

      const response = await apiRequest("POST", "/api/applications/generate", {
        grantId: id,
        companyId: company?.id,
        matchScore: matchResult?.score,
        projectData: {
          projectDescription,
          projectGoals,
          projectBudget: Number(projectBudget) || 0,
          requestedAmount: Number(requestedAmount) || 0,
          previousExperience,
        },
      });
      return response.json() as Promise<GenerationResponse>;
    },
    onSuccess: (data) => {
      clearProgressInterval();
      setGenerateProgress(100);
      setGenerateDialogStatus("success");
      setTimeout(() => setGenerateDialogOpen(false), 1200);

      const app = data.application;
      setApplicationId(app.id);
      if (app.sections && Array.isArray(app.sections)) {
        setSections(app.sections as ApplicationSection[]);
      }
      setWarnings((app.warnings as string[]) || []);
      setTokenUsage(data.tokenUsage);
      setStep(3);

      if (data.isFreeTrial) {
        setIsFreeTrial(true);
        queryClient.invalidateQueries({ queryKey: ["/api/user/status"] });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      toast({
        title: t("grantApply.toast.generated"),
        description: t("grantApply.toast.generatedDesc"),
      });
    },
    onError: (error) => {
      clearProgressInterval();
      setGenerateDialogStatus("error");
      setGenerateProgress(0);
      setTimeout(() => setGenerateDialogOpen(false), 2000);

      const errorMessage = error instanceof Error ? error.message : "";
      const isFreeTrialUsed = errorMessage.includes("gratis ansökan") || errorMessage.includes("Free trial used");

      toast({
        title: isFreeTrialUsed ? "Gratis provansökan använd" : t("grantApply.toast.generateError"),
        description: isFreeTrialUsed
          ? "Du har använt din gratis ansökan. Uppgradera för obegränsad tillgång."
          : (error instanceof Error ? error.message : t("grantApply.toast.generateErrorDesc")),
        variant: "destructive",
      });
    },
  });

  const sectionSaveMutation = useMutation({
    mutationFn: async ({ sectionKey, content }: { sectionKey: string; content: string }) => {
      if (!applicationId) throw new Error("No application");
      return apiRequest("PUT", `/api/applications/${applicationId}/section/${sectionKey}`, { content });
    },
    onSuccess: (_, { sectionKey, content }) => {
      setEditingSectionKey(null);
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      toast({ title: t("grantApply.toast.sectionSaved") || "Avsnitt sparat" });
      if (applicationId) {
        apiRequest('POST', `/api/applications/${applicationId}/sections/${sectionKey}/save`, { content }).catch(() => {});
        notifySectionUpdate(sectionKey, userName || 'Unknown');
        queryClient.invalidateQueries({ queryKey: ['/api/applications', applicationId, 'sections', sectionKey, 'history'] });
      }
    },
    onError: () => {
      toast({ title: t("grantApply.toast.saveError"), variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      if (!applicationId) throw new Error("No application");
      const response = await apiRequest("POST", `/api/applications/${applicationId}/regenerate-section`, {
        sectionKey: regenerateSectionKey,
        instructions: regenerateInstructions,
      });
      return response.json() as Promise<RegenerateResponse>;
    },
    onSuccess: (data) => {
      if (data.regeneratedSection) {
        setSections((prev) =>
          prev.map((s) => (s.sectionKey === data.regeneratedSection.sectionKey ? data.regeneratedSection : s))
        );
      }
      setRegenerateDialogOpen(false);
      setRegenerateInstructions("");
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      toast({ title: t("grantApply.toast.sectionRegenerated") || "Avsnitt omgenererat" });
    },
    onError: (error) => {
      toast({
        title: t("grantApply.toast.generateError"),
        description: error instanceof Error ? error.message : "",
        variant: "destructive",
      });
    },
  });

  const complianceProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const complianceCheckMutation = useMutation({
    mutationFn: async () => {
      if (!applicationId) throw new Error("No application");
      setComplianceDialogOpen(true);
      setComplianceDialogStatus("loading");
      setComplianceCheckProgress(0);

      complianceProgressRef.current = setInterval(() => {
        setComplianceCheckProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 8;
        });
      }, 500);

      const res = await apiRequest("POST", `/api/applications/${applicationId}/compliance-check`);
      return res.json() as Promise<ComplianceReportType>;
    },
    onSuccess: (data) => {
      if (complianceProgressRef.current) clearInterval(complianceProgressRef.current);
      setComplianceCheckProgress(100);
      setComplianceDialogStatus("success");
      setComplianceReport(data);
      setTimeout(() => setComplianceDialogOpen(false), 1200);
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
    },
    onError: () => {
      if (complianceProgressRef.current) clearInterval(complianceProgressRef.current);
      setComplianceDialogStatus("error");
      setTimeout(() => setComplianceDialogOpen(false), 2000);
      toast({
        title: t("compliance.checkFailed", "Compliance-kontroll misslyckades"),
        variant: "destructive",
      });
    },
  });

  const handleFixSection = (sectionKey: string, fixInstructions: string) => {
    setRegenerateSectionKey(sectionKey);
    setRegenerateInstructions(fixInstructions);
    setRegenerateDialogOpen(true);
  };

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      if (!applicationId) throw new Error("No application to update");
      const body: any = { status: newStatus };
      if (newStatus === "submitted") body.submissionMethod = "bidragai";
      if (newStatus === "approved" && approvedAmount) body.approvedAmount = approvedAmount;
      return apiRequest("PATCH", `/api/applications/${applicationId}/status`, body);
    },
    onSuccess: (_, newStatus) => {
      setApplicationStatus(newStatus);
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      toast({ title: t("grantApply.toast.statusUpdated") });
    },
    onError: () => {
      toast({ title: t("grantApply.toast.statusError"), variant: "destructive" });
    },
  });

  const handleExport = async (format: "docx" | "pdf") => {
    if (!applicationId) return;
    setExportLoading(format);
    try {
      const response = await fetch(`/api/applications/${applicationId}/export/${format}`, { credentials: "include" });
      if (!response.ok) {
        if (response.status === 402) {
          toast({
            title: t("grantApply.toast.upgradeToPro"),
            description: t("grantApply.toast.upgradeToProDesc"),
          });
          return;
        }
        throw new Error("Export failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ansokan-${grant?.title?.toLowerCase().replace(/\s+/g, "-") || "bidrag"}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      analytics.applicationExported(applicationId, format);
      toast({ title: t("grantApply.toast.exported"), description: t("grantApply.toast.exportedDesc", { format: format.toUpperCase() }) });
    } catch (error) {
      toast({ title: t("grantApply.toast.exportFailed"), variant: "destructive" });
    } finally {
      setExportLoading(null);
    }
  };

  const handleCopyAll = async () => {
    const allText = sections.map((s) => `## ${s.sectionTitle}\n\n${s.content}`).join("\n\n");
    await navigator.clipboard.writeText(allText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: t("grantApply.toast.copiedTitle") });
  };

  const canProceedToStep = (targetStep: number): boolean => {
    if (targetStep <= step) return true;
    if (targetStep === 1) return !!grant;
    if (targetStep === 2) return !!grant && !!company;
    if (targetStep === 3) return !!grant && !!company && projectDescription.length >= 50;
    return false;
  };

  if (grantLoading || companiesLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!grant) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Button variant="ghost" asChild>
          <Link href="/bidrag">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("grants.backToGrants")}
          </Link>
        </Button>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">{t("grants.notFound")}</h2>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Button variant="ghost" asChild>
          <Link href={`/bidrag/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("grants.backToGrants")}
          </Link>
        </Button>
        <Card className="max-w-lg mx-auto">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <CardTitle>{t("grantApply.companyRequired.title")}</CardTitle>
            <CardDescription>{t("grantApply.companyRequired.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link href="/company">
                <Building2 className="mr-2 h-4 w-4" />
                {t("grantApply.companyRequired.createProfile")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <SEO title={grant?.title ? `Ansök – ${grant.title}` : 'Ansök om bidrag'} noindex={true} />
      <div className="flex items-start gap-3 sm:gap-4">
        <Button variant="ghost" size="icon" className="shrink-0 mt-1" asChild>
          <Link href={`/bidrag/${id}`} data-testid="button-back-to-grant">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("grantApply.title")}</h1>
          <p className="text-muted-foreground text-sm sm:text-base truncate">{grant.title}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <PresenceBar users={presenceUsers} />
          {applicationId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareModalOpen(true)}
              data-testid="button-share-application"
            >
              <Users className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Dela</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto" data-testid="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 sm:gap-2 shrink-0">
            {i > 0 && <div className={`h-px w-4 sm:w-12 ${i <= step ? "bg-primary" : "bg-border"}`} />}
            <button
              onClick={() => canProceedToStep(i) && setStep(i)}
              disabled={!canProceedToStep(i)}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                  ? "bg-muted text-foreground hover-elevate"
                  : "bg-muted/50 text-muted-foreground"
              }`}
              data-testid={`step-${s.key}`}
            >
              <span>{i + 1}.</span>
              <span className="hidden sm:inline">{s.label}</span>
              {i < step && <CheckCircle2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4" data-testid="step-grant-content">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("grantApply.step1.title") || "Valt bidrag"}
              </CardTitle>
              <CardDescription>{t("grantApply.step1.desc") || "Granska bidraget du ska ansöka om"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="font-semibold text-lg">{grant.title}</p>
                <p className="text-sm text-muted-foreground">{grant.sourceName}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {grant.amountMax && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("grantDetail.maxAmount") || "Max belopp"}</p>
                    <p className="font-medium">{Number(grant.amountMax).toLocaleString("sv-SE")} SEK</p>
                  </div>
                )}
                {grant.deadline && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("grantDetail.deadline") || "Deadline"}</p>
                    <p className="font-medium">{new Date(grant.deadline).toLocaleDateString("sv-SE")}</p>
                  </div>
                )}
              </div>
              {grant.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("grantDetail.description") || "Beskrivning"}</p>
                  <p className="text-sm line-clamp-4">{grant.description}</p>
                </div>
              )}
              {matchResult && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <MatchIndicator matchResult={matchResult} size="sm" />
                  <div>
                    <p className="font-medium text-sm">{t("grantApply.matchPercent", { score: matchResult.score })}</p>
                    <p className="text-xs text-muted-foreground">{matchResult.explanation}</p>
                  </div>
                </div>
              )}
              {grant.keywords && grant.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {grant.keywords.slice(0, 8).map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <EligibilityBadge grantId={grant.id} variant="panel" autoCheck={true} showActions={false} />
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button onClick={() => setStep(1)} className="w-full sm:w-auto min-h-[44px]" data-testid="button-next-step">
              {t("common.next") || "Nästa"} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4" data-testid="step-company-content">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {t("grantApply.step2.title") || "Företagsprofil"}
              </CardTitle>
              <CardDescription>{t("grantApply.step2.desc") || "Bekräfta ditt företags uppgifter"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("company.companyName") || "Företagsnamn"}</Label>
                  <p className="font-medium">{company.companyName}</p>
                </div>
                {company.industry && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("company.industry") || "Bransch"}</Label>
                    <p className="font-medium">{company.industry}</p>
                  </div>
                )}
                {company.employees && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("company.employees") || "Anställda"}</Label>
                    <p className="font-medium">{company.employees}</p>
                  </div>
                )}
                {company.location && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("company.location") || "Plats"}</Label>
                    <p className="font-medium">{company.location}</p>
                  </div>
                )}
                {company.revenue && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("company.revenue") || "Omsättning"}</Label>
                    <p className="font-medium">{Number(company.revenue).toLocaleString("sv-SE")} SEK</p>
                  </div>
                )}
                {company.foundedYear && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("company.foundedYear") || "Grundat"}</Label>
                    <p className="font-medium">{company.foundedYear}</p>
                  </div>
                )}
              </div>
              {company.description && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t("company.description") || "Beskrivning"}</Label>
                  <p className="text-sm mt-1">{company.description}</p>
                </div>
              )}
              <Button variant="ghost" size="sm" asChild>
                <Link href="/company">
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  {t("grantApply.editProfile")}
                </Link>
              </Button>
            </CardContent>
          </Card>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(0)} className="w-full sm:w-auto min-h-[44px]" data-testid="button-prev-step">
              <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.back") || "Tillbaka"}
            </Button>
            <Button onClick={() => setStep(2)} className="w-full sm:w-auto min-h-[44px]" data-testid="button-next-step">
              {t("common.next") || "Nästa"} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4" data-testid="step-project-content">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                {t("grantApply.step3.title") || "Projektinformation"}
              </CardTitle>
              <CardDescription>{t("grantApply.step3.desc") || "Beskriv ditt projekt för AI-generering"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 px-4 sm:px-6">
              <div className="space-y-2">
                <Label htmlFor="project-description">
                  {t("grantApply.projectDescription") || "Projektbeskrivning"} *
                </Label>
                <Textarea
                  id="project-description"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder={t("grantApply.projectDescriptionPlaceholder") || "Beskriv vad du vill göra och varför (minst 50 tecken)..."}
                  className="min-h-[120px] w-full"
                  data-testid="textarea-project-description"
                />
                <p className={`text-xs ${projectDescription.length < 50 ? "text-destructive" : "text-muted-foreground"}`}>
                  {projectDescription.length}/1000 {t("common.characters") || "tecken"}
                  {projectDescription.length < 50 && ` (${t("grantApply.minChars") || "minst 50"})`}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-goals">{t("grantApply.projectGoals") || "Mål och förväntade resultat"} *</Label>
                <Textarea
                  id="project-goals"
                  value={projectGoals}
                  onChange={(e) => setProjectGoals(e.target.value)}
                  placeholder={t("grantApply.projectGoalsPlaceholder") || "Vad ska projektet uppnå? Vilka mätbara resultat förväntas?"}
                  className="min-h-[100px] w-full"
                  data-testid="textarea-project-goals"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="project-budget">{t("grantApply.projectBudget") || "Total projektbudget (SEK)"}</Label>
                  <Input
                    id="project-budget"
                    type="number"
                    value={projectBudget}
                    onChange={(e) => setProjectBudget(e.target.value)}
                    placeholder="500000"
                    className="min-h-[44px]"
                    data-testid="input-project-budget"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requested-amount">{t("grantApply.requestedAmount") || "Sökt belopp (SEK)"}</Label>
                  <Input
                    id="requested-amount"
                    type="number"
                    value={requestedAmount}
                    onChange={(e) => setRequestedAmount(e.target.value)}
                    placeholder="250000"
                    className="min-h-[44px]"
                    data-testid="input-requested-amount"
                  />
                  {grant.amountMax && Number(requestedAmount) > Number(grant.amountMax) && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {t("grantApply.exceedsMax") || `Överstiger maxbelopp (${Number(grant.amountMax).toLocaleString("sv-SE")} SEK)`}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="previous-experience">
                  {t("grantApply.previousExperience") || "Tidigare relevant erfarenhet"} ({t("common.optional") || "valfritt"})
                </Label>
                <Textarea
                  id="previous-experience"
                  value={previousExperience}
                  onChange={(e) => setPreviousExperience(e.target.value)}
                  placeholder={t("grantApply.previousExperiencePlaceholder") || "Beskriv relevant erfarenhet..."}
                  className="min-h-[80px] w-full"
                  data-testid="textarea-previous-experience"
                />
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="w-full sm:w-auto min-h-[44px]" data-testid="button-prev-step">
              <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.back") || "Tillbaka"}
            </Button>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || projectDescription.length < 50}
              className="w-full sm:w-auto min-h-[44px]"
              data-testid="button-generate-application"
            >
              {generateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {t("grantApply.generateWithAI")}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4" data-testid="step-result-content">
          {warnings.length > 0 && (
            <Card className="border-amber-500/50">
              <CardContent className="py-3 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-sm">{w}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {sections.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">{t("grantApply.readyToGenerate")}</h3>
                <p className="text-sm text-muted-foreground mb-4">{t("grantApply.readyToGenerateDesc")}</p>
                <Button onClick={() => setStep(2)} data-testid="button-go-to-project">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t("grantApply.step3.title") || "Projektinformation"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {sections.map((section) => {
                const isEditing = editingSectionKey === section.sectionKey;
                const isOverLimit = section.maxWords && section.wordCount > section.maxWords;
                return (
                  <div key={section.sectionKey}>
                  <Card
                    data-testid={`card-section-${section.sectionKey}`}
                    style={{
                      borderLeftWidth: presenceUsers.find(u => u.currentSection === section.sectionKey) ? '4px' : undefined,
                      borderLeftColor: presenceUsers.find(u => u.currentSection === section.sectionKey)?.userColor || undefined,
                    }}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-base">{section.sectionTitle}</CardTitle>
                        <div className="flex items-center gap-2">
                          {applicationId && (
                            <>
                              <CommentTrigger
                                applicationId={applicationId}
                                sectionKey={section.sectionKey}
                                onClick={() => setActiveCommentSection(
                                  activeCommentSection === section.sectionKey ? null : section.sectionKey
                                )}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                onClick={() => setActiveHistorySection(
                                  activeHistorySection === section.sectionKey ? null : section.sectionKey
                                )}
                                data-testid={`button-history-${section.sectionKey}`}
                              >
                                <History className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Badge variant={isOverLimit ? "destructive" : "secondary"} className="text-xs whitespace-nowrap shrink-0">
                            {section.wordCount}{section.maxWords ? ` / ${section.maxWords}` : ""} {t("common.words") || "ord"}
                          </Badge>
                        </div>
                      </div>
                      <SectionPresenceIndicator sectionKey={section.sectionKey} users={presenceUsers} />
                      {section.evaluationCriteria && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("grantApply.evaluationCriteria") || "Bedömningskriterier"}: {section.evaluationCriteria}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {isEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={section.content}
                            onChange={(e) => {
                              const newContent = e.target.value;
                              setSections((prev) =>
                                prev.map((s) =>
                                  s.sectionKey === section.sectionKey
                                    ? { ...s, content: newContent, wordCount: newContent.split(/\s+/).filter(Boolean).length }
                                    : s
                                )
                              );
                            }}
                            className="min-h-[150px] text-sm w-full"
                            data-testid={`textarea-section-${section.sectionKey}`}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => sectionSaveMutation.mutate({ sectionKey: section.sectionKey, content: section.content })}
                              disabled={sectionSaveMutation.isPending}
                              data-testid={`button-save-section-${section.sectionKey}`}
                            >
                              {sectionSaveMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                              {t("common.save") || "Spara"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingSectionKey(null)}>
                              {t("common.cancel") || "Avbryt"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-sm whitespace-pre-wrap leading-relaxed">{section.content}</div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[44px] sm:min-h-0"
                              onClick={() => {
                                setEditingSectionKey(section.sectionKey);
                                updateSectionFocus(section.sectionKey);
                              }}
                              data-testid={`button-edit-section-${section.sectionKey}`}
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              {t("common.edit") || "Redigera"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[44px] sm:min-h-0"
                              onClick={() => {
                                setRegenerateSectionKey(section.sectionKey);
                                setRegenerateDialogOpen(true);
                              }}
                              data-testid={`button-regenerate-section-${section.sectionKey}`}
                            >
                              <RefreshCw className="mr-1 h-3 w-3" />
                              {t("grantApply.regenerateSection") || "Omgenerera"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="min-h-[44px] sm:min-h-0"
                              onClick={() => setLibraryDrawerSection(section.sectionKey)}
                              data-testid={`button-library-section-${section.sectionKey}`}
                            >
                              <Library className="mr-1 h-3 w-3" />
                              {t("contentLibrary.useFromLibrary", "Från bibliotek")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <SectionLibrarySuggestions
                    sectionKey={section.sectionKey}
                    onInsert={(content) => {
                      setSections((prev) =>
                        prev.map((s) =>
                          s.sectionKey === section.sectionKey
                            ? { ...s, content: s.content + "\n\n" + content }
                            : s
                        )
                      );
                      toast({ description: t("contentLibrary.inserted", "Innehåll infogat") });
                    }}
                  />
                  </div>
                );
              })}

              <Card>
                <CardContent className="py-4">
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="min-h-[44px] sm:min-h-0" onClick={handleCopyAll} data-testid="button-copy-all">
                        {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {copied ? t("common.copied") || "Kopierat" : t("grantApply.copyAll") || "Kopiera allt"}
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-[44px] sm:min-h-0"
                        onClick={() => complianceCheckMutation.mutate()}
                        disabled={complianceCheckMutation.isPending || sections.length === 0}
                        data-testid="button-compliance-check"
                      >
                        {complianceCheckMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="mr-2 h-4 w-4" />
                        )}
                        {t("compliance.runCheck", "Compliance-kontroll")}
                      </Button>
                      {!isFreeTrial && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="min-h-[44px] sm:min-h-0" disabled={exportLoading !== null} data-testid="button-export-dropdown">
                              {exportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                              {t("common.export") || "Exportera"}
                              <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => handleExport("docx")} data-testid="button-export-docx">
                              <FileText className="mr-2 h-4 w-4" /> Word (.docx)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport("pdf")} data-testid="button-export-pdf">
                              <File className="mr-2 h-4 w-4" /> PDF (.pdf)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <Button variant="outline" className="min-h-[44px] sm:min-h-0 w-full sm:w-auto" asChild>
                      <Link href="/ansokan" data-testid="link-view-applications">
                        <ClipboardList className="mr-2 h-4 w-4" />
                        {t("grantApply.viewAllApplications")}
                      </Link>
                    </Button>
                  </div>

                  {isFreeTrial && (
                    <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="banner-free-trial-upgrade">
                      <div className="flex items-start gap-3">
                        <div className="rounded-full bg-primary/10 p-2">
                          <Sparkles className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">Din ansökan är genererad!</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Exportera som DOCX eller PDF med Pro-planen
                          </p>
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" asChild data-testid="button-upgrade-to-pro">
                              <Link href="/priser">
                                Uppgradera till Pro →
                              </Link>
                            </Button>
                            <Button size="sm" variant="outline" asChild data-testid="button-view-pricing">
                              <Link href="/priser">
                                Visa priser
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {applicationId && (
                <Card data-testid="card-application-status">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" />
                      {t("grantApply.applicationStatus")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Select
                      value={applicationStatus}
                      onValueChange={(value) => statusMutation.mutate(value)}
                      disabled={statusMutation.isPending}
                    >
                      <SelectTrigger data-testid="select-application-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">{t("grantCard.applicationStatus.draft")}</SelectItem>
                        <SelectItem value="ready">{t("grantCard.applicationStatus.ready")}</SelectItem>
                        <SelectItem value="submitted">{t("grantCard.applicationStatus.submitted")}</SelectItem>
                        <SelectItem value="under_review">{t("grantCard.applicationStatus.under_review")}</SelectItem>
                        <SelectItem value="approved">{t("grantCard.applicationStatus.approved")}</SelectItem>
                        <SelectItem value="rejected">{t("grantCard.applicationStatus.rejected")}</SelectItem>
                        <SelectItem value="withdrawn">{t("grantCard.applicationStatus.withdrawn")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {applicationStatus === "approved" && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="Beviljat belopp"
                          value={approvedAmount}
                          onChange={(e) => setApprovedAmount(e.target.value)}
                          data-testid="input-approved-amount"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => statusMutation.mutate("approved")}
                          disabled={statusMutation.isPending || !approvedAmount}
                        >
                          {t("grantApply.saveAmount") || "Spara"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {applicationId && (
                <SuccessFeeOptIn applicationId={applicationId} grantTitle={grant?.title} />
              )}

              {tokenUsage && (
                <Card>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{t("grantApply.aiCost") || "AI-kostnad"}</span>
                      <span>{tokenUsage.estimatedCostSEK.toFixed(2)} SEK ({(tokenUsage.inputTokens + tokenUsage.outputTokens).toLocaleString("sv-SE")} tokens)</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {complianceReport && (
                <ComplianceReportPanel
                  report={complianceReport}
                  onRecheck={() => complianceCheckMutation.mutate()}
                  isRechecking={complianceCheckMutation.isPending}
                  onFixSection={handleFixSection}
                />
              )}
            </>
          )}
        </div>
      )}

      <Dialog open={regenerateDialogOpen} onOpenChange={setRegenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("grantApply.regenerateSection") || "Omgenerera avsnitt"}</DialogTitle>
            <DialogDescription>
              {t("grantApply.regenerateInstructions") || "Ge instruktioner för hur avsnittet ska förbättras"}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={regenerateInstructions}
            onChange={(e) => setRegenerateInstructions(e.target.value)}
            placeholder={t("grantApply.regeneratePlaceholder") || "T.ex. 'Fokusera mer på hållbarhet' eller 'Lägg till konkreta siffror'"}
            className="min-h-[80px]"
            data-testid="textarea-regenerate-instructions"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenerateDialogOpen(false)}>
              {t("common.cancel") || "Avbryt"}
            </Button>
            <Button
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              data-testid="button-confirm-regenerate"
            >
              {regenerateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t("grantApply.regenerateWithAI") || "Omgenerera med AI"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProgressDialog
        open={generateDialogOpen}
        title={
          generateDialogStatus === "success"
            ? t("grantApply.dialog.generatedTitle")
            : generateDialogStatus === "error"
            ? t("grantApply.dialog.failedTitle")
            : t("grantApply.dialog.generatingTitle")
        }
        description={
          generateDialogStatus === "success"
            ? t("grantApply.dialog.generatedDesc")
            : generateDialogStatus === "error"
            ? t("grantApply.dialog.failedDesc")
            : t("grantApply.dialog.generatingDesc")
        }
        progress={Math.round(generateProgress)}
        status={generateDialogStatus}
      />

      <ProgressDialog
        open={complianceDialogOpen}
        title={
          complianceDialogStatus === "success"
            ? t("compliance.dialog.doneTitle", "Kontroll klar!")
            : complianceDialogStatus === "error"
            ? t("compliance.dialog.failedTitle", "Kontroll misslyckades")
            : t("compliance.dialog.checkingTitle", "Analyserar din ansökan...")
        }
        description={
          complianceDialogStatus === "success"
            ? t("compliance.dialog.doneDesc", "Compliance-rapporten är klar")
            : complianceDialogStatus === "error"
            ? t("compliance.dialog.failedDesc", "Något gick fel, försök igen")
            : t("compliance.dialog.checkingDesc", "Granskar mot bedömningskriterier")
        }
        progress={Math.round(complianceCheckProgress)}
        status={complianceDialogStatus}
      />

      {applicationId && (
        <CollaborationModal
          applicationId={applicationId}
          open={shareModalOpen}
          onOpenChange={setShareModalOpen}
        />
      )}

      {applicationId && activeCommentSection && (
        <div className="fixed right-0 top-0 bottom-0 z-40 shadow-lg" data-testid="comment-panel-container">
          <CommentPanel
            applicationId={applicationId}
            sectionKey={activeCommentSection}
            onClose={() => setActiveCommentSection(null)}
            onCommentAdded={(comment) => notifyCommentAdded(comment)}
          />
        </div>
      )}

      {applicationId && activeHistorySection && (
        <div className="fixed right-0 top-0 bottom-0 z-40 shadow-lg" data-testid="history-drawer-container">
          <SectionHistoryDrawer
            applicationId={applicationId}
            sectionKey={activeHistorySection}
            sectionTitle={sections.find(s => s.sectionKey === activeHistorySection)?.sectionTitle || ''}
            onClose={() => setActiveHistorySection(null)}
            onRestore={(content) => {
              setSections((prev) =>
                prev.map((s) =>
                  s.sectionKey === activeHistorySection
                    ? { ...s, content, wordCount: content.split(/\s+/).filter(Boolean).length }
                    : s
                )
              );
              setActiveHistorySection(null);
            }}
          />
        </div>
      )}

      {libraryDrawerSection && (
        <LibraryDrawer
          sectionKey={libraryDrawerSection}
          applicationId={applicationId}
          onClose={() => setLibraryDrawerSection(null)}
          onInsert={(content) => {
            setSections((prev) =>
              prev.map((s) =>
                s.sectionKey === libraryDrawerSection
                  ? { ...s, content, wordCount: content.split(/\s+/).filter(Boolean).length }
                  : s
              )
            );
            setLibraryDrawerSection(null);
            toast({ title: t("contentLibrary.inserted", "Innehåll infogat från bibliotek") });
          }}
        />
      )}
    </div>
  );
}

function LibraryDrawer({
  sectionKey,
  applicationId,
  onClose,
  onInsert,
}: {
  sectionKey: string;
  applicationId: string | null;
  onClose: () => void;
  onInsert: (content: string) => void;
}) {
  const { t } = useTranslation();
  const { data: suggestions, isLoading } = useQuery<ContentBlock[]>({
    queryKey: ["/api/content-library/suggestions", sectionKey],
    queryFn: async () => {
      const res = await fetch(`/api/content-library/suggestions/${sectionKey}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const useMutation2 = useMutation({
    mutationFn: async (block: ContentBlock) => {
      if (applicationId) {
        await apiRequest("POST", `/api/content-library/${block.id}/use`, {
          applicationId,
          sectionKey,
        });
      }
      return block;
    },
    onSuccess: (block) => {
      onInsert(block.content);
      queryClient.invalidateQueries({ queryKey: ["/api/content-library"] });
    },
  });

  return (
    <div className="fixed right-0 top-0 bottom-0 z-40 w-96 bg-background border-l shadow-lg flex flex-col" data-testid="library-drawer">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          <h3 className="font-semibold">{t("contentLibrary.title", "Innehållsbibliotek")}</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-library-drawer">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && (!suggestions || suggestions.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            <Library className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t("contentLibrary.noSuggestions", "Inga förslag för detta avsnitt")}</p>
            <p className="text-xs mt-1">{t("contentLibrary.addContent", "Lägg till innehåll i ditt bibliotek för att se förslag här")}</p>
          </div>
        )}
        {suggestions?.map((block) => (
          <Card key={block.id} data-testid={`card-suggestion-${block.id}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-sm">{block.title}</span>
                <Badge variant="outline" className="text-xs">
                  {block.wordCount} {t("contentLibrary.words", "ord")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-4 mb-3">
                {block.content.substring(0, 200)}...
              </p>
              <Button
                size="sm"
                className="w-full"
                onClick={() => useMutation2.mutate(block)}
                disabled={useMutation2.isPending}
                data-testid={`button-insert-block-${block.id}`}
              >
                {useMutation2.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <BookOpen className="mr-1 h-3 w-3" />
                )}
                {t("contentLibrary.insertAsBase", "Infoga som bas")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
