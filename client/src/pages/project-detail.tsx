import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import confetti from "canvas-confetti";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft, Plus, Edit, Activity, Target, FileText, Wallet, Users,
  AlertTriangle, Shield, FolderOpen, Clock, CheckCircle2, XCircle,
  Loader2, Trash2, Calendar, ExternalLink, StickyNote, Sparkles,
  ChevronDown, ChevronRight, Send, CircleDot, TrendingUp, Download,
  User, Mail, Globe, Hash, Banknote, Timer, BarChart3, FileUp,
  HeartPulse, Milestone, GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/grants/empty-state";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, differenceInDays, differenceInMonths, isPast, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { SEO } from '@/components/seo';
import type {
  GrantProject, ProjectMilestone, ProjectReport, BudgetCategory,
  ProjectExpense, TeamMember, ActivityLogEntry, ProjectDocument, ProjectRisk,
} from "@shared/schema";

interface ProjectDetailData extends GrantProject {
  milestones: ProjectMilestone[];
  reports: ProjectReport[];
  budgetCategories: BudgetCategory[];
  teamMembers: TeamMember[];
  recentActivity: ActivityLogEntry[];
  documents: ProjectDocument[];
  risks: ProjectRisk[];
}

interface BudgetSummary {
  totalBudgetedSek: number;
  totalGrantAmountSek: number;
  totalCoFundingSek: number;
  totalSpentSek: number;
  totalCommittedSek: number;
  totalRemainingAmountSek: number;
  percentSpent: number;
  burnRateMonthly: number;
  projectedEndBalance: number;
}

interface BudgetResponse {
  categories: (BudgetCategory & { expenses?: ProjectExpense[] })[];
  summary: BudgetSummary;
}

interface CostProjectionResponse {
  members: (TeamMember & { projectMonths: number; totalCost: number })[];
  totalPersonnelCostSek: number;
  comparedToBudget: { budgetedSek: number; variance: number; isOverBudget: boolean };
}

