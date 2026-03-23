import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Users, UserPlus, Activity, FileText, Download, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/seo";
import { useToast } from "@/hooks/use-toast";

interface AnalyticsData {
  summary: {
    totalClients: number;
    activeClients: number;
    newClients: number;
    applications: number;
  };
  clientGrowth: Array<{ date: string; count: number }>;
  topClients: Array<{ id: number; name: string; company?: string; grantCount: number }>;
  planUsage: {
    used: number;
    limit: number;
    plan: string;
  };
}

const PERIOD_OPTIONS = [
  { value: "7d", label: "Senaste 7 dagarna" },
  { value: "30d", label: "Senaste 30 dagarna" },
  { value: "90d", label: "Senaste 90 dagarna" },
  { value: "12m", label: "Senaste 12 månaderna" },
];

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function BarChart({ data, maxValue }: { data: Array<{ date: string; count: number }>; maxValue: number }) {
  if (!data.length) return null;
  const safeMax = maxValue || 1;

  return (
    <div className="flex items-end gap-1 h-40" data-testid="chart-client-growth">
      {data.map((item, index) => {
        const height = Math.max((item.count / safeMax) * 100, 4);
        return (
          <div
            key={index}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <span className="text-xs text-muted-foreground">{item.count}</span>
            <div
              className="w-full rounded-t-sm bg-primary/80 transition-all"
              style={{ height: `${height}%` }}
              data-testid={`bar-growth-${index}`}
              title={`${item.date}: ${item.count}`}
            />
            <span className="text-xs text-muted-foreground truncate w-full text-center">
              {item.date.slice(-5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PartnerAnalytics() {
  const { toast } = useToast();
  const [period, setPeriod] = useState("30d");

  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/partner/analytics", `?period=${period}`],
  });

  const summary = analytics?.summary;
  const growth = analytics?.clientGrowth || [];
  const topClients = analytics?.topClients || [];
  const planUsage = analytics?.planUsage;
  const maxGrowthValue = Math.max(...growth.map((g) => g.count), 0);
  const usagePercent = planUsage ? Math.min(Math.round((planUsage.used / planUsage.limit) * 100), 100) : 0;

  function handleExport() {
    const link = document.createElement("a");
    link.href = `/api/partner/analytics/export?period=${period}`;
    link.download = `partner-analytics-${period}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export startad", description: "CSV-filen laddas ner." });
  }

  return (
    <>
      <SEO title="Analys - Partner" description="Statistik och analyser för din partnerportal" noindex={true} />
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-analytics-title">Analys</h1>
            <p className="text-muted-foreground" data-testid="text-analytics-subtitle">
              Statistik och analyser för din partnerportal.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[200px]" data-testid="select-period">
                <SelectValue placeholder="Välj period" />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExport} data-testid="button-export-csv">
              <Download className="mr-2 h-4 w-4" />
              Exportera CSV
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <Card data-testid="stat-total-clients">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Totalt kunder</p>
                      <p className="text-3xl font-bold mt-1">{summary?.totalClients ?? 0}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900">
                      <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-active-clients">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Aktiva denna period</p>
                      <p className="text-3xl font-bold mt-1">{summary?.activeClients ?? 0}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-green-100 dark:bg-green-900">
                      <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-new-clients">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Nya kunder</p>
                      <p className="text-3xl font-bold mt-1">{summary?.newClients ?? 0}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900">
                      <UserPlus className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-applications">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Ansökningar</p>
                      <p className="text-3xl font-bold mt-1">{summary?.applications ?? 0}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900">
                      <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card data-testid="card-client-growth">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Kundtillväxt
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : growth.length > 0 ? (
              <BarChart data={growth} maxValue={maxGrowthValue} />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Ingen data för vald period</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-top-clients">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Topkunder
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : topClients.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Namn</TableHead>
                      <TableHead>Företag</TableHead>
                      <TableHead className="text-right">Ansökningar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topClients.map((client) => (
                      <TableRow key={client.id} data-testid={`row-top-client-${client.id}`}>
                        <TableCell className="font-medium">{client.name}</TableCell>
                        <TableCell className="text-muted-foreground">{client.company || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{client.grantCount}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Inga kunder att visa</p>
              </div>
            )}
          </CardContent>
        </Card>

        {planUsage && (
          <Card data-testid="card-plan-usage">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Plananvändning
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {planUsage.used} av {planUsage.limit} kunder
                </span>
                <span className="text-sm font-medium capitalize" data-testid="text-plan-name">
                  {planUsage.plan}
                </span>
              </div>
              <Progress value={usagePercent} className="h-2" data-testid="progress-plan-usage" />
              <p className="text-xs text-muted-foreground mt-2" data-testid="text-usage-percent">
                {usagePercent}% av planens kapacitet
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}