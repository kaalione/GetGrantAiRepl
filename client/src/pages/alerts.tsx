import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Radar, Bell, Plus, Trash2, Pencil, ChevronRight, X } from "lucide-react";
import { EmptyState } from "@/components/grants/empty-state";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/seo";
import type { GrantAlert, Grant } from "@shared/schema";

type AlertWithCounts = GrantAlert & { matchCount: number; unnotifiedMatches: number };
type AlertMatchWithGrant = { id: string; alertId: string; grantId: string; matchScore: number | null; grant: Grant };

interface AlertFormData {
  name: string;
  keywords: string;
  sources: string[];
  minAmount: string;
  maxAmount: string;
  minMatchScore: number;
  notifyImmediately: boolean;
  includeInDigest: boolean;
  companyId: string | null;
}

const defaultFormData: AlertFormData = {
  name: "",
  keywords: "",
  sources: [],
  minAmount: "",
  maxAmount: "",
  minMatchScore: 60,
  notifyImmediately: true,
  includeInDigest: true,
  companyId: null,
};

export default function AlertsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<AlertWithCounts | null>(null);
  const [viewingMatchesId, setViewingMatchesId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AlertFormData>(defaultFormData);

  const { data: alerts = [], isLoading } = useQuery<AlertWithCounts[]>({
    queryKey: ["/api/alerts"],
  });

  const { data: grantSources = [] } = useQuery<string[]>({
    queryKey: ["/api/grant-sources"],
  });

  const { data: matchesData = [], isLoading: matchesLoading } = useQuery<AlertMatchWithGrant[]>({
    queryKey: ["/api/alerts", viewingMatchesId, "matches"],
    enabled: !!viewingMatchesId,
    queryFn: async () => {
      const res = await fetch(`/api/alerts/${viewingMatchesId}/matches`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/alerts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: t("alerts.saveSuccess") });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: t("alerts.saveError"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/alerts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: t("alerts.saveSuccess") });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: t("alerts.saveError"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: t("alerts.deleteSuccess") });
    },
    onError: () => {
      toast({ title: t("alerts.deleteError"), variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/alerts/${id}`, { active });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: variables.active ? t("alerts.enabled") : t("alerts.disabled") });
    },
    onError: () => {
      toast({ title: t("alerts.toggleError"), variant: "destructive" });
    },
  });

  function openCreateDialog() {
    setEditingAlert(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  }

  function openEditDialog(alert: AlertWithCounts) {
    setEditingAlert(alert);
    setFormData({
      name: alert.name,
      keywords: (alert.keywords as string[] || []).join(", "),
      sources: (alert.sources as string[]) || [],
      minAmount: alert.minAmount || "",
      maxAmount: alert.maxAmount || "",
      minMatchScore: alert.minMatchScore || 60,
      notifyImmediately: alert.notifyImmediately ?? true,
      includeInDigest: alert.includeInDigest ?? true,
      companyId: alert.companyId || null,
    });
    setDialogOpen(true);
  }

  function handleSave() {
    const keywordsArray = formData.keywords
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    const payload = {
      name: formData.name,
      keywords: keywordsArray.length > 0 ? keywordsArray : null,
      sources: formData.sources.length > 0 ? formData.sources : null,
      minAmount: formData.minAmount || null,
      maxAmount: formData.maxAmount || null,
      minMatchScore: formData.minMatchScore,
      notifyImmediately: formData.notifyImmediately,
      includeInDigest: formData.includeInDigest,
      companyId: formData.companyId,
    };

    if (editingAlert) {
      updateMutation.mutate({ id: editingAlert.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(id: string) {
    if (confirm(t("alerts.deleteConfirm"))) {
      deleteMutation.mutate(id);
    }
  }

  function toggleSource(source: string) {
    setFormData((prev) => ({
      ...prev,
      sources: prev.sources.includes(source)
        ? prev.sources.filter((s) => s !== source)
        : [...prev.sources, source],
    }));
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <SEO title={t("alerts.title")} noindex={true} />
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (viewingMatchesId) {
    const alert = alerts.find((a) => a.id === viewingMatchesId);
    return (
      <div className="p-6 space-y-4">
        <SEO title={`${t("alerts.matches")} - ${alert?.name || ""}`} noindex={true} />
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewingMatchesId(null)}
            data-testid="button-back-to-alerts"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{alert?.name}</h1>
            <p className="text-muted-foreground">{t("alerts.matches")}</p>
          </div>
        </div>

        {matchesLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-muted rounded" />
            ))}
          </div>
        ) : matchesData.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Radar className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">{t("alerts.noMatches")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {matchesData.map((match) => (
              <Card key={match.id} data-testid={`card-alert-match-${match.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <a href={`/bidrag/${match.grant.id}`} className="font-semibold hover:underline">
                        {match.grant.title}
                      </a>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="outline">{match.grant.sourceName}</Badge>
                        {match.matchScore && (
                          <Badge variant="secondary">{t("alerts.matchScore")}: {match.matchScore}%</Badge>
                        )}
                        {match.grant.deadline && (
                          <span className="text-sm text-muted-foreground">
                            Deadline: {new Date(match.grant.deadline).toLocaleDateString("sv-SE")}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/bidrag/${match.grant.id}`} data-testid={`link-grant-${match.grant.id}`}>
                        {t("alerts.viewMatches")}
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <SEO title={t("alerts.title")} noindex={true} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radar className="h-6 w-6" />
            {t("alerts.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("alerts.description")}</p>
        </div>
        <Button onClick={openCreateDialog} data-testid="button-create-alert">
          <Plus className="mr-2 h-4 w-4" />
          {t("alerts.create")}
        </Button>
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t("alerts.empty.title", "Missa aldrig ett nytt bidrag")}
          description={t("alerts.empty.description", "Skapa en bidragsbevakning så mejlar vi dig när ett nytt bidrag som matchar dina kriterier publiceras.")}
          actionLabel={t("alerts.empty.createFirst", "Skapa din första bevakning")}
          onAction={openCreateDialog}
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card key={alert.id} data-testid={`card-alert-${alert.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="font-semibold">{alert.name}</h3>
                      {alert.unnotifiedMatches > 0 && (
                        <Badge variant="destructive" data-testid={`badge-unnotified-${alert.id}`}>
                          {alert.unnotifiedMatches} {t("alerts.new")}
                        </Badge>
                      )}
                      <Badge variant={alert.active ? "default" : "secondary"}>
                        {alert.active ? t("alerts.active") : t("alerts.inactive")}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {(alert.keywords as string[])?.length > 0 && (
                        <Badge variant="outline">
                          {t("alerts.keywords")}: {(alert.keywords as string[]).join(", ")}
                        </Badge>
                      )}
                      {(alert.sources as string[])?.length > 0 && (
                        <Badge variant="outline">
                          {t("alerts.sources")}: {(alert.sources as string[]).join(", ")}
                        </Badge>
                      )}
                      {alert.minAmount && (
                        <Badge variant="outline">Min: {Number(alert.minAmount).toLocaleString("sv-SE")} kr</Badge>
                      )}
                      {alert.minMatchScore && (
                        <Badge variant="outline">
                          {t("alerts.minScore")}: {alert.minMatchScore}%
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span>{alert.matchCount} {t("alerts.totalMatches")}</span>
                      {(alert.triggerCount ?? 0) > 0 && (
                        <span>
                          {t("alerts.triggered")} {alert.triggerCount} {t("alerts.times")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingMatchesId(alert.id)}
                      data-testid={`button-view-matches-${alert.id}`}
                    >
                      {t("alerts.viewMatches")}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                    <Switch
                      checked={alert.active ?? true}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: alert.id, active: checked })}
                      data-testid={`switch-active-${alert.id}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(alert)}
                      data-testid={`button-edit-${alert.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(alert.id)}
                      data-testid={`button-delete-${alert.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAlert ? t("alerts.editDialog") : t("alerts.createDialog")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            <div className="space-y-2">
              <Label htmlFor="alert-name">{t("alerts.name")}</Label>
              <Input
                id="alert-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("alerts.namePlaceholder")}
                data-testid="input-alert-name"
              />
            </div>

            <Separator />

            <div>
              <h3 className="font-medium mb-3">{t("alerts.filterCriteria")}</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="alert-keywords">{t("alerts.keywords")}</Label>
                  <Input
                    id="alert-keywords"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder={t("alerts.keywordsPlaceholder")}
                    data-testid="input-alert-keywords"
                  />
                  <p className="text-xs text-muted-foreground">{t("alerts.keywordsHelp")}</p>
                </div>

                {grantSources.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t("alerts.sources")}</Label>
                    <div className="flex flex-wrap gap-2">
                      {grantSources.map((source) => (
                        <Badge
                          key={source}
                          variant={formData.sources.includes(source) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleSource(source)}
                          data-testid={`badge-source-${source}`}
                        >
                          {source}
                          {formData.sources.includes(source) && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("alerts.sourcesHelp")}</p>
                  </div>
                )}

                <div>
                  <Label className="mb-2 block">{t("alerts.amountRange")}</Label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Input
                      type="number"
                      value={formData.minAmount}
                      onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                      placeholder={t("alerts.minAmount")}
                      className="flex-1 min-w-[140px]"
                      data-testid="input-alert-min-amount"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="number"
                      value={formData.maxAmount}
                      onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                      placeholder={t("alerts.maxAmount")}
                      className="flex-1 min-w-[140px]"
                      data-testid="input-alert-max-amount"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("alerts.minScore")}: {formData.minMatchScore}%</Label>
                  <Slider
                    value={[formData.minMatchScore]}
                    onValueChange={([val]) => setFormData({ ...formData, minMatchScore: val })}
                    min={0}
                    max={100}
                    step={5}
                    data-testid="slider-alert-min-score"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-medium mb-3">{t("alerts.notificationOptions")}</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="notify-immediately">{t("alerts.notifyImmediately")}</Label>
                  <Switch
                    id="notify-immediately"
                    checked={formData.notifyImmediately}
                    onCheckedChange={(checked) => setFormData({ ...formData, notifyImmediately: checked })}
                    data-testid="switch-notify-immediately"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="include-digest">{t("alerts.includeInDigest")}</Label>
                  <Switch
                    id="include-digest"
                    checked={formData.includeInDigest}
                    onCheckedChange={(checked) => setFormData({ ...formData, includeInDigest: checked })}
                    data-testid="switch-include-digest"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-alert-cancel">
                {t("alerts.cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={!formData.name.trim() || createMutation.isPending || updateMutation.isPending}
                data-testid="button-alert-save"
              >
                {t("alerts.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
