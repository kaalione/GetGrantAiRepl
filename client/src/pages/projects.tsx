import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Plus,
  FolderKanban,
  FolderOpen,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Target,
  Banknote,
  ArrowRight,
  FileText,
  CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/grants/empty-state";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { SEO } from '@/components/seo';

interface ProjectProgress {
  milestonesTotal: number;
  milestonesCompleted: number;
  percentComplete: number;
}

interface ProjectBudget {
  totalBudgetedSek: number;
  totalSpentSek: number;
  percentSpent: number;
  isOverBudget: boolean;
}

interface ProjectMilestone {
  title: string;
  dueDate: string;
  daysUntilDue: number;
  isOverdue: boolean;
}

interface ProjectReport {
  title: string;
  dueDate: string;
  daysUntilDue: number;
}

interface Project {
  id: string;
  title: string;
  funder: string;
  status: "active" | "on_hold" | "completed" | "cancelled";
  healthStatus: "on_track" | "at_risk" | "delayed" | "blocked";
  approvedAmountSek: number;
  projectStartDate: string;
  projectEndDate: string;
  grantAgreementRef: string | null;
  progress: ProjectProgress;
  budget: ProjectBudget;
  nextMilestone: ProjectMilestone | null;
  nextReport: ProjectReport | null;
  urgencyLevel: "critical" | "warning" | "ok";
}

function ProjectCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="flex-1 min-w-0">
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Skeleton className="h-3 w-24 mb-1" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div>
            <Skeleton className="h-3 w-20 mb-1" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState(1);

  const [formData, setFormData] = useState({
    title: "",
    funder: "",
    approvedAmountSek: "",
    projectStartDate: "",
    projectEndDate: "",
    grantAgreementRef: "",
    reportingContactName: "",
    reportingContactEmail: "",
    funderPortalUrl: "",
    coFundingRequired: false,
    coFundingPercentage: "",
    coFundingAmountSek: "",
  });

  const [quickSetup, setQuickSetup] = useState({
    addMilestones: true,
    initBudget: true,
    scheduleReports: true,
  });

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: t("projects.toast.created") || "Projekt skapat",
        description: t("projects.toast.createdDesc") || "Ditt projekt har skapats.",
      });
      resetDialog();
    },
    onError: () => {
      toast({
        title: t("projects.toast.createError") || "Kunde inte skapa projekt",
        description: t("projects.toast.createErrorDesc") || "Något gick fel. Försök igen.",
        variant: "destructive",
      });
    },
  });

  function resetDialog() {
    setDialogOpen(false);
    setDialogStep(1);
    setFormData({
      title: "",
      funder: "",
      approvedAmountSek: "",
      projectStartDate: "",
      projectEndDate: "",
      grantAgreementRef: "",
      reportingContactName: "",
      reportingContactEmail: "",
      funderPortalUrl: "",
      coFundingRequired: false,
      coFundingPercentage: "",
      coFundingAmountSek: "",
    });
    setQuickSetup({ addMilestones: true, initBudget: true, scheduleReports: true });
  }

  function handleSubmit() {
    const body: Record<string, unknown> = {
      title: formData.title,
      funder: formData.funder,
      projectStartDate: formData.projectStartDate || undefined,
      projectEndDate: formData.projectEndDate || undefined,
      approvedAmountSek: formData.approvedAmountSek ? Number(formData.approvedAmountSek) : undefined,
      grantAgreementRef: formData.grantAgreementRef || undefined,
      reportingContactName: formData.reportingContactName || undefined,
      reportingContactEmail: formData.reportingContactEmail || undefined,
      funderPortalUrl: formData.funderPortalUrl || undefined,
      coFundingRequired: formData.coFundingRequired,
      coFundingPercentage: formData.coFundingPercentage ? Number(formData.coFundingPercentage) : undefined,
      coFundingAmountSek: formData.coFundingAmountSek ? Number(formData.coFundingAmountSek) : undefined,
    };
    createMutation.mutate(body);
  }

  function getHealthBadge(health: Project["healthStatus"]) {
    const config = {
      on_track: { label: t("projects.health.onTrack") || "P\u00e5 sp\u00e5r", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
      at_risk: { label: t("projects.health.atRisk") || "Risk", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
      delayed: { label: t("projects.health.delayed") || "F\u00f6rsenad", className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
      blocked: { label: t("projects.health.blocked") || "Blockerad", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    };
    const c = config[health];
    return (
      <Badge variant="secondary" className={c.className} data-testid={`badge-health-${health}`}>
        {c.label}
      </Badge>
    );
  }

  function getStatusBadge(status: Project["status"]) {
    const config = {
      active: { label: t("projects.status.active") || "Aktiv", icon: CheckCircle2 },
      on_hold: { label: t("projects.status.onHold") || "Pausad", icon: Clock },
      completed: { label: t("projects.status.completed") || "Avslutad", icon: CheckCircle2 },
      cancelled: { label: t("projects.status.cancelled") || "Avbruten", icon: XCircle },
    };
    const c = config[status];
    const Icon = c.icon;
    return (
      <Badge variant="outline" data-testid={`badge-status-${status}`}>
        <Icon className="mr-1 h-3 w-3" />
        {c.label}
      </Badge>
    );
  }

  function getUrgencyIndicator(level: Project["urgencyLevel"]) {
    const config = {
      critical: { className: "text-red-500", label: t("projects.urgency.critical") || "Kritisk" },
      warning: { className: "text-amber-500", label: t("projects.urgency.warning") || "Varning" },
      ok: { className: "text-green-500", label: t("projects.urgency.ok") || "OK" },
    };
    const c = config[level];
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.className}`} data-testid={`indicator-urgency-${level}`}>
        <CircleDot className="h-3 w-3" />
        {c.label}
      </span>
    );
  }

  function formatSek(amount: number) {
    return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(amount);
  }

  const activeCount = (projects || []).filter((p) => p.status === "active").length;
  const isStep1Valid = formData.title.trim() !== "" && formData.funder.trim() !== "" && formData.projectStartDate !== "" && formData.projectEndDate !== "";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-projects-title">
              {t("projects.title") || "Projekt"}
            </h1>
            <Skeleton className="h-6 w-8" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SEO title={t("projects.title") || "Projekt"} noindex={true} />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-projects-title">
            {t("projects.title") || "Projekt"}
          </h1>
          {activeCount > 0 && (
            <Badge variant="secondary" data-testid="badge-active-count">
              {activeCount} {t("projects.activeLabel") || "aktiva"}
            </Badge>
          )}
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-create-project">
          <Plus className="mr-2 h-4 w-4" />
          {t("projects.createButton") || "Skapa projekt"}
        </Button>
      </div>

      {(!projects || projects.length === 0) ? (
        <EmptyState
          icon={FolderOpen}
          title={t("projects.empty.title", "Följ upp dina vinnande bidrag här")}
          description={t("projects.empty.description", "När du får ett bidrag godkänt, skapa ett projekt för att följa milstolpar, budgetar, rapporter och team — allt på ett ställe.")}
          actionLabel={t("projects.empty.browse", "Bläddra bland öppna bidrag")}
          onAction={() => navigate("/bidrag")}
          secondaryActionLabel={t("projects.createButton", "Skapa projekt manuellt")}
          onSecondaryAction={() => setDialogOpen(true)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="hover-elevate cursor-pointer"
              onClick={() => navigate(`/projekt/${project.id}`)}
              data-testid={`card-project-${project.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate" data-testid={`text-project-title-${project.id}`}>
                      {project.title}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate" data-testid={`text-project-funder-${project.id}`}>
                      {project.funder}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {getHealthBadge(project.healthStatus)}
                    {getStatusBadge(project.status)}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {t("projects.milestones") || "Milstolpar"}
                      </span>
                      <span className="text-xs font-medium" data-testid={`text-progress-${project.id}`}>
                        {project.progress.milestonesCompleted}/{project.progress.milestonesTotal}
                      </span>
                    </div>
                    <Progress value={project.progress.percentComplete} className="h-2" data-testid={`progress-milestones-${project.id}`} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Banknote className="h-3 w-3" />
                        {t("projects.budget") || "Budget"}
                      </span>
                      <span className={`text-xs font-medium ${project.budget.isOverBudget ? "text-red-500" : ""}`} data-testid={`text-budget-${project.id}`}>
                        {formatSek(project.budget.totalSpentSek)} / {formatSek(project.budget.totalBudgetedSek)}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(project.budget.percentSpent, 100)}
                      className={`h-2 ${project.budget.isOverBudget ? "[&>div]:bg-red-500" : ""}`}
                      data-testid={`progress-budget-${project.id}`}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t">
                    <div className="text-xs text-muted-foreground space-y-1">
                      {project.nextMilestone && (
                        <div className="flex items-center gap-1" data-testid={`text-next-milestone-${project.id}`}>
                          <Target className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[160px]">{project.nextMilestone.title}</span>
                          <span className={`font-medium ${project.nextMilestone.isOverdue ? "text-red-500" : ""}`}>
                            ({project.nextMilestone.daysUntilDue > 0
                              ? `${project.nextMilestone.daysUntilDue} ${t("projects.daysLeft") || "dagar kvar"}`
                              : t("projects.overdue") || "F\u00f6rsenad"})
                          </span>
                        </div>
                      )}
                      {project.nextReport && (
                        <div className="flex items-center gap-1" data-testid={`text-next-report-${project.id}`}>
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[160px]">{project.nextReport.title}</span>
                          <span className="font-medium">
                            ({project.nextReport.daysUntilDue} {t("projects.daysLeft") || "dagar kvar"})
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {getUrgencyIndicator(project.urgencyLevel)}
                      <span className="text-xs font-medium" data-testid={`text-amount-${project.id}`}>
                        {formatSek(project.approvedAmountSek)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {dialogStep === 1
                ? (t("projects.dialog.step1Title") || "Grattis till godk\u00e4nt bidrag!")
                : (t("projects.dialog.step2Title") || "Snabbkonfiguration")}
            </DialogTitle>
          </DialogHeader>

          {dialogStep === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t("projects.form.title") || "Projektnamn"} *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t("projects.form.titlePlaceholder") || "T.ex. Innovationsprojekt 2026"}
                  data-testid="input-project-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="funder">{t("projects.form.funder") || "Finans\u00e4r"} *</Label>
                <Input
                  id="funder"
                  value={formData.funder}
                  onChange={(e) => setFormData({ ...formData, funder: e.target.value })}
                  placeholder={t("projects.form.funderPlaceholder") || "T.ex. Vinnova"}
                  data-testid="input-project-funder"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="approvedAmount">{t("projects.form.approvedAmount") || "Godk\u00e4nt belopp (SEK)"}</Label>
                <Input
                  id="approvedAmount"
                  type="number"
                  value={formData.approvedAmountSek}
                  onChange={(e) => setFormData({ ...formData, approvedAmountSek: e.target.value })}
                  placeholder="500 000"
                  data-testid="input-approved-amount"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">{t("projects.form.startDate") || "Startdatum"} *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.projectStartDate}
                    onChange={(e) => setFormData({ ...formData, projectStartDate: e.target.value })}
                    data-testid="input-start-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">{t("projects.form.endDate") || "Slutdatum"} *</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.projectEndDate}
                    onChange={(e) => setFormData({ ...formData, projectEndDate: e.target.value })}
                    data-testid="input-end-date"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="grantRef">{t("projects.form.grantRef") || "Bidragsreferens"}</Label>
                <Input
                  id="grantRef"
                  value={formData.grantAgreementRef}
                  onChange={(e) => setFormData({ ...formData, grantAgreementRef: e.target.value })}
                  placeholder={t("projects.form.grantRefPlaceholder") || "T.ex. 2026-00123"}
                  data-testid="input-grant-ref"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactName">{t("projects.form.contactName") || "Rapportkontakt namn"}</Label>
                <Input
                  id="contactName"
                  value={formData.reportingContactName}
                  onChange={(e) => setFormData({ ...formData, reportingContactName: e.target.value })}
                  data-testid="input-contact-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactEmail">{t("projects.form.contactEmail") || "Rapportkontakt e-post"}</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={formData.reportingContactEmail}
                  onChange={(e) => setFormData({ ...formData, reportingContactEmail: e.target.value })}
                  data-testid="input-contact-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="portalUrl">{t("projects.form.portalUrl") || "Finans\u00e4rens rapportportal"}</Label>
                <Input
                  id="portalUrl"
                  type="url"
                  value={formData.funderPortalUrl}
                  onChange={(e) => setFormData({ ...formData, funderPortalUrl: e.target.value })}
                  placeholder="https://"
                  data-testid="input-portal-url"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="coFunding">{t("projects.form.coFunding") || "Medfinansiering"}</Label>
                <Switch
                  id="coFunding"
                  checked={formData.coFundingRequired}
                  onCheckedChange={(checked) => setFormData({ ...formData, coFundingRequired: checked })}
                  data-testid="switch-co-funding"
                />
              </div>

              {formData.coFundingRequired && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="coFundingPct">{t("projects.form.coFundingPct") || "Andel (%)"}</Label>
                    <Input
                      id="coFundingPct"
                      type="number"
                      min="0"
                      max="100"
                      value={formData.coFundingPercentage}
                      onChange={(e) => setFormData({ ...formData, coFundingPercentage: e.target.value })}
                      data-testid="input-co-funding-pct"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="coFundingAmt">{t("projects.form.coFundingAmt") || "Belopp (SEK)"}</Label>
                    <Input
                      id="coFundingAmt"
                      type="number"
                      value={formData.coFundingAmountSek}
                      onChange={(e) => setFormData({ ...formData, coFundingAmountSek: e.target.value })}
                      data-testid="input-co-funding-amount"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={() => setDialogStep(2)} disabled={!isStep1Valid} data-testid="button-next-step">
                  {t("projects.dialog.next") || "N\u00e4sta"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                {t("projects.dialog.quickSetupDesc") || "Vill du initiera med standardkonfiguration?"}
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="addMilestones"
                    checked={quickSetup.addMilestones}
                    onCheckedChange={(checked) => setQuickSetup({ ...quickSetup, addMilestones: checked as boolean })}
                    data-testid="checkbox-milestones"
                  />
                  <Label htmlFor="addMilestones" className="cursor-pointer">
                    {t("projects.dialog.addMilestones") || `L\u00e4gg till standardmilstolpar f\u00f6r ${formData.funder}`}
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="initBudget"
                    checked={quickSetup.initBudget}
                    onCheckedChange={(checked) => setQuickSetup({ ...quickSetup, initBudget: checked as boolean })}
                    data-testid="checkbox-budget"
                  />
                  <Label htmlFor="initBudget" className="cursor-pointer">
                    {t("projects.dialog.initBudget") || "Initiera budgetkategorier"}
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="scheduleReports"
                    checked={quickSetup.scheduleReports}
                    onCheckedChange={(checked) => setQuickSetup({ ...quickSetup, scheduleReports: checked as boolean })}
                    data-testid="checkbox-reports"
                  />
                  <Label htmlFor="scheduleReports" className="cursor-pointer">
                    {t("projects.dialog.scheduleReports") || "Schemal\u00e4gg standardrapporter"}
                  </Label>
                </div>
              </div>

              <div className="flex justify-between gap-4 pt-2">
                <Button variant="outline" onClick={() => setDialogStep(1)} data-testid="button-back-step">
                  {t("projects.dialog.back") || "Tillbaka"}
                </Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-project">
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("projects.createButton") || "Skapa projekt"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
