import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, UserPlus, Palette, ExternalLink, Activity, TrendingUp, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/seo";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface PartnerProfile {
  id: number;
  name: string;
  subdomain: string;
  plan: string;
  logoUrl?: string;
  primaryColor?: string;
  clientCount?: number;
}

interface PartnerAnalytics {
  summary: {
    totalClients: number;
    activeClients: number;
    pendingInvites: number;
    blockedClients: number;
  };
  clientGrowth: Array<{ date: string; count: number }>;
  topClients: Array<{ id: number; name: string; company?: string; grantCount: number }>;
  planUsage: {
    used: number;
    limit: number;
    plan: string;
  };
}

interface PartnerClient {
  id: number;
  name: string;
  email: string;
  companyName?: string;
  status: string;
  createdAt: string;
}

interface ActivityItem {
  id: number;
  type: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16 mb-1" />
          </div>
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-4 w-3/4 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PartnerDashboard() {
  const [, setLocation] = useLocation();

  const { data: profile, isLoading: profileLoading } = useQuery<PartnerProfile>({
    queryKey: ["/api/partner/profile"],
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<PartnerAnalytics>({
    queryKey: ["/api/partner/analytics"],
  });

  const { data: recentClientsData, isLoading: clientsLoading } = useQuery<{ clients: PartnerClient[] }>({
    queryKey: ["/api/partner/clients", "?limit=5"],
  });

  const { data: activityData, isLoading: activityLoading } = useQuery<{ activity: ActivityItem[] }>({
    queryKey: ["/api/partner/activity"],
  });

  const recentClients = recentClientsData?.clients || [];
  const activityItems = activityData?.activity || (Array.isArray(activityData) ? activityData as unknown as ActivityItem[] : []);
  const summary = analytics?.summary;
  const planUsage = analytics?.planUsage;

  const usagePercent = planUsage ? Math.min(Math.round((planUsage.used / planUsage.limit) * 100), 100) : 0;

  const isLoading = profileLoading || analyticsLoading;

  return (
    <>
      <SEO title="Partner Dashboard" description="Hantera din partnerportal" noindex={true} />
      <div className="space-y-8 animate-fade-in">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white">
          <div className="absolute inset-0 bg-grid-white/10" />
          <div className="relative z-10">
            <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="text-partner-dashboard-title">
              {profile?.name ? `Välkommen, ${profile.name}` : "Partner Dashboard"}
            </h1>
            <p className="text-indigo-100 max-w-xl" data-testid="text-partner-dashboard-subtitle">
              Hantera dina kunder, varumärke och övervaka din partnerportal.
            </p>
            <div className="mt-6 flex gap-3 flex-wrap">
              <Button
                variant="secondary"
                size="lg"
                data-testid="button-invite-client-hero"
                onClick={() => setLocation("/partner/clients")}
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Bjud in kund
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="bg-white/10 border-white/30 text-white"
                data-testid="button-manage-branding-hero"
                onClick={() => setLocation("/partner/settings")}
              >
                <Palette className="mr-2 h-5 w-5" />
                Hantera varumärke
              </Button>
            </div>
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
                      <p className="text-sm text-muted-foreground">Aktiva kunder</p>
                      <p className="text-3xl font-bold mt-1">{summary?.activeClients ?? 0}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-green-100 dark:bg-green-900">
                      <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-pending-invites">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Väntande inbjudningar</p>
                      <p className="text-3xl font-bold mt-1">{summary?.pendingInvites ?? 0}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900">
                      <UserPlus className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-plan">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Aktuell plan</p>
                      <p className="text-3xl font-bold mt-1 capitalize">{planUsage?.plan || profile?.plan || "—"}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900">
                      <Crown className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {!isLoading && planUsage && (
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
                <span className="text-sm font-medium" data-testid="text-usage-percent">
                  {usagePercent}%
                </span>
              </div>
              <Progress value={usagePercent} className="h-2" data-testid="progress-plan-usage" />
              {usagePercent >= 90 && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                  Du närmar dig din plangräns. Överväg att uppgradera.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card data-testid="card-recent-activity">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Senaste aktivitet
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <ActivitySkeleton />
              ) : activityItems.length > 0 ? (
                <div className="space-y-3">
                  {activityItems.slice(0, 10).map((item) => (
                    <div key={item.id} className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid={`activity-item-${item.id}`}>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Activity className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{item.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(item.createdAt), "d MMM yyyy, HH:mm", { locale: sv })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Ingen aktivitet ännu</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-recent-clients">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Senaste kunder
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="button-view-all-clients"
                  onClick={() => setLocation("/partner/clients")}
                >
                  Visa alla
                  <ExternalLink className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {clientsLoading ? (
                <ActivitySkeleton />
              ) : recentClients.length > 0 ? (
                <div className="space-y-3">
                  {recentClients.map((client) => (
                    <div key={client.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50" data-testid={`recent-client-${client.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{client.name || client.email}</p>
                        {client.companyName && (
                          <p className="text-xs text-muted-foreground truncate">{client.companyName}</p>
                        )}
                      </div>
                      <Badge
                        variant={
                          client.status === "active" ? "default" :
                          client.status === "invited" ? "outline" :
                          client.status === "blocked" ? "destructive" :
                          "secondary"
                        }
                        className="shrink-0"
                      >
                        {client.status === "active" ? "Aktiv" :
                         client.status === "invited" ? "Inbjuden" :
                         client.status === "blocked" ? "Blockerad" :
                         "Inaktiv"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Inga kunder ännu</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    data-testid="button-invite-first-client"
                    onClick={() => setLocation("/partner/clients")}
                  >
                    <UserPlus className="mr-1 h-4 w-4" />
                    Bjud in din första kund
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/partner/clients")} data-testid="quick-action-invite">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900">
                  <UserPlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Bjud in kund</h3>
                  <p className="text-sm text-muted-foreground">Skicka inbjudan till nya kunder</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/partner/settings")} data-testid="quick-action-branding">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900">
                  <Palette className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Hantera varumärke</h3>
                  <p className="text-sm text-muted-foreground">Anpassa logotyp, färger och domän</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
