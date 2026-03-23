import { useState } from "react";
import { Settings, Database, Bell, Shield, Palette, FlaskConical, Loader2, BarChart3, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SEO } from '@/components/seo';

interface MatchingTestResult {
  status?: string;
  message?: string;
  runAt?: string;
  totalCompanies?: number;
  passed?: number;
  failed?: number;
  criticalFailures?: number;
  results?: Array<{
    companyId: string;
    label: string;
    checks: Record<string, boolean | null>;
    issues: string[];
  }>;
}

interface CoverageRow {
  source_name: string;
  total: string;
  high_conf: string;
  not_extracted: string;
  low_conf: string;
  pct_good: string;
}

function EligibilityCoverageCard() {
  const { toast } = useToast();
  const [reextracting, setReextracting] = useState(false);

  const { data: stats, isLoading, refetch } = useQuery<CoverageRow[]>({
    queryKey: ['/api/admin/eligibility/coverage'],
  });

  const totalGrants = stats?.reduce((s, r) => s + Number(r.total), 0) ?? 0;
  const totalGood = stats?.reduce((s, r) => s + Number(r.high_conf), 0) ?? 0;
  const overallPct = totalGrants > 0 ? Math.round((totalGood / totalGrants) * 100) : 0;

  const handleReextract = async (sourceName?: string) => {
    setReextracting(true);
    try {
      await apiRequest('POST', '/api/admin/eligibility/reextract-low-confidence', {
        sourceName,
        maxGrants: 200,
        threshold: 0.3,
      });
      toast({
        title: "Re-extraktion startad",
        description: sourceName
          ? `Kör om extraktion för ${sourceName} i bakgrunden.`
          : "Kör om extraktion för alla låg-konfidens bidrag i bakgrunden.",
      });
      setTimeout(() => {
        setReextracting(false);
        refetch();
      }, 5000);
    } catch {
      toast({ title: "Fel", description: "Kunde inte starta re-extraktion.", variant: "destructive" });
      setReextracting(false);
    }
  };

  return (
    <Card data-testid="card-eligibility-coverage">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Eligibility Coverage
        </CardTitle>
        <CardDescription data-testid="text-coverage-summary">
          Structured eligibility extracted for {overallPct}% of open grants ({totalGood} / {totalGrants})
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laddar täckningsdata...
          </div>
        ) : (
          <>
            <div>
              <Progress value={overallPct} className="h-3" data-testid="progress-coverage" />
              <p className="text-xs text-muted-foreground mt-1">
                Target: 70%+ for good score differentiation
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-coverage">
                <thead>
                  <tr className="text-muted-foreground text-xs">
                    <th className="text-left py-1">Source</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Good</th>
                    <th className="text-right">Low</th>
                    <th className="text-right">Coverage</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.slice(0, 15).map(row => (
                    <tr key={row.source_name} className="border-t">
                      <td className="py-1.5 font-medium truncate max-w-[200px]" data-testid={`text-source-${row.source_name}`}>
                        {row.source_name}
                      </td>
                      <td className="text-right text-muted-foreground">{row.total}</td>
                      <td className="text-right">{row.high_conf}</td>
                      <td className="text-right text-muted-foreground">{row.low_conf}</td>
                      <td className="text-right">
                        <Badge variant={
                          Number(row.pct_good) >= 70 ? 'default' :
                          Number(row.pct_good) >= 40 ? 'secondary' : 'destructive'
                        } data-testid={`badge-coverage-${row.source_name}`}>
                          {row.pct_good}%
                        </Badge>
                      </td>
                      <td className="text-right pl-2">
                        {Number(row.pct_good) < 70 && Number(row.low_conf) > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleReextract(row.source_name)}
                            disabled={reextracting}
                            data-testid={`button-retry-${row.source_name}`}
                          >
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => handleReextract()}
                disabled={reextracting}
                variant="outline"
                size="sm"
                data-testid="button-reextract-all"
              >
                {reextracting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Kör...
                  </>
                ) : (
                  'Re-extract all low-confidence'
                )}
              </Button>
              <Button
                onClick={() => refetch()}
                variant="ghost"
                size="sm"
                data-testid="button-refresh-coverage"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();

  const matchingTestQuery = useQuery<MatchingTestResult>({
    queryKey: ['/api/admin/matching-test'],
  });

  const runTestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/matching-test/run');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test startad", description: "Matchningstestet körs i bakgrunden. Uppdatera sidan om en minut." });
    },
    onError: () => {
      toast({ title: "Fel", description: "Kunde inte starta testet.", variant: "destructive" });
    },
  });

  const testData = matchingTestQuery.data;
  const hasResults = testData && testData.runAt;

  return (
    <div className="space-y-6">
      <SEO title="Admin - Inställningar" noindex={true} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-settings-title">Inställningar</h1>
        <p className="text-muted-foreground mt-1" data-testid="text-settings-subtitle">
          Konfigurera plattformen och dina preferenser
        </p>
      </div>

      <EligibilityCoverageCard />

      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-matching-quality">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Matchningskvalitet
              {hasResults && testData.criticalFailures! > 0 && (
                <Badge variant="destructive" data-testid="badge-critical-failures">
                  {testData.criticalFailures} kritiska fel
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Testa matchningsmotorn mot 10 fördefinierade företagsprofiler
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {matchingTestQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laddar testresultat...
              </div>
            ) : hasResults ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Senaste körning</span>
                  <span className="text-sm font-medium" data-testid="text-last-run">
                    {new Date(testData.runAt!).toLocaleString('sv-SE')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Resultat</span>
                  <span className="text-sm font-medium" data-testid="text-pass-count">
                    {testData.passed}/{testData.totalCompanies} godkända
                  </span>
                </div>
                {testData.failed! > 0 && (
                  <div className="mt-2 space-y-1">
                    {testData.results?.filter(r => r.issues.length > 0).map(r => (
                      <div key={r.companyId} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{r.companyId}</span>: {
                          Object.entries(r.checks)
                            .filter(([, v]) => v === false)
                            .map(([k]) => `Check ${k}`)
                            .join(', ')
                        }
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-not-run">
                Inget test har körts ännu. Kör testet för att se resultat.
              </p>
            )}
            <Separator />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => runTestMutation.mutate()}
              disabled={runTestMutation.isPending}
              data-testid="button-run-matching-test"
            >
              {runTestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Startar...
                </>
              ) : (
                'Kör matchningstest'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Databas
            </CardTitle>
            <CardDescription>
              Hantera databasinställningar och underhåll
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Automatisk rensning</Label>
                <p className="text-sm text-muted-foreground">
                  Ta bort gamla bidrag som gått ut
                </p>
              </div>
              <Switch data-testid="switch-auto-cleanup" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Backup</Label>
                <p className="text-sm text-muted-foreground">
                  Daglig säkerhetskopiering
                </p>
              </div>
              <Switch defaultChecked data-testid="switch-backup" />
            </div>
            <Separator />
            <Button variant="outline" className="w-full" data-testid="button-export-data">
              Exportera data
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifikationer
            </CardTitle>
            <CardDescription>
              Konfigurera aviseringar och påminnelser
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>E-postaviseringar</Label>
                <p className="text-sm text-muted-foreground">
                  Få mejl om nya bidrag
                </p>
              </div>
              <Switch data-testid="switch-email-notifications" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Deadline-påminnelser</Label>
                <p className="text-sm text-muted-foreground">
                  Påminn 7 dagar innan deadline
                </p>
              </div>
              <Switch defaultChecked data-testid="switch-deadline-reminders" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Skrapningsrapporter</Label>
                <p className="text-sm text-muted-foreground">
                  Veckovis sammanfattning
                </p>
              </div>
              <Switch data-testid="switch-scraping-reports" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Utseende
            </CardTitle>
            <CardDescription>
              Anpassa plattformens utseende
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Kompakt vy</Label>
                <p className="text-sm text-muted-foreground">
                  Visa fler bidrag per sida
                </p>
              </div>
              <Switch data-testid="switch-compact-view" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Animationer</Label>
                <p className="text-sm text-muted-foreground">
                  Aktivera övergångsanimationer
                </p>
              </div>
              <Switch defaultChecked data-testid="switch-animations" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Säkerhet
            </CardTitle>
            <CardDescription>
              Säkerhetsinställningar och åtkomst
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Tvåfaktorsautentisering</Label>
                <p className="text-sm text-muted-foreground">
                  Extra säkerhetsnivå vid inloggning
                </p>
              </div>
              <Switch data-testid="switch-2fa" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sessionsloggning</Label>
                <p className="text-sm text-muted-foreground">
                  Logga alla inloggningar
                </p>
              </div>
              <Switch defaultChecked data-testid="switch-session-logging" />
            </div>
            <Separator />
            <Button variant="outline" className="w-full" data-testid="button-change-password">
              Ändra lösenord
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Om getgrant.ai
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Version</p>
              <p className="font-medium">1.0.0</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Licens</p>
              <p className="font-medium">MIT</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Senast uppdaterad</p>
              <p className="font-medium">2024</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