function formatSek(amount: number) {
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(amount);
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function SortableMilestoneCard({ milestone: m, days, overdue, getMilestoneStatusBadge, deliverableTypeLabels, completeMilestoneMutation, deleteMilestoneMutation, t }: {
  milestone: ProjectMilestone; days: number | null; overdue: boolean;
  getMilestoneStatusBadge: (s: string) => JSX.Element; deliverableTypeLabels: Record<string, string>;
  completeMilestoneMutation: any; deleteMilestoneMutation: any; t: any;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : undefined };

  return (
    <div ref={setNodeRef} style={style}>
      <Card data-testid={`card-milestone-${m.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <button {...attributes} {...listeners} className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none" data-testid={`drag-handle-${m.id}`}>
                <GripVertical className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium" data-testid={`text-milestone-title-${m.id}`}>{m.title}</span>
                  {getMilestoneStatusBadge(m.status || "pending")}
                  {m.deliverableType && <Badge variant="outline" className="text-xs">{deliverableTypeLabels[m.deliverableType] || m.deliverableType}</Badge>}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{m.dueDate ? format(parseISO(m.dueDate), "d MMM yyyy", { locale: sv }) : "–"}</span>
                  {days !== null && (
                    <span className={overdue ? "text-red-500 font-medium" : ""}>
                      {overdue ? `${Math.abs(days)} ${t("projects.daysOverdue") || "dagar försenad"}` : `${days} ${t("projects.daysLeft") || "dagar kvar"}`}
                    </span>
                  )}
                  {m.assignedToName && <span className="flex items-center gap-1"><User className="h-3 w-3" />{m.assignedToName}</span>}
                </div>
                {m.description && <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {(m.status === "in_progress" || m.status === "pending") && (
                <Button size="sm" variant="outline" onClick={() => completeMilestoneMutation.mutate(m.id)} disabled={completeMilestoneMutation.isPending} data-testid={`button-complete-milestone-${m.id}`}>
                  <CheckCircle2 className="mr-1 h-3 w-3" />{t("projects.milestone.complete") || "Slutför"}
                </Button>
              )}
              {m.status === "pending" && (
                <Button size="icon" variant="ghost" onClick={() => deleteMilestoneMutation.mutate(m.id)} disabled={deleteMilestoneMutation.isPending} data-testid={`button-delete-milestone-${m.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const params = useParams();
  const id = params?.id;
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseCategoryId, setExpenseCategoryId] = useState<string | null>(null);
  const [budgetInitSource, setBudgetInitSource] = useState("vinnova");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [activityFilter, setActivityFilter] = useState("all");
  const [editingTeamMember, setEditingTeamMember] = useState<TeamMember | null>(null);
  const [editingReport, setEditingReport] = useState<ProjectReport | null>(null);
  const [noteText, setNoteText] = useState("");
  const [generatingReportId, setGeneratingReportId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    title: "", funder: "", approvedAmountSek: "", projectStartDate: "", projectEndDate: "",
    grantAgreementRef: "", reportingContactName: "", reportingContactEmail: "",
    funderPortalUrl: "", coFundingRequired: false, coFundingPercentage: "", coFundingAmountSek: "",
  });

  const [milestoneForm, setMilestoneForm] = useState({
    title: "", dueDate: "", description: "", deliverableType: "",
    deliverableDescription: "", assignedToName: "", assignedToEmail: "", budgetReleaseAmountSek: "",
  });

  const [reportForm, setReportForm] = useState({
    reportType: "progress", title: "", dueDate: "", funderDeadline: "",
    periodStart: "", periodEnd: "", submissionMethod: "",
  });

  const [teamForm, setTeamForm] = useState({
    name: "", email: "", role: "", roleDescription: "",
    allocationPercentage: "", monthlyCostSek: "", isExternal: false, startDate: "", endDate: "",
  });

  const [riskForm, setRiskForm] = useState({
    title: "", description: "", riskType: "technical", probability: "medium",
    impact: "medium", mitigationPlan: "", assignedToEmail: "", dueDate: "",
  });

  const [documentForm, setDocumentForm] = useState({
    name: "", documentType: "other", description: "", fileUrl: "",
  });

  const [expenseForm, setExpenseForm] = useState({
    description: "", amountSek: "", expenseDate: "", expenseType: "", supplierName: "",
  });

  const { data: project, isLoading } = useQuery<ProjectDetailData>({
    queryKey: ["/api/projects", id],
    enabled: !!id,
  });

  const { data: budgetData } = useQuery<BudgetResponse>({
    queryKey: ["/api/projects", id, "budget"],
    enabled: !!id,
  });

  const { data: costProjection } = useQuery<CostProjectionResponse>({
    queryKey: ["/api/projects", id, "team", "cost-projection"],
    enabled: !!id,
  });

  const [activityBefore, setActivityBefore] = useState<string | null>(null);
  const { data: activityData } = useQuery<ActivityLogEntry[]>({
    queryKey: ["/api/projects", id, `activity?limit=20${activityBefore ? `&before=${activityBefore}` : ""}${activityFilter !== "all" ? `&type=${activityFilter}` : ""}`],
    enabled: !!id && activeTab === "activity",
  });

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "budget"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "team", "cost-projection"] });
  };

  const healthCheckMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/projects/${id}/health-check`); },
    onSuccess: () => { invalidateProject(); toast({ title: t("projects.toast.healthChecked") || "Hälsokontroll genomförd" }); },
    onError: () => { toast({ title: t("projects.toast.healthCheckError") || "Kunde inte genomföra hälsokontroll", variant: "destructive" }); },
  });

  const editProjectMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("PATCH", `/api/projects/${id}`, data); },
    onSuccess: () => {
      invalidateProject();
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditDialogOpen(false);
      toast({ title: t("projects.toast.updated") || "Projekt uppdaterat" });
    },
    onError: () => { toast({ title: t("projects.toast.updateError") || "Kunde inte uppdatera", variant: "destructive" }); },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (note: string) => { await apiRequest("POST", `/api/projects/${id}/notes`, { note }); },
    onSuccess: () => { invalidateProject(); setNoteText(""); toast({ title: t("projects.toast.noteAdded") || "Anteckning tillagd" }); },
    onError: () => { toast({ title: t("projects.toast.noteError") || "Kunde inte lägga till anteckning", variant: "destructive" }); },
  });

  const createMilestoneMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/projects/${id}/milestones`, data); },
    onSuccess: () => {
      invalidateProject(); setMilestoneDialogOpen(false);
      setMilestoneForm({ title: "", dueDate: "", description: "", deliverableType: "", deliverableDescription: "", assignedToName: "", assignedToEmail: "", budgetReleaseAmountSek: "" });
      toast({ title: t("projects.toast.milestoneCreated") || "Milstolpe skapad" });
    },
    onError: () => { toast({ title: t("projects.toast.milestoneError") || "Kunde inte skapa milstolpe", variant: "destructive" }); },
  });

  const completeMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: string) => { await apiRequest("POST", `/api/projects/${id}/milestones/${milestoneId}/complete`); },
    onSuccess: () => {
      invalidateProject();
      toast({ title: t("projects.toast.milestoneCompleted") || "Milstolpe slutförd" });
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    },
    onError: () => { toast({ title: t("projects.toast.milestoneError") || "Kunde inte slutföra milstolpe", variant: "destructive" }); },
  });

  const reorderMilestonesMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => { await apiRequest("POST", `/api/projects/${id}/milestones/reorder`, { orderedIds }); },
    onSuccess: () => { invalidateProject(); },
    onError: () => { toast({ title: t("projects.toast.milestoneError") || "Kunde inte ordna om milstolpar", variant: "destructive" }); },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sorted = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));
    const oldIndex = sorted.findIndex(m => m.id === active.id);
    const newIndex = sorted.findIndex(m => m.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(sorted, oldIndex, newIndex);
      reorderMilestonesMutation.mutate(reordered.map(m => m.id));
    }
  }

  const deleteMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: string) => { await apiRequest("DELETE", `/api/projects/${id}/milestones/${milestoneId}`); },
    onSuccess: () => { invalidateProject(); toast({ title: t("projects.toast.milestoneDeleted") || "Milstolpe borttagen" }); },
    onError: () => { toast({ title: t("projects.toast.milestoneError") || "Kunde inte ta bort milstolpe", variant: "destructive" }); },
  });

  const createReportMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/projects/${id}/reports`, data); },
    onSuccess: () => {
      invalidateProject(); setReportDialogOpen(false);
      setReportForm({ reportType: "progress", title: "", dueDate: "", funderDeadline: "", periodStart: "", periodEnd: "", submissionMethod: "" });
      toast({ title: t("projects.toast.reportCreated") || "Rapport skapad" });
    },
    onError: () => { toast({ title: t("projects.toast.reportError") || "Kunde inte skapa rapport", variant: "destructive" }); },
  });

  const generateDraftMutation = useMutation({
    mutationFn: async (reportId: string) => {
      setGeneratingReportId(reportId);
      await apiRequest("POST", `/api/projects/${id}/reports/${reportId}/generate-draft`);
    },
    onSuccess: () => { invalidateProject(); setGeneratingReportId(null); toast({ title: t("projects.toast.draftGenerated") || "AI-utkast genererat" }); },
    onError: () => { setGeneratingReportId(null); toast({ title: t("projects.toast.draftError") || "Kunde inte generera utkast", variant: "destructive" }); },
  });

  const submitReportMutation = useMutation({
    mutationFn: async (reportId: string) => { await apiRequest("POST", `/api/projects/${id}/reports/${reportId}/submit`); },
    onSuccess: () => { invalidateProject(); toast({ title: t("projects.toast.reportSubmitted") || "Rapport markerad som inskickad" }); },
    onError: () => { toast({ title: t("projects.toast.reportError") || "Kunde inte markera rapport", variant: "destructive" }); },
  });

  const initBudgetMutation = useMutation({
    mutationFn: async (source: string) => { await apiRequest("POST", `/api/projects/${id}/budget/initialize`, { source }); },
    onSuccess: () => { invalidateProject(); toast({ title: t("projects.toast.budgetInitialized") || "Budgetkategorier initierade" }); },
    onError: () => { toast({ title: t("projects.toast.budgetError") || "Kunde inte initiera budget", variant: "destructive" }); },
  });

  const addExpenseMutation = useMutation({
    mutationFn: async ({ categoryId, data }: { categoryId: string; data: Record<string, unknown> }) => {
      await apiRequest("POST", `/api/projects/${id}/budget/categories/${categoryId}/expenses`, data);
    },
    onSuccess: () => {
      invalidateProject(); setExpenseDialogOpen(false); setExpenseCategoryId(null);
      setExpenseForm({ description: "", amountSek: "", expenseDate: "", expenseType: "", supplierName: "" });
      toast({ title: t("projects.toast.expenseAdded") || "Kostnad tillagd" });
    },
    onError: () => { toast({ title: t("projects.toast.expenseError") || "Kunde inte lägga till kostnad", variant: "destructive" }); },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => { await apiRequest("DELETE", `/api/projects/${id}/expenses/${expenseId}`); },
    onSuccess: () => { invalidateProject(); toast({ title: t("projects.toast.expenseDeleted") || "Kostnad borttagen" }); },
    onError: () => { toast({ title: t("projects.toast.expenseError") || "Kunde inte ta bort kostnad", variant: "destructive" }); },
  });

  const addTeamMemberMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/projects/${id}/team`, data); },
    onSuccess: () => {
      invalidateProject(); setTeamDialogOpen(false); setEditingTeamMember(null);
      setTeamForm({ name: "", email: "", role: "", roleDescription: "", allocationPercentage: "", monthlyCostSek: "", isExternal: false, startDate: "", endDate: "" });
      toast({ title: t("projects.toast.memberAdded") || "Teammedlem tillagd" });
    },
    onError: () => { toast({ title: t("projects.toast.memberError") || "Kunde inte lägga till medlem", variant: "destructive" }); },
  });

  const updateTeamMemberMutation = useMutation({
    mutationFn: async ({ memberId, data }: { memberId: string; data: Record<string, unknown> }) => {
      await apiRequest("PATCH", `/api/projects/${id}/team/${memberId}`, data);
    },
    onSuccess: () => {
      invalidateProject(); setTeamDialogOpen(false); setEditingTeamMember(null);
      toast({ title: t("projects.toast.memberUpdated") || "Teammedlem uppdaterad" });
    },
    onError: () => { toast({ title: t("projects.toast.memberError") || "Kunde inte uppdatera medlem", variant: "destructive" }); },
  });

  const removeTeamMemberMutation = useMutation({
    mutationFn: async (memberId: string) => { await apiRequest("DELETE", `/api/projects/${id}/team/${memberId}`); },
    onSuccess: () => { invalidateProject(); toast({ title: t("projects.toast.memberRemoved") || "Teammedlem borttagen" }); },
    onError: () => { toast({ title: t("projects.toast.memberError") || "Kunde inte ta bort medlem", variant: "destructive" }); },
  });

  const addRiskMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/projects/${id}/risks`, data); },
    onSuccess: () => {
      invalidateProject(); setRiskDialogOpen(false);
      setRiskForm({ title: "", description: "", riskType: "technical", probability: "medium", impact: "medium", mitigationPlan: "", assignedToEmail: "", dueDate: "" });
      toast({ title: t("projects.toast.riskAdded") || "Risk tillagd" });
    },
    onError: () => { toast({ title: t("projects.toast.riskError") || "Kunde inte lägga till risk", variant: "destructive" }); },
  });

  const mitigateRiskMutation = useMutation({
    mutationFn: async (riskId: string) => { await apiRequest("POST", `/api/projects/${id}/risks/${riskId}/mitigate`); },
    onSuccess: () => { invalidateProject(); toast({ title: t("projects.toast.riskMitigated") || "Risk markerad som åtgärdad" }); },
    onError: () => { toast({ title: t("projects.toast.riskError") || "Kunde inte uppdatera risk", variant: "destructive" }); },
  });

  const closeRiskMutation = useMutation({
    mutationFn: async (riskId: string) => { await apiRequest("POST", `/api/projects/${id}/risks/${riskId}/close`); },
    onSuccess: () => { invalidateProject(); toast({ title: t("projects.toast.riskClosed") || "Risk stängd" }); },
    onError: () => { toast({ title: t("projects.toast.riskError") || "Kunde inte stänga risk", variant: "destructive" }); },
  });

  const addDocumentMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { await apiRequest("POST", `/api/projects/${id}/documents`, data); },
    onSuccess: () => {
      invalidateProject(); setDocumentDialogOpen(false);
      setDocumentForm({ name: "", documentType: "other", description: "", fileUrl: "" });
      toast({ title: t("projects.toast.documentAdded") || "Dokument tillagt" });
    },
    onError: () => { toast({ title: t("projects.toast.documentError") || "Kunde inte lägga till dokument", variant: "destructive" }); },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (docId: string) => { await apiRequest("DELETE", `/api/projects/${id}/documents/${docId}`); },
    onSuccess: () => { invalidateProject(); toast({ title: t("projects.toast.documentDeleted") || "Dokument borttaget" }); },
    onError: () => { toast({ title: t("projects.toast.documentError") || "Kunde inte ta bort dokument", variant: "destructive" }); },
  });

  function openEditDialog() {
    if (!project) return;
    setEditForm({
      title: project.title, funder: project.funder,
      approvedAmountSek: project.approvedAmountSek?.toString() || "",
      projectStartDate: project.projectStartDate || "",
      projectEndDate: project.projectEndDate || "",
      grantAgreementRef: project.grantAgreementRef || "",
      reportingContactName: project.reportingContactName || "",
      reportingContactEmail: project.reportingContactEmail || "",
      funderPortalUrl: project.funderPortalUrl || "",
      coFundingRequired: project.coFundingRequired || false,
      coFundingPercentage: project.coFundingPercentage?.toString() || "",
      coFundingAmountSek: project.coFundingAmountSek?.toString() || "",
    });
    setEditDialogOpen(true);
  }

  function handleEditSubmit() {
    editProjectMutation.mutate({
      title: editForm.title, funder: editForm.funder,
      approvedAmountSek: editForm.approvedAmountSek ? Number(editForm.approvedAmountSek) : undefined,
      projectStartDate: editForm.projectStartDate || undefined,
      projectEndDate: editForm.projectEndDate || undefined,
      grantAgreementRef: editForm.grantAgreementRef || undefined,
      reportingContactName: editForm.reportingContactName || undefined,
      reportingContactEmail: editForm.reportingContactEmail || undefined,
      funderPortalUrl: editForm.funderPortalUrl || undefined,
      coFundingRequired: editForm.coFundingRequired,
      coFundingPercentage: editForm.coFundingPercentage ? Number(editForm.coFundingPercentage) : undefined,
      coFundingAmountSek: editForm.coFundingAmountSek ? Number(editForm.coFundingAmountSek) : undefined,
    });
  }

  function openTeamEdit(member: TeamMember) {
    setEditingTeamMember(member);
    setTeamForm({
      name: member.name, email: member.email || "", role: member.role,
      roleDescription: member.roleDescription || "",
      allocationPercentage: member.allocationPercentage?.toString() || "",
      monthlyCostSek: member.monthlyCostSek?.toString() || "",
      isExternal: member.isExternal || false,
      startDate: member.startDate || "", endDate: member.endDate || "",
    });
    setTeamDialogOpen(true);
  }

  function handleTeamSubmit() {
    const data: Record<string, unknown> = {
      name: teamForm.name, email: teamForm.email || undefined, role: teamForm.role,
      roleDescription: teamForm.roleDescription || undefined,
      allocationPercentage: teamForm.allocationPercentage ? Number(teamForm.allocationPercentage) : undefined,
      monthlyCostSek: teamForm.monthlyCostSek ? Number(teamForm.monthlyCostSek) : undefined,
      isExternal: teamForm.isExternal,
      startDate: teamForm.startDate || undefined, endDate: teamForm.endDate || undefined,
    };
    if (editingTeamMember) {
      updateTeamMemberMutation.mutate({ memberId: editingTeamMember.id, data });
    } else {
      addTeamMemberMutation.mutate(data);
    }
  }

  function getHealthBadge(health: string) {
    const config: Record<string, { label: string; className: string }> = {
      on_track: { label: t("projects.health.onTrack") || "På spår", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
      at_risk: { label: t("projects.health.atRisk") || "Risk", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
      delayed: { label: t("projects.health.delayed") || "Försenad", className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
      blocked: { label: t("projects.health.blocked") || "Blockerad", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    };
    const c = config[health] || config.on_track;
    return <Badge variant="secondary" className={c.className} data-testid={`badge-health-${health}`}>{c.label}</Badge>;
  }

  function getStatusBadge(status: string) {
    const config: Record<string, { label: string; icon: typeof CheckCircle2 }> = {
      active: { label: t("projects.status.active") || "Aktiv", icon: CheckCircle2 },
      on_hold: { label: t("projects.status.onHold") || "Pausad", icon: Clock },
      completed: { label: t("projects.status.completed") || "Avslutad", icon: CheckCircle2 },
      cancelled: { label: t("projects.status.cancelled") || "Avbruten", icon: XCircle },
    };
    const c = config[status] || config.active;
    const Icon = c.icon;
    return <Badge variant="outline" data-testid={`badge-status-${status}`}><Icon className="mr-1 h-3 w-3" />{c.label}</Badge>;
  }

  function getMilestoneStatusBadge(status: string) {
    const config: Record<string, { label: string; className: string }> = {
      pending: { label: t("projects.milestone.pending") || "Väntande", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
      in_progress: { label: t("projects.milestone.inProgress") || "Pågående", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
      completed: { label: t("projects.milestone.completed") || "Klar", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
      delayed: { label: t("projects.milestone.delayed") || "Försenad", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
      waived: { label: t("projects.milestone.waived") || "Borttagen", className: "bg-muted text-muted-foreground" },
    };
    const c = config[status] || config.pending;
    return <Badge variant="secondary" className={c.className} data-testid={`badge-milestone-${status}`}>{c.label}</Badge>;
  }

  function getReportStatusBadge(status: string) {
    const config: Record<string, { label: string; className: string }> = {
      upcoming: { label: t("projects.report.upcoming") || "Kommande", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
      drafting: { label: t("projects.report.drafting") || "Utkast", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
      in_review: { label: t("projects.report.inReview") || "Granskas", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
      submitted: { label: t("projects.report.submitted") || "Inskickad", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
      approved: { label: t("projects.report.approved") || "Godkänd", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
      rejected: { label: t("projects.report.rejected") || "Nekad", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
      revision_needed: { label: t("projects.report.revisionNeeded") || "Revision krävs", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    };
    const c = config[status] || config.upcoming;
    return <Badge variant="secondary" className={c.className} data-testid={`badge-report-${status}`}>{c.label}</Badge>;
  }

  function getRiskScoreBadge(score: number) {
    let className = "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
    if (score >= 7) className = "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
    else if (score >= 4) className = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
    return <Badge variant="secondary" className={className} data-testid={`badge-risk-score-${score}`}>{score}</Badge>;
  }

  function daysUntil(dateStr: string | null) {
    if (!dateStr) return null;
    return differenceInDays(parseISO(dateStr), new Date());
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <div className="flex-1"><Skeleton className="h-7 w-64 mb-2" /><Skeleton className="h-4 w-32" /></div>
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild><Link href="/projekt"><ArrowLeft className="mr-2 h-4 w-4" />{t("projects.backToProjects") || "Tillbaka till projekt"}</Link></Button>
        <div className="text-center py-12"><h2 className="text-xl font-semibold">{t("projects.notFound") || "Projektet hittades inte"}</h2></div>
      </div>
    );
  }

  const milestones = project.milestones || [];
  const reports = project.reports || [];
  const teamMembers = project.teamMembers || [];
  const documents = project.documents || [];
  const risks = project.risks || [];
  const budget = budgetData?.summary;
  const budgetCategories = budgetData?.categories || project.budgetCategories || [];

  const totalDays = project.projectStartDate && project.projectEndDate
    ? differenceInDays(parseISO(project.projectEndDate), parseISO(project.projectStartDate)) : 0;
  const elapsedDays = project.projectStartDate
    ? differenceInDays(new Date(), parseISO(project.projectStartDate)) : 0;
  const timeProgress = totalDays > 0 ? Math.min(Math.max((elapsedDays / totalDays) * 100, 0), 100) : 0;
  const daysRemaining = project.projectEndDate ? differenceInDays(parseISO(project.projectEndDate), new Date()) : 0;
  const completedMilestones = milestones.filter(m => m.status === "completed").length;
  const milestoneProgress = milestones.length > 0 ? (completedMilestones / milestones.length) * 100 : 0;

  const roleLabels: Record<string, string> = {
    project_manager: "Projektledare", principal_investigator: "Forskningsansvarig",
    researcher: "Forskare", developer: "Utvecklare", financial_officer: "Ekonomiansvarig",
    external_consultant: "Extern konsult", other: "Annan",
  };

  const reportTypeLabels: Record<string, string> = {
    progress: "Lägesrapport", interim: "Delrapport", financial: "Ekonomisk rapport",
    final: "Slutrapport", ad_hoc: "Ad hoc",
  };

  const documentTypeLabels: Record<string, string> = {
    grant_agreement: "Bidragsavtal", progress_report: "Lägesrapport", financial_report: "Ekonomisk rapport",
    invoice: "Faktura", correspondence: "Korrespondens", deliverable: "Leverabel", other: "Övrigt",
  };

  const riskTypeLabels: Record<string, string> = {
    technical: "Teknisk", financial: "Ekonomisk", timeline: "Tidplan",
    compliance: "Regelefterlevnad", partner: "Partner", other: "Annan",
  };

  const deliverableTypeLabels: Record<string, string> = {
    report: "Rapport", demo: "Demo", prototype: "Prototyp", publication: "Publikation",
    dataset: "Dataset", presentation: "Presentation", other: "Annat",
  };

  return (
    <div className="space-y-6">
      <SEO title={project.title || 'Projektdetaljer'} noindex={true} />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild data-testid="button-back">
            <Link href="/projekt"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-project-title">{project.title}</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-project-funder">{project.funder}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {getHealthBadge(project.healthStatus || "on_track")}
          {getStatusBadge(project.status || "active")}
          <Button variant="outline" size="sm" onClick={() => healthCheckMutation.mutate()} disabled={healthCheckMutation.isPending} data-testid="button-health-check">
            {healthCheckMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HeartPulse className="mr-2 h-4 w-4" />}
            {t("projects.healthCheck") || "Hälsokontroll"}
          </Button>
          <Button variant="outline" size="sm" onClick={openEditDialog} data-testid="button-edit-project">
            <Edit className="mr-2 h-4 w-4" />{t("projects.edit") || "Redigera"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview"><BarChart3 className="mr-1 h-4 w-4" />{t("projects.tabs.overview") || "Översikt"}</TabsTrigger>
          <TabsTrigger value="milestones" data-testid="tab-milestones"><Target className="mr-1 h-4 w-4" />{t("projects.tabs.milestones") || "Milstolpar"}</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports"><FileText className="mr-1 h-4 w-4" />{t("projects.tabs.reports") || "Rapporter"}</TabsTrigger>
          <TabsTrigger value="budget" data-testid="tab-budget"><Wallet className="mr-1 h-4 w-4" />{t("projects.tabs.budget") || "Budget"}</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team"><Users className="mr-1 h-4 w-4" />{t("projects.tabs.team") || "Team"}</TabsTrigger>
          <TabsTrigger value="risks" data-testid="tab-risks"><AlertTriangle className="mr-1 h-4 w-4" />{t("projects.tabs.risks") || "Risker"}</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents"><FolderOpen className="mr-1 h-4 w-4" />{t("projects.tabs.documents") || "Dokument"}</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity"><Activity className="mr-1 h-4 w-4" />{t("projects.tabs.activity") || "Aktivitet"}</TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Banknote className="h-4 w-4" />{t("projects.overview.approvedAmount") || "Godkänt belopp"}</div>
                <p className="text-xl font-bold" data-testid="text-approved-amount">{formatSek(project.approvedAmountSek || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Timer className="h-4 w-4" />{t("projects.overview.timeRemaining") || "Tid kvar"}</div>
                <p className="text-xl font-bold" data-testid="text-time-remaining">
                  {daysRemaining > 0 ? `${daysRemaining} ${t("projects.days") || "dagar"}` : t("projects.overview.ended") || "Avslutat"}
                </p>
                <Progress value={timeProgress} className="h-1.5 mt-2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Target className="h-4 w-4" />{t("projects.overview.milestones") || "Milstolpar"}</div>
                <p className="text-xl font-bold" data-testid="text-milestones-progress">{completedMilestones}/{milestones.length}</p>
                <Progress value={milestoneProgress} className="h-1.5 mt-2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Wallet className="h-4 w-4" />{t("projects.overview.budgetUsage") || "Budgetförbrukning"}</div>
                <p className="text-xl font-bold" data-testid="text-budget-usage">{budget ? `${Math.round(budget.percentSpent)}%` : "0%"}</p>
                <Progress value={budget?.percentSpent || 0} className={`h-1.5 mt-2 ${(budget?.percentSpent || 0) > 100 ? "[&>div]:bg-red-500" : ""}`} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <CardTitle className="text-base">{t("projects.overview.timeline") || "Tidslinje"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{t("projects.overview.start") || "Start"}</span>
                  <span className="font-medium" data-testid="text-start-date">
                    {project.projectStartDate ? format(parseISO(project.projectStartDate), "d MMM yyyy", { locale: sv }) : "–"}
                  </span>
                </div>
                <Progress value={timeProgress} className="h-2" />
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{t("projects.overview.end") || "Slut"}</span>
                  <span className="font-medium" data-testid="text-end-date">
                    {project.projectEndDate ? format(parseISO(project.projectEndDate), "d MMM yyyy", { locale: sv }) : "–"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{Math.round(timeProgress)}% {t("projects.overview.elapsed") || "förlupen tid"}</p>
                {project.coFundingRequired && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{t("projects.overview.coFunding") || "Medfinansiering"}</p>
                      {project.coFundingPercentage && <p className="text-sm text-muted-foreground">{project.coFundingPercentage}%</p>}
                      {project.coFundingAmountSek && <p className="text-sm">{formatSek(project.coFundingAmountSek)}</p>}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("projects.overview.contact") || "Kontaktinfo"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {project.reportingContactName && (
                    <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span data-testid="text-contact-name">{project.reportingContactName}</span></div>
                  )}
                  {project.reportingContactEmail && (
                    <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><a href={`mailto:${project.reportingContactEmail}`} className="text-primary underline" data-testid="text-contact-email">{project.reportingContactEmail}</a></div>
                  )}
                  {project.funderPortalUrl && (
                    <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /><a href={project.funderPortalUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate" data-testid="link-portal">{t("projects.overview.portal") || "Rapportportal"} <ExternalLink className="inline h-3 w-3" /></a></div>
                  )}
                  {project.grantAgreementRef && (
                    <div className="flex items-center gap-2"><Hash className="h-4 w-4 text-muted-foreground" /><span data-testid="text-grant-ref">{project.grantAgreementRef}</span></div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                  <CardTitle className="text-base">{t("projects.overview.notes") || "Anteckningar"}</CardTitle>
                </CardHeader>
                <CardContent>
                  {project.notes && <p className="text-sm mb-3 whitespace-pre-wrap" data-testid="text-notes">{project.notes}</p>}
                  <div className="flex gap-2">
                    <Input
                      value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      placeholder={t("projects.overview.notePlaceholder") || "Lägg till en anteckning..."}
                      data-testid="input-note"
                    />
                    <Button size="sm" onClick={() => addNoteMutation.mutate(noteText)} disabled={!noteText.trim() || addNoteMutation.isPending} data-testid="button-add-note">
                      {addNoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: MILESTONES */}
        <TabsContent value="milestones" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">{t("projects.tabs.milestones") || "Milstolpar"}</h2>
            <Button size="sm" onClick={() => setMilestoneDialogOpen(true)} data-testid="button-add-milestone">
              <Plus className="mr-2 h-4 w-4" />{t("projects.milestone.add") || "Lägg till milstolpe"}
            </Button>
          </div>
          {milestones.length === 0 ? (
            <EmptyState icon={Target} title={t("projects.milestone.emptyTitle") || "Inga milstolpar"} description={t("projects.milestone.emptyDesc") || "Lägg till milstolpar för att spåra projektets framsteg."}
              actionLabel={t("projects.milestone.add") || "Lägg till milstolpe"} onAction={() => setMilestoneDialogOpen(true)} />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={[...milestones].sort((a, b) => (a.order || 0) - (b.order || 0)).map(m => m.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {[...milestones].sort((a, b) => (a.order || 0) - (b.order || 0)).map((m) => {
                    const days = daysUntil(m.dueDate);
                    const overdue = days !== null && days < 0 && m.status !== "completed" && m.status !== "waived";
                    return (
                      <SortableMilestoneCard
                        key={m.id}
                        milestone={m}
                        days={days}
                        overdue={overdue}
                        getMilestoneStatusBadge={getMilestoneStatusBadge}
                        deliverableTypeLabels={deliverableTypeLabels}
                        completeMilestoneMutation={completeMilestoneMutation}
                        deleteMilestoneMutation={deleteMilestoneMutation}
                        t={t}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

        {/* TAB 3: REPORTS */}
        <TabsContent value="reports" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">{t("projects.tabs.reports") || "Rapporter"}</h2>
            <Button size="sm" onClick={() => setReportDialogOpen(true)} data-testid="button-add-report">
              <Plus className="mr-2 h-4 w-4" />{t("projects.report.add") || "Lägg till rapport"}
            </Button>
          </div>
          {reports.length === 0 ? (
            <EmptyState icon={FileText} title={t("projects.report.emptyTitle") || "Inga rapporter"} description={t("projects.report.emptyDesc") || "Lägg till rapporter för att hålla koll på rapportering."}
              actionLabel={t("projects.report.add") || "Lägg till rapport"} onAction={() => setReportDialogOpen(true)} />
          ) : (
            <div className="space-y-3">
              {[...reports].sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")).map((r) => {
                const days = daysUntil(r.dueDate);
                const overdue = days !== null && days < 0 && r.status !== "submitted" && r.status !== "approved";
                return (
                  <Card key={r.id} data-testid={`card-report-${r.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium" data-testid={`text-report-title-${r.id}`}>{r.title}</span>
                            {getReportStatusBadge(r.status || "upcoming")}
                            <Badge variant="outline" className="text-xs">{reportTypeLabels[r.reportType] || r.reportType}</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                            {r.periodStart && r.periodEnd && <span>{format(parseISO(r.periodStart), "d MMM", { locale: sv })} – {format(parseISO(r.periodEnd), "d MMM yyyy", { locale: sv })}</span>}
                            {r.dueDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(parseISO(r.dueDate), "d MMM yyyy", { locale: sv })}</span>}
                            {days !== null && (
                              <span className={overdue ? "text-red-500 font-medium" : ""}>
                                {overdue ? `${Math.abs(days)} ${t("projects.daysOverdue") || "dagar försenad"}` : `${days} ${t("projects.daysLeft") || "dagar kvar"}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 flex-wrap">
                          {(r.status === "upcoming" || r.status === "drafting") && (
                            <Button size="sm" variant="outline" onClick={() => generateDraftMutation.mutate(r.id)} disabled={generatingReportId === r.id} data-testid={`button-generate-draft-${r.id}`}>
                              {generatingReportId === r.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                              {t("projects.report.generateDraft") || "Generera AI-utkast"}
                            </Button>
                          )}
                          {(r.status === "drafting" || r.status === "in_review") && (
                            <Button size="sm" variant="outline" onClick={() => submitReportMutation.mutate(r.id)} disabled={submitReportMutation.isPending} data-testid={`button-submit-report-${r.id}`}>
                              <Send className="mr-1 h-3 w-3" />{t("projects.report.markSubmitted") || "Markera som inskickad"}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setEditingReport(r)} data-testid={`button-edit-report-${r.id}`}>
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {r.content && <p className="text-sm text-muted-foreground line-clamp-3">{r.content}</p>}
                      {r.funderFeedback && (
                        <div className="bg-muted/50 rounded-md p-3 text-sm">
                          <p className="font-medium text-xs mb-1">{t("projects.report.funderFeedback") || "Finansiärens respons"}</p>
                          <p className="text-muted-foreground">{r.funderFeedback}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 4: BUDGET */}
        <TabsContent value="budget" className="space-y-6">
          {budget && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("projects.budget.totalApproved") || "Total godkänt"}</p>
                <p className="text-xl font-bold" data-testid="text-budget-total">{formatSek(budget.totalBudgetedSek)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("projects.budget.spent") || "Förbrukat"}</p>
                <p className="text-xl font-bold" data-testid="text-budget-spent">{formatSek(budget.totalSpentSek)}</p>
                <Progress value={budget.percentSpent} className={`h-1.5 mt-2 ${budget.percentSpent > 100 ? "[&>div]:bg-red-500" : ""}`} />
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("projects.budget.remaining") || "Återstående"}</p>
                <p className="text-xl font-bold" data-testid="text-budget-remaining">{formatSek(budget.totalRemainingAmountSek)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("projects.budget.burnRate") || "Burn rate/mån"}</p>
                <p className="text-xl font-bold" data-testid="text-burn-rate">{formatSek(budget.burnRateMonthly)}</p>
              </CardContent></Card>
            </div>
          )}

          {budgetCategories.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center space-y-4">
                <p className="text-muted-foreground">{t("projects.budget.noCategories") || "Inga budgetkategorier konfigurerade."}</p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <Select value={budgetInitSource} onValueChange={setBudgetInitSource}>
                    <SelectTrigger className="w-48" data-testid="select-budget-source"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vinnova">Vinnova</SelectItem>
                      <SelectItem value="tillvaxtverket">Tillväxtverket</SelectItem>
                      <SelectItem value="energimyndigheten">Energimyndigheten</SelectItem>
                      <SelectItem value="generic">Generisk</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={() => initBudgetMutation.mutate(budgetInitSource)} disabled={initBudgetMutation.isPending} data-testid="button-init-budget">
                    {initBudgetMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t("projects.budget.initialize") || "Initiera budgetkategorier"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("projects.budget.category") || "Kategori"}</TableHead>
                      <TableHead className="text-right">{t("projects.budget.budgeted") || "Budgeterat"}</TableHead>
                      <TableHead className="text-right">{t("projects.budget.spentCol") || "Förbrukat"}</TableHead>
                      <TableHead className="text-right">Committed</TableHead>
                      <TableHead className="text-right">{t("projects.budget.remainingCol") || "Kvar"}</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {budgetCategories.map((cat) => {
                      const remaining = cat.budgetedAmountSek - (cat.spentAmountSek || 0) - (cat.committedAmountSek || 0);
                      const pct = cat.budgetedAmountSek > 0 ? ((cat.spentAmountSek || 0) / cat.budgetedAmountSek) * 100 : 0;
                      const isExpanded = expandedCategories.has(cat.id);
                      return (
                        <TableRow key={cat.id} data-testid={`row-budget-${cat.id}`} className="cursor-pointer" onClick={() => {
                          const next = new Set(expandedCategories);
                          isExpanded ? next.delete(cat.id) : next.add(cat.id);
                          setExpandedCategories(next);
                        }}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1">
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {cat.categoryLabel || cat.category}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatSek(cat.budgetedAmountSek)}</TableCell>
                          <TableCell className="text-right">{formatSek(cat.spentAmountSek || 0)}</TableCell>
                          <TableCell className="text-right">{formatSek(cat.committedAmountSek || 0)}</TableCell>
                          <TableCell className={`text-right ${remaining < 0 ? "text-red-500" : ""}`}>{formatSek(remaining)}</TableCell>
                          <TableCell className="text-right">{Math.round(pct)}%</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setExpenseCategoryId(cat.id); setExpenseDialogOpen(true); }} data-testid={`button-add-expense-${cat.id}`}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {budgetData?.categories && budgetData.categories.some(c => (c as any).expenses?.length > 0) && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">{t("projects.budget.expenseLog") || "Kostnadslogg"}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("projects.budget.date") || "Datum"}</TableHead>
                      <TableHead>{t("projects.budget.description") || "Beskrivning"}</TableHead>
                      <TableHead>{t("projects.budget.category") || "Kategori"}</TableHead>
                      <TableHead className="text-right">{t("projects.budget.amount") || "Belopp"}</TableHead>
                      <TableHead>{t("projects.budget.type") || "Typ"}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {budgetData.categories.flatMap(c => ((c as any).expenses || []).map((e: ProjectExpense) => (
                      <TableRow key={e.id} data-testid={`row-expense-${e.id}`}>
                        <TableCell>{e.expenseDate ? format(parseISO(e.expenseDate), "d MMM yyyy", { locale: sv }) : "–"}</TableCell>
                        <TableCell>{e.description}</TableCell>
                        <TableCell>{c.categoryLabel || c.category}</TableCell>
                        <TableCell className="text-right">{formatSek(e.amountSek)}</TableCell>
                        <TableCell>{e.expenseType || "–"}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => deleteExpenseMutation.mutate(e.id)} disabled={deleteExpenseMutation.isPending} data-testid={`button-delete-expense-${e.id}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 5: TEAM */}
        <TabsContent value="team" className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">{t("projects.tabs.team") || "Team"}</h2>
            <Button size="sm" onClick={() => { setEditingTeamMember(null); setTeamForm({ name: "", email: "", role: "", roleDescription: "", allocationPercentage: "", monthlyCostSek: "", isExternal: false, startDate: "", endDate: "" }); setTeamDialogOpen(true); }} data-testid="button-add-member">
              <Plus className="mr-2 h-4 w-4" />{t("projects.team.add") || "Lägg till medlem"}
            </Button>
          </div>

          {teamMembers.length === 0 ? (
            <EmptyState icon={Users} title={t("projects.team.emptyTitle") || "Inga teammedlemmar"} description={t("projects.team.emptyDesc") || "Lägg till teammedlemmar för att spåra resurser."}
              actionLabel={t("projects.team.add") || "Lägg till medlem"} onAction={() => { setEditingTeamMember(null); setTeamDialogOpen(true); }} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {teamMembers.map((m) => (
                <Card key={m.id} data-testid={`card-member-${m.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar><AvatarFallback>{getInitials(m.name)}</AvatarFallback></Avatar>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-medium truncate" data-testid={`text-member-name-${m.id}`}>{m.name}</p>
                        <p className="text-xs text-muted-foreground">{roleLabels[m.role] || m.role}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {m.allocationPercentage && <span>{m.allocationPercentage}%</span>}
                          {m.monthlyCostSek && <span>{formatSek(m.monthlyCostSek)}/mån</span>}
                          {m.isExternal && <Badge variant="outline" className="text-xs">{t("projects.team.external") || "Extern"}</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => openTeamEdit(m)} data-testid={`button-edit-member-${m.id}`}><Edit className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => removeTeamMemberMutation.mutate(m.id)} disabled={removeTeamMemberMutation.isPending} data-testid={`button-remove-member-${m.id}`}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {costProjection && costProjection.members.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">{t("projects.team.costProjection") || "Personalkostnadsprojektion"}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("projects.team.member") || "Medlem"}</TableHead>
                      <TableHead className="text-right">{t("projects.team.allocation") || "Allokering"}</TableHead>
                      <TableHead className="text-right">{t("projects.team.monthlyCost") || "Månadskostnad"}</TableHead>
                      <TableHead className="text-right">{t("projects.team.months") || "Månader"}</TableHead>
                      <TableHead className="text-right">{t("projects.team.totalCost") || "Total kostnad"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costProjection.members.map((m) => (
                      <TableRow key={m.id} data-testid={`row-cost-${m.id}`}>
                        <TableCell>{m.name}</TableCell>
                        <TableCell className="text-right">{m.allocationPercentage || 100}%</TableCell>
                        <TableCell className="text-right">{formatSek(m.monthlyCostSek || 0)}</TableCell>
                        <TableCell className="text-right">{m.projectMonths}</TableCell>
                        <TableCell className="text-right">{formatSek(m.totalCost)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className={costProjection.comparedToBudget.isOverBudget ? "text-red-500 font-bold" : "font-bold"}>
                      <TableCell colSpan={4}>{t("projects.team.total") || "Totalt"}</TableCell>
                      <TableCell className="text-right" data-testid="text-total-personnel-cost">{formatSek(costProjection.totalPersonnelCostSek)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                {costProjection.comparedToBudget.budgetedSek > 0 && (
                  <div className={`px-4 py-2 text-sm ${costProjection.comparedToBudget.isOverBudget ? "text-red-500" : "text-muted-foreground"}`}>
                    {t("projects.team.budgetComparison") || "Jämfört med budgeterad personalkostnad"}: {formatSek(costProjection.comparedToBudget.budgetedSek)}
                    {" ("}
                    {costProjection.comparedToBudget.variance >= 0 ? "+" : ""}{formatSek(costProjection.comparedToBudget.variance)}
                    {")"}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 6: RISKS */}
        <TabsContent value="risks" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">{t("projects.tabs.risks") || "Risker"}</h2>
            <Button size="sm" onClick={() => setRiskDialogOpen(true)} data-testid="button-add-risk">
              <Plus className="mr-2 h-4 w-4" />{t("projects.risk.add") || "Lägg till risk"}
            </Button>
          </div>
          {risks.length === 0 ? (
            <EmptyState icon={Shield} title={t("projects.risk.emptyTitle") || "Inga identifierade risker"}
              description={t("projects.risk.emptyDesc") || "Proaktiv riskhantering ökar chansen att leverera projektet framgångsrikt."} />
          ) : (
            <div className="space-y-3">
              {risks.map((r) => (
                <Card key={r.id} data-testid={`card-risk-${r.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getRiskScoreBadge(r.riskScore || 1)}
                          <span className="font-medium" data-testid={`text-risk-title-${r.id}`}>{r.title}</span>
                          <Badge variant="outline" className="text-xs">{riskTypeLabels[r.riskType || "other"] || r.riskType}</Badge>
                          <Badge variant="secondary" className="text-xs">{r.status || "open"}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span>{t("projects.risk.probability") || "Sannolikhet"}: {r.probability}</span>
                          <span>{t("projects.risk.impact") || "Påverkan"}: {r.impact}</span>
                        </div>
                        {r.mitigationPlan && <p className="text-xs text-muted-foreground line-clamp-2">{r.mitigationPlan}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 flex-wrap">
                        {r.status === "open" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => mitigateRiskMutation.mutate(r.id)} disabled={mitigateRiskMutation.isPending} data-testid={`button-mitigate-risk-${r.id}`}>
                              <CheckCircle2 className="mr-1 h-3 w-3" />{t("projects.risk.mitigate") || "Åtgärdad"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => closeRiskMutation.mutate(r.id)} disabled={closeRiskMutation.isPending} data-testid={`button-close-risk-${r.id}`}>
                              <XCircle className="mr-1 h-3 w-3" />{t("projects.risk.close") || "Stäng"}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 7: DOCUMENTS */}
        <TabsContent value="documents" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">{t("projects.tabs.documents") || "Dokument"}</h2>
            <Button size="sm" onClick={() => setDocumentDialogOpen(true)} data-testid="button-add-document">
              <Plus className="mr-2 h-4 w-4" />{t("projects.document.add") || "Lägg till dokument"}
            </Button>
          </div>
          {documents.length === 0 ? (
            <EmptyState icon={FolderOpen} title={t("projects.document.emptyTitle") || "Inga dokument"} description={t("projects.document.emptyDesc") || "Lägg till dokument för att samla projektmaterial."}
              actionLabel={t("projects.document.add") || "Lägg till dokument"} onAction={() => setDocumentDialogOpen(true)} />
          ) : (
            <div className="space-y-6">
              {Object.entries(documentTypeLabels).map(([type, label]) => {
                const docs = documents.filter(d => d.documentType === type);
                if (docs.length === 0) return null;
                return (
                  <div key={type}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">{label}</h3>
                    <div className="space-y-2">
                      {docs.map((d) => (
                        <Card key={d.id} data-testid={`card-document-${d.id}`}>
                          <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <FileUp className="h-5 w-5 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium truncate" data-testid={`text-document-name-${d.id}`}>{d.name}</p>
                                <p className="text-xs text-muted-foreground">{d.createdAt ? format(new Date(d.createdAt), "d MMM yyyy", { locale: sv }) : ""}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="icon" variant="ghost" asChild data-testid={`link-download-${d.id}`}>
                                <a href={d.fileUrl} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" /></a>
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => deleteDocumentMutation.mutate(d.id)} disabled={deleteDocumentMutation.isPending} data-testid={`button-delete-document-${d.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 8: ACTIVITY */}
        <TabsContent value="activity" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">{t("projects.tabs.activity") || "Aktivitet"}</h2>
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { value: "all", label: t("projects.activity.all") || "Alla" },
                { value: "milestone", label: t("projects.activity.milestones") || "Milstolpar" },
                { value: "report", label: t("projects.activity.reports") || "Rapporter" },
                { value: "budget", label: "Budget" },
                { value: "team", label: "Team" },
                { value: "other", label: t("projects.activity.other") || "Annat" },
              ].map((f) => (
                <Button key={f.value} size="sm" variant={activityFilter === f.value ? "default" : "outline"} onClick={() => { setActivityFilter(f.value); setActivityBefore(null); }} data-testid={`button-filter-${f.value}`}>
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
          {(activityData || project.recentActivity || []).length === 0 ? (
            <EmptyState icon={Activity} title={t("projects.activity.emptyTitle") || "Ingen aktivitet"} description={t("projects.activity.emptyDesc") || "Aktivitetsloggen uppdateras automatiskt."} />
          ) : (
            <div className="space-y-3">
              {(activityData || project.recentActivity || []).map((a) => {
                const iconMap: Record<string, typeof Activity> = {
                  milestone: Target, report: FileText, budget: Wallet, team: Users, risk: AlertTriangle,
                };
                const Icon = iconMap[a.activityType] || Activity;
                return (
                  <div key={a.id} className="flex gap-3 items-start" data-testid={`activity-${a.id}`}>
                    <div className="mt-0.5 p-1.5 rounded-md bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{a.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{a.userName}</span>
                        <span>{a.createdAt ? format(new Date(a.createdAt), "d MMM yyyy HH:mm", { locale: sv }) : ""}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {activityData && activityData.length >= 20 && (
                <Button variant="outline" className="w-full" onClick={() => setActivityBefore(activityData[activityData.length - 1]?.createdAt?.toString() || null)} data-testid="button-load-more">
                  {t("projects.activity.loadMore") || "Ladda fler"}
                </Button>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* EDIT PROJECT DIALOG */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("projects.edit") || "Redigera projekt"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("projects.form.title") || "Projektnamn"} *</Label><Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} data-testid="input-edit-title" /></div>
            <div className="space-y-2"><Label>{t("projects.form.funder") || "Finansiär"} *</Label><Input value={editForm.funder} onChange={(e) => setEditForm({ ...editForm, funder: e.target.value })} data-testid="input-edit-funder" /></div>
            <div className="space-y-2"><Label>{t("projects.form.approvedAmount") || "Godkänt belopp (SEK)"}</Label><Input type="number" value={editForm.approvedAmountSek} onChange={(e) => setEditForm({ ...editForm, approvedAmountSek: e.target.value })} data-testid="input-edit-amount" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t("projects.form.startDate") || "Startdatum"}</Label><Input type="date" value={editForm.projectStartDate} onChange={(e) => setEditForm({ ...editForm, projectStartDate: e.target.value })} data-testid="input-edit-start" /></div>
              <div className="space-y-2"><Label>{t("projects.form.endDate") || "Slutdatum"}</Label><Input type="date" value={editForm.projectEndDate} onChange={(e) => setEditForm({ ...editForm, projectEndDate: e.target.value })} data-testid="input-edit-end" /></div>
            </div>
            <div className="space-y-2"><Label>{t("projects.form.grantRef") || "Bidragsreferens"}</Label><Input value={editForm.grantAgreementRef} onChange={(e) => setEditForm({ ...editForm, grantAgreementRef: e.target.value })} data-testid="input-edit-ref" /></div>
            <div className="space-y-2"><Label>{t("projects.form.contactName") || "Rapportkontakt namn"}</Label><Input value={editForm.reportingContactName} onChange={(e) => setEditForm({ ...editForm, reportingContactName: e.target.value })} data-testid="input-edit-contact-name" /></div>
            <div className="space-y-2"><Label>{t("projects.form.contactEmail") || "Rapportkontakt e-post"}</Label><Input type="email" value={editForm.reportingContactEmail} onChange={(e) => setEditForm({ ...editForm, reportingContactEmail: e.target.value })} data-testid="input-edit-contact-email" /></div>
            <div className="space-y-2"><Label>{t("projects.form.portalUrl") || "Rapportportal"}</Label><Input type="url" value={editForm.funderPortalUrl} onChange={(e) => setEditForm({ ...editForm, funderPortalUrl: e.target.value })} data-testid="input-edit-portal" /></div>
            <div className="flex items-center justify-between gap-4"><Label>{t("projects.form.coFunding") || "Medfinansiering"}</Label><Switch checked={editForm.coFundingRequired} onCheckedChange={(c) => setEditForm({ ...editForm, coFundingRequired: c })} data-testid="switch-edit-cofunding" /></div>
            {editForm.coFundingRequired && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{t("projects.form.coFundingPct") || "Andel (%)"}</Label><Input type="number" value={editForm.coFundingPercentage} onChange={(e) => setEditForm({ ...editForm, coFundingPercentage: e.target.value })} data-testid="input-edit-cofunding-pct" /></div>
                <div className="space-y-2"><Label>{t("projects.form.coFundingAmt") || "Belopp (SEK)"}</Label><Input type="number" value={editForm.coFundingAmountSek} onChange={(e) => setEditForm({ ...editForm, coFundingAmountSek: e.target.value })} data-testid="input-edit-cofunding-amount" /></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>{t("common.cancel") || "Avbryt"}</Button>
            <Button onClick={handleEditSubmit} disabled={editProjectMutation.isPending || !editForm.title || !editForm.funder} data-testid="button-save-edit">
              {editProjectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("common.save") || "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD MILESTONE DIALOG */}
      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("projects.milestone.add") || "Lägg till milstolpe"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("projects.form.title") || "Titel"} *</Label><Input value={milestoneForm.title} onChange={(e) => setMilestoneForm({ ...milestoneForm, title: e.target.value })} data-testid="input-milestone-title" /></div>
            <div className="space-y-2"><Label>{t("projects.form.dueDate") || "Förfallodatum"} *</Label><Input type="date" value={milestoneForm.dueDate} onChange={(e) => setMilestoneForm({ ...milestoneForm, dueDate: e.target.value })} data-testid="input-milestone-due" /></div>
            <div className="space-y-2"><Label>{t("projects.form.description") || "Beskrivning"}</Label><Textarea value={milestoneForm.description} onChange={(e) => setMilestoneForm({ ...milestoneForm, description: e.target.value })} data-testid="input-milestone-desc" /></div>
            <div className="space-y-2">
              <Label>{t("projects.form.deliverableType") || "Leverabeltyp"}</Label>
              <Select value={milestoneForm.deliverableType} onValueChange={(v) => setMilestoneForm({ ...milestoneForm, deliverableType: v })}>
                <SelectTrigger data-testid="select-deliverable-type"><SelectValue placeholder={t("projects.form.selectType") || "Välj typ"} /></SelectTrigger>
                <SelectContent>
                  {Object.entries(deliverableTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t("projects.form.deliverableDesc") || "Leverabelbeskrivning"}</Label><Input value={milestoneForm.deliverableDescription} onChange={(e) => setMilestoneForm({ ...milestoneForm, deliverableDescription: e.target.value })} data-testid="input-milestone-deliverable-desc" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t("projects.form.assignedName") || "Tilldelad (namn)"}</Label><Input value={milestoneForm.assignedToName} onChange={(e) => setMilestoneForm({ ...milestoneForm, assignedToName: e.target.value })} data-testid="input-milestone-assigned-name" /></div>
              <div className="space-y-2"><Label>{t("projects.form.assignedEmail") || "Tilldelad (e-post)"}</Label><Input type="email" value={milestoneForm.assignedToEmail} onChange={(e) => setMilestoneForm({ ...milestoneForm, assignedToEmail: e.target.value })} data-testid="input-milestone-assigned-email" /></div>
            </div>
            <div className="space-y-2"><Label>{t("projects.form.budgetRelease") || "Budgetfrisläppning (SEK)"}</Label><Input type="number" value={milestoneForm.budgetReleaseAmountSek} onChange={(e) => setMilestoneForm({ ...milestoneForm, budgetReleaseAmountSek: e.target.value })} data-testid="input-milestone-budget" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMilestoneDialogOpen(false)}>{t("common.cancel") || "Avbryt"}</Button>
            <Button onClick={() => createMilestoneMutation.mutate({
              title: milestoneForm.title, dueDate: milestoneForm.dueDate,
              description: milestoneForm.description || undefined, deliverableType: milestoneForm.deliverableType || undefined,
              deliverableDescription: milestoneForm.deliverableDescription || undefined,
              assignedToName: milestoneForm.assignedToName || undefined, assignedToEmail: milestoneForm.assignedToEmail || undefined,
              budgetReleaseAmountSek: milestoneForm.budgetReleaseAmountSek ? Number(milestoneForm.budgetReleaseAmountSek) : undefined,
            })} disabled={createMilestoneMutation.isPending || !milestoneForm.title || !milestoneForm.dueDate} data-testid="button-save-milestone">
              {createMilestoneMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("common.save") || "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD REPORT DIALOG */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("projects.report.add") || "Lägg till rapport"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("projects.form.reportType") || "Rapporttyp"} *</Label>
              <Select value={reportForm.reportType} onValueChange={(v) => setReportForm({ ...reportForm, reportType: v })}>
                <SelectTrigger data-testid="select-report-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(reportTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t("projects.form.title") || "Titel"} *</Label><Input value={reportForm.title} onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })} data-testid="input-report-title" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t("projects.form.dueDate") || "Förfallodatum"}</Label><Input type="date" value={reportForm.dueDate} onChange={(e) => setReportForm({ ...reportForm, dueDate: e.target.value })} data-testid="input-report-due" /></div>
              <div className="space-y-2"><Label>{t("projects.form.funderDeadline") || "Finansiärens deadline"}</Label><Input type="date" value={reportForm.funderDeadline} onChange={(e) => setReportForm({ ...reportForm, funderDeadline: e.target.value })} data-testid="input-report-funder-deadline" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t("projects.form.periodStart") || "Period start"}</Label><Input type="date" value={reportForm.periodStart} onChange={(e) => setReportForm({ ...reportForm, periodStart: e.target.value })} data-testid="input-report-period-start" /></div>
              <div className="space-y-2"><Label>{t("projects.form.periodEnd") || "Period slut"}</Label><Input type="date" value={reportForm.periodEnd} onChange={(e) => setReportForm({ ...reportForm, periodEnd: e.target.value })} data-testid="input-report-period-end" /></div>
            </div>
            <div className="space-y-2"><Label>{t("projects.form.submissionMethod") || "Inlämningsmetod"}</Label><Input value={reportForm.submissionMethod} onChange={(e) => setReportForm({ ...reportForm, submissionMethod: e.target.value })} data-testid="input-report-method" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>{t("common.cancel") || "Avbryt"}</Button>
            <Button onClick={() => createReportMutation.mutate({
              reportType: reportForm.reportType, title: reportForm.title,
              dueDate: reportForm.dueDate || undefined, funderDeadline: reportForm.funderDeadline || undefined,
              periodStart: reportForm.periodStart || undefined, periodEnd: reportForm.periodEnd || undefined,
              submissionMethod: reportForm.submissionMethod || undefined,
            })} disabled={createReportMutation.isPending || !reportForm.title} data-testid="button-save-report">
              {createReportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("common.save") || "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD EXPENSE DIALOG */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("projects.budget.addExpense") || "Lägg till kostnad"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("projects.form.description") || "Beskrivning"} *</Label><Input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} data-testid="input-expense-desc" /></div>
            <div className="space-y-2"><Label>{t("projects.form.amount") || "Belopp (SEK)"} *</Label><Input type="number" value={expenseForm.amountSek} onChange={(e) => setExpenseForm({ ...expenseForm, amountSek: e.target.value })} data-testid="input-expense-amount" /></div>
            <div className="space-y-2"><Label>{t("projects.form.date") || "Datum"} *</Label><Input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} data-testid="input-expense-date" /></div>
            <div className="space-y-2"><Label>{t("projects.form.type") || "Typ"}</Label><Input value={expenseForm.expenseType} onChange={(e) => setExpenseForm({ ...expenseForm, expenseType: e.target.value })} data-testid="input-expense-type" /></div>
            <div className="space-y-2"><Label>{t("projects.form.supplier") || "Leverantör"}</Label><Input value={expenseForm.supplierName} onChange={(e) => setExpenseForm({ ...expenseForm, supplierName: e.target.value })} data-testid="input-expense-supplier" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>{t("common.cancel") || "Avbryt"}</Button>
            <Button onClick={() => { if (expenseCategoryId) addExpenseMutation.mutate({ categoryId: expenseCategoryId, data: {
              description: expenseForm.description, amountSek: Number(expenseForm.amountSek),
              expenseDate: expenseForm.expenseDate, expenseType: expenseForm.expenseType || undefined,
              supplierName: expenseForm.supplierName || undefined,
            }}); }} disabled={addExpenseMutation.isPending || !expenseForm.description || !expenseForm.amountSek || !expenseForm.expenseDate} data-testid="button-save-expense">
              {addExpenseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("common.save") || "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD TEAM MEMBER DIALOG */}
      <Dialog open={teamDialogOpen} onOpenChange={(open) => { if (!open) { setTeamDialogOpen(false); setEditingTeamMember(null); } else setTeamDialogOpen(true); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTeamMember ? (t("projects.team.edit") || "Redigera medlem") : (t("projects.team.add") || "Lägg till medlem")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("projects.form.name") || "Namn"} *</Label><Input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} data-testid="input-team-name" /></div>
            <div className="space-y-2"><Label>{t("projects.form.email") || "E-post"}</Label><Input type="email" value={teamForm.email} onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })} data-testid="input-team-email" /></div>
            <div className="space-y-2">
              <Label>{t("projects.form.role") || "Roll"} *</Label>
              <Select value={teamForm.role} onValueChange={(v) => setTeamForm({ ...teamForm, role: v })}>
                <SelectTrigger data-testid="select-team-role"><SelectValue placeholder={t("projects.form.selectRole") || "Välj roll"} /></SelectTrigger>
                <SelectContent>
                  {Object.entries(roleLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t("projects.form.roleDesc") || "Rollbeskrivning"}</Label><Input value={teamForm.roleDescription} onChange={(e) => setTeamForm({ ...teamForm, roleDescription: e.target.value })} data-testid="input-team-role-desc" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t("projects.form.allocation") || "Allokering (%)"}</Label><Input type="number" min="0" max="100" value={teamForm.allocationPercentage} onChange={(e) => setTeamForm({ ...teamForm, allocationPercentage: e.target.value })} data-testid="input-team-allocation" /></div>
              <div className="space-y-2"><Label>{t("projects.form.monthlyCost") || "Månadskostnad (SEK)"}</Label><Input type="number" value={teamForm.monthlyCostSek} onChange={(e) => setTeamForm({ ...teamForm, monthlyCostSek: e.target.value })} data-testid="input-team-monthly-cost" /></div>
            </div>
            <div className="flex items-center gap-3"><Checkbox checked={teamForm.isExternal} onCheckedChange={(c) => setTeamForm({ ...teamForm, isExternal: !!c })} data-testid="checkbox-external" /><Label>{t("projects.form.externalConsultant") || "Extern konsult"}</Label></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t("projects.form.startDate") || "Startdatum"}</Label><Input type="date" value={teamForm.startDate} onChange={(e) => setTeamForm({ ...teamForm, startDate: e.target.value })} data-testid="input-team-start" /></div>
              <div className="space-y-2"><Label>{t("projects.form.endDate") || "Slutdatum"}</Label><Input type="date" value={teamForm.endDate} onChange={(e) => setTeamForm({ ...teamForm, endDate: e.target.value })} data-testid="input-team-end" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTeamDialogOpen(false); setEditingTeamMember(null); }}>{t("common.cancel") || "Avbryt"}</Button>
            <Button onClick={handleTeamSubmit} disabled={(addTeamMemberMutation.isPending || updateTeamMemberMutation.isPending) || !teamForm.name || !teamForm.role} data-testid="button-save-member">
              {(addTeamMemberMutation.isPending || updateTeamMemberMutation.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("common.save") || "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD RISK DIALOG */}
      <Dialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("projects.risk.add") || "Lägg till risk"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("projects.form.title") || "Titel"} *</Label><Input value={riskForm.title} onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })} data-testid="input-risk-title" /></div>
            <div className="space-y-2"><Label>{t("projects.form.description") || "Beskrivning"}</Label><Textarea value={riskForm.description} onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })} data-testid="input-risk-desc" /></div>
            <div className="space-y-2">
              <Label>{t("projects.form.riskType") || "Risktyp"}</Label>
              <Select value={riskForm.riskType} onValueChange={(v) => setRiskForm({ ...riskForm, riskType: v })}>
                <SelectTrigger data-testid="select-risk-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(riskTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("projects.risk.probability") || "Sannolikhet"} *</Label>
                <Select value={riskForm.probability} onValueChange={(v) => setRiskForm({ ...riskForm, probability: v })}>
                  <SelectTrigger data-testid="select-risk-probability"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("projects.risk.low") || "Låg"}</SelectItem>
                    <SelectItem value="medium">{t("projects.risk.medium") || "Medel"}</SelectItem>
                    <SelectItem value="high">{t("projects.risk.high") || "Hög"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("projects.risk.impact") || "Påverkan"} *</Label>
                <Select value={riskForm.impact} onValueChange={(v) => setRiskForm({ ...riskForm, impact: v })}>
                  <SelectTrigger data-testid="select-risk-impact"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("projects.risk.low") || "Låg"}</SelectItem>
                    <SelectItem value="medium">{t("projects.risk.medium") || "Medel"}</SelectItem>
                    <SelectItem value="high">{t("projects.risk.high") || "Hög"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>{t("projects.form.mitigationPlan") || "Åtgärdsplan"}</Label><Textarea value={riskForm.mitigationPlan} onChange={(e) => setRiskForm({ ...riskForm, mitigationPlan: e.target.value })} data-testid="input-risk-mitigation" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t("projects.form.assignedEmail") || "Tilldelad e-post"}</Label><Input type="email" value={riskForm.assignedToEmail} onChange={(e) => setRiskForm({ ...riskForm, assignedToEmail: e.target.value })} data-testid="input-risk-assigned" /></div>
              <div className="space-y-2"><Label>{t("projects.form.dueDate") || "Förfallodatum"}</Label><Input type="date" value={riskForm.dueDate} onChange={(e) => setRiskForm({ ...riskForm, dueDate: e.target.value })} data-testid="input-risk-due" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskDialogOpen(false)}>{t("common.cancel") || "Avbryt"}</Button>
            <Button onClick={() => addRiskMutation.mutate({
              title: riskForm.title, description: riskForm.description || undefined,
              riskType: riskForm.riskType, probability: riskForm.probability, impact: riskForm.impact,
              mitigationPlan: riskForm.mitigationPlan || undefined,
              assignedToEmail: riskForm.assignedToEmail || undefined, dueDate: riskForm.dueDate || undefined,
            })} disabled={addRiskMutation.isPending || !riskForm.title} data-testid="button-save-risk">
              {addRiskMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("common.save") || "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD DOCUMENT DIALOG */}
      <Dialog open={documentDialogOpen} onOpenChange={setDocumentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("projects.document.add") || "Lägg till dokument"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("projects.form.name") || "Namn"} *</Label><Input value={documentForm.name} onChange={(e) => setDocumentForm({ ...documentForm, name: e.target.value })} data-testid="input-document-name" /></div>
            <div className="space-y-2">
              <Label>{t("projects.form.documentType") || "Dokumenttyp"}</Label>
              <Select value={documentForm.documentType} onValueChange={(v) => setDocumentForm({ ...documentForm, documentType: v })}>
                <SelectTrigger data-testid="select-document-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(documentTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t("projects.form.description") || "Beskrivning"}</Label><Input value={documentForm.description} onChange={(e) => setDocumentForm({ ...documentForm, description: e.target.value })} data-testid="input-document-desc" /></div>
            <div className="space-y-2"><Label>{t("projects.form.fileUrl") || "Fil-URL eller länk till dokumentet"} *</Label><Input type="url" value={documentForm.fileUrl} onChange={(e) => setDocumentForm({ ...documentForm, fileUrl: e.target.value })} placeholder="https://" data-testid="input-document-url" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocumentDialogOpen(false)}>{t("common.cancel") || "Avbryt"}</Button>
            <Button onClick={() => addDocumentMutation.mutate({
              name: documentForm.name, documentType: documentForm.documentType,
              description: documentForm.description || undefined, fileUrl: documentForm.fileUrl,
            })} disabled={addDocumentMutation.isPending || !documentForm.name || !documentForm.fileUrl} data-testid="button-save-document">
              {addDocumentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("common.save") || "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
