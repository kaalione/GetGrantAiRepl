import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { FileText, Clock, CheckCircle, Send, Trash2, ExternalLink, Sparkles, Trophy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TableRowSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/grants/empty-state";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Application, Grant } from "@shared/schema";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { SEO } from '@/components/seo';
import { useTranslation } from "react-i18next";

function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
          <Clock className="mr-1 h-3 w-3" />
          Utkast
        </Badge>
      );
    case "generated":
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          <Sparkles className="mr-1 h-3 w-3" />
          Genererad
        </Badge>
      );
    case "submitted":
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
          <CheckCircle className="mr-1 h-3 w-3" />
          Inskickad
        </Badge>
      );
    case "approved":
      return (
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
          <Trophy className="mr-1 h-3 w-3" />
          Godkänd
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
          Avslag
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function MatchScoreBadge({ score }: { score: string | null }) {
  if (!score) return <span className="text-muted-foreground">-</span>;
  
  const numScore = parseFloat(score);
  let colorClass = "text-muted-foreground";
  if (numScore >= 80) colorClass = "text-green-600 dark:text-green-400";
  else if (numScore >= 60) colorClass = "text-amber-600 dark:text-amber-400";
  else colorClass = "text-red-600 dark:text-red-400";
  
  return <span className={`font-semibold ${colorClass}`}>{Math.round(numScore)}%</span>;
}

export default function Applications() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [approvalApp, setApprovalApp] = useState<Application | null>(null);
  const [approvedAmount, setApprovedAmount] = useState("");
  const [createProject, setCreateProject] = useState(true);

  const { data: applications, isLoading } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
  });

  const { data: grants } = useQuery<Grant[]>({
    queryKey: ["/api/grants"],
  });

  const grantsMap = new Map(grants?.map(g => [g.id, g]) || []);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/applications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      toast({
        title: "Ansökan borttagen",
        description: "Ansökan har tagits bort.",
      });
    },
    onError: () => {
      toast({
        title: "Fel",
        description: "Kunde inte ta bort ansökan. Försök igen.",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/applications/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      toast({
        title: "Status uppdaterad",
        description: "Ansökans status har uppdaterats.",
      });
    },
    onError: () => {
      toast({
        title: "Fel",
        description: "Kunde inte uppdatera status. Försök igen.",
        variant: "destructive",
      });
    },
  });

  const approvalMutation = useMutation({
    mutationFn: async ({ id, amount, shouldCreateProject }: { id: string; amount: string; shouldCreateProject: boolean }) => {
      await apiRequest("PATCH", `/api/applications/${id}`, { status: "approved", approvedAmount: amount });
      if (shouldCreateProject) {
        const res = await apiRequest("POST", `/api/projects/from-application/${id}`);
        return res.json();
      }
      return null;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setApprovalApp(null);
      setApprovedAmount("");
      toast({
        title: "Ansökan godkänd!",
        description: project ? "Projekt skapat automatiskt." : "Ansökan markerad som godkänd.",
      });
      if (project?.id) {
        navigate(`/projekt/${project.id}`);
      }
    },
    onError: () => {
      toast({
        title: "Fel",
        description: "Kunde inte markera som godkänd. Försök igen.",
        variant: "destructive",
      });
    },
  });

  const sortedApplications = [...(applications || [])].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  return (
    <div className="space-y-6">
      <SEO title="Ansökningar" noindex={true} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-applications-title">Ansökningar</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-applications-subtitle">
            Hantera dina bidragsansökningar
          </p>
        </div>
        <Button asChild data-testid="button-browse-grants">
          <Link href="/grants">
            <FileText className="mr-2 h-4 w-4" />
            Bläddra bidrag
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alla ansökningar</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRowSkeleton key={i} />
              ))}
            </div>
          ) : sortedApplications.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bidrag</TableHead>
                  <TableHead>Källa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Matchning</TableHead>
                  <TableHead>Skapad</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApplications.map((app) => {
                  const grant = grantsMap.get(app.grantId || "");
                  return (
                    <TableRow key={app.id} data-testid={`application-row-${app.id}`}>
                      <TableCell>
                        {grant ? (
                          <Link href={`/grants/${grant.id}`}>
                            <span className="font-medium hover:text-primary cursor-pointer" data-testid={`application-grant-title-${app.id}`}>
                              {grant.title}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Okänt bidrag</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {grant?.sourceName || "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(app.status)}</TableCell>
                      <TableCell>
                        <MatchScoreBadge score={app.matchScore} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {app.createdAt 
                          ? format(new Date(app.createdAt), "d MMM yyyy", { locale: sv })
                          : "-"
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {app.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatusMutation.mutate({ id: app.id, status: "generated" })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-generate-${app.id}`}
                            >
                              <Sparkles className="mr-1 h-3 w-3" />
                              Generera
                            </Button>
                          )}
                          {app.status === "generated" && (
                            <Button
                              size="sm"
                              onClick={() => updateStatusMutation.mutate({ id: app.id, status: "submitted" })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-submit-${app.id}`}
                            >
                              <Send className="mr-1 h-3 w-3" />
                              Markera inskickad
                            </Button>
                          )}
                          {app.status === "submitted" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
                              onClick={() => { setApprovalApp(app); setApprovedAmount(""); }}
                              data-testid={`button-approve-${app.id}`}
                            >
                              <Trophy className="mr-1 h-3 w-3" />
                              Markera godkänd
                            </Button>
                          )}
                          {grant?.url && (
                            <Button size="sm" variant="ghost" asChild>
                              <a href={grant.url} target="_blank" rel="noopener noreferrer" data-testid={`button-external-${app.id}`}>
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(app.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${app.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={FileText}
              title={t("applications.empty.title", "Starta din första ansökan")}
              description={t("applications.empty.description", "Hitta ett bidrag som matchar ditt företag och använd AI för att skapa ett komplett ansökningsutkast på minuter.")}
              actionLabel={t("applications.empty.findMatching", "Hitta matchande bidrag")}
              onAction={() => navigate("/bidrag?filter=matching")}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!approvalApp} onOpenChange={(open) => { if (!open) setApprovalApp(null); }}>
        <DialogContent data-testid="dialog-approval">
          <DialogHeader>
            <DialogTitle>Markera ansökan som godkänd</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="approved-amount">Godkänt belopp (SEK)</Label>
              <Input
                id="approved-amount"
                type="number"
                placeholder="t.ex. 500000"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
                data-testid="input-approved-amount"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="create-project">Skapa projekt automatiskt</Label>
                <p className="text-xs text-muted-foreground">Ett projekthanteringsprojekt skapas med milstolpar och budget.</p>
              </div>
              <Switch
                id="create-project"
                checked={createProject}
                onCheckedChange={setCreateProject}
                data-testid="switch-create-project"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalApp(null)} data-testid="button-cancel-approval">Avbryt</Button>
            <Button
              onClick={() => approvalApp && approvalMutation.mutate({ id: approvalApp.id, amount: approvedAmount, shouldCreateProject: createProject })}
              disabled={approvalMutation.isPending || !approvedAmount}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-confirm-approval"
            >
              {approvalMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4" />}
              Godkänn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
