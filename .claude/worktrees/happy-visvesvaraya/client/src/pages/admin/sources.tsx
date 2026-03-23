import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Database, Plus, Trash2, Play, CheckCircle, XCircle, Globe, Edit, Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { SEO } from '@/components/seo';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/grants/empty-state";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ScraperSource, ScraperLog } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";

export default function AdminSources() {
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: sources, isLoading } = useQuery<ScraperSource[]>({
    queryKey: ["/api/scraper-sources"],
  });

  const { data: logs } = useQuery<ScraperLog[]>({
    queryKey: ["/api/scraper-logs"],
  });


  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/scraper-sources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scraper-sources"] });
      toast({
        title: "Källa borttagen",
        description: "Skrapkällan har tagits bort.",
      });
    },
    onError: () => {
      toast({
        title: "Fel",
        description: "Kunde inte ta bort källa. Försök igen.",
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      return apiRequest("PATCH", `/api/scraper-sources/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scraper-sources"] });
      toast({
        title: "Status uppdaterad",
        description: "Källans status har uppdaterats.",
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

  const runMutation = useMutation({
    mutationFn: async (id: string) => {
      setRunningSourceId(id);
      return apiRequest("POST", `/api/scraper-sources/${id}/run`);
    },
    onSuccess: (_, id) => {
      setRunningSourceId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/scraper-sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scraper-logs"] });
      const source = sources?.find(s => s.id === id);
      toast({
        title: "Skrapning startad",
        description: `Hämtar data från ${source?.name || "källan"}...`,
      });
    },
    onError: () => {
      setRunningSourceId(null);
      toast({
        title: "Fel",
        description: "Kunde inte starta skrapning. Försök igen.",
        variant: "destructive",
      });
    },
  });

  const getLastLog = (sourceId: string) => {
    return logs?.filter(l => l.sourceId === sourceId)
      .sort((a, b) => new Date(b.scrapedAt || 0).getTime() - new Date(a.scrapedAt || 0).getTime())[0];
  };

  return (
    <div className="space-y-6">
      <SEO title="Admin - Källor" noindex={true} />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-sources-title">Skrapkällor</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-sources-subtitle">
            Hantera källor för automatisk bidragsinsamling
          </p>
        </div>
        <Button asChild data-testid="button-add-source">
          <Link href="/admin/sources/new">
            <Plus className="mr-2 h-4 w-4" />
            Lägg till källa
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Alla källor
          </CardTitle>
          <CardDescription>
            {sources?.length || 0} konfigurerade källor
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRowSkeleton key={i} />
              ))}
            </div>
          ) : sources && sources.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Källa</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Frekvens</TableHead>
                  <TableHead>Senaste körning</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => {
                  const lastLog = getLastLog(source.id);
                  return (
                    <TableRow key={source.id} data-testid={`source-row-${source.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                            <Globe className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{source.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {source.url}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {source.type === "api" ? "API" : source.scraperType || "Skrapning"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {source.updateFrequency === "daily" ? "Dagligen" : "Veckovis"}
                      </TableCell>
                      <TableCell>
                        {lastLog ? (
                          <div className="flex items-center gap-2">
                            {lastLog.status === "success" ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(lastLog.scrapedAt!), { addSuffix: true, locale: sv })}
                            </span>
                            {lastLog.grantsFound !== null && (
                              <span className="text-xs text-muted-foreground">
                                ({lastLog.grantsFound} bidrag)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Aldrig körd</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={source.active || false}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: source.id, active: checked })}
                          disabled={toggleActiveMutation.isPending}
                          data-testid={`switch-active-${source.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => runMutation.mutate(source.id)}
                            disabled={runningSourceId === source.id}
                            data-testid={`button-run-${source.id}`}
                            title="Kör nu"
                          >
                            {runningSourceId === source.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            asChild
                            data-testid={`button-edit-${source.id}`}
                          >
                            <Link href={`/admin/sources/${source.id}/edit`}>
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(source.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${source.id}`}
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
              title="Inga källor konfigurerade"
              description="Lägg till din första skrapkälla för att börja samla in bidragsinformation automatiskt."
              icon="add"
              actionLabel="Lägg till källa"
              onAction={() => navigate("/admin/sources/new")}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
