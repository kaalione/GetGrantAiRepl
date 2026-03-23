import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { SEO } from '@/components/seo';
import {
  Loader2, Download, DollarSign, Users, AlertTriangle, CheckCircle2,
  Clock, FileText, Settings, Send, Flag, Eye
} from "lucide-react";

interface AdminStats {
  totalAgreements: number;
  byStatus: Record<string, number>;
  totalCollectedSek: number;
  totalOutstandingSek: number;
  overdueCount: number;
  overdueTotalSek: number;
  flaggedForReview: number;
}

interface AdminAgreement {
  id: string;
  userId: string;
  grantTitle: string;
  funder: string;
  status: string;
  feePercentage: number;
  approvedAmountSek: number | null;
  calculatedFeeSek: number | null;
  stripeInvoiceUrl: string | null;
  invoiceDueDate: string | null;
  flaggedForReview: boolean;
  adminNotes: string | null;
  reminderCount: number;
  createdAt: string;
}

export default function SuccessFeeAdmin() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['/api/success-fee/admin/stats'],
  });

  const { data: agreementsData, isLoading: agreementsLoading } = useQuery<{ agreements: AdminAgreement[]; total: number }>({
    queryKey: ['/api/success-fee/admin/agreements', statusFilter, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery) params.set('search', searchQuery);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return fetch(`/api/success-fee/admin/agreements${qs}`, { credentials: 'include' }).then(r => r.json());
    },
  });

  const { data: settings } = useQuery<any>({
    queryKey: ['/api/success-fee/admin/settings'],
  });

  const sendReminder = useMutation({
    mutationFn: async (agreementId: string) => {
      await apiRequest('POST', '/api/success-fee/admin/send-reminder', { agreementId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/admin/agreements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/admin/stats'] });
      toast({ title: 'Påminnelse skickad' });
    },
  });

  const updateAdmin = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; adminNotes?: string; flaggedForReview?: boolean; markReviewed?: boolean }) => {
      await apiRequest('PATCH', `/api/success-fee/agreements/${id}/admin`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/admin/agreements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/admin/stats'] });
      toast({ title: 'Uppdaterat' });
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest('PUT', '/api/success-fee/admin/settings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/success-fee/terms'] });
      toast({ title: 'Inställningar sparade' });
    },
  });

  const formatSek = (n: number) => n.toLocaleString('sv-SE');

  return (
    <div className="space-y-6" data-testid="success-fee-admin">
      <SEO title="Admin - Framgångsavgifter" noindex={true} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Framgångsavgift — Admin</h2>
          <p className="text-muted-foreground">Hantera avtal, fakturor och inställningar</p>
        </div>
        <Button variant="outline" asChild data-testid="btn-export-csv">
          <a href="/api/success-fee/admin/export" download>
            <Download className="h-4 w-4 mr-2" />
            Exportera CSV
          </a>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Översikt</TabsTrigger>
          <TabsTrigger value="agreements" data-testid="tab-agreements">Avtal</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">Inställningar</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {statsLoading ? (
            <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : stats && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" /> Totalt avtal</div>
                  <div className="text-2xl font-bold mt-1">{stats.totalAgreements}</div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="h-4 w-4" /> Inkasserat</div>
                  <div className="text-2xl font-bold mt-1 text-green-600">{formatSek(stats.totalCollectedSek)} SEK</div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> Utestående</div>
                  <div className="text-2xl font-bold mt-1 text-amber-600">{formatSek(stats.totalOutstandingSek)} SEK</div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4" /> Försenade</div>
                  <div className="text-2xl font-bold mt-1 text-red-600">{stats.overdueCount}</div>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Status fördelning</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-3">
                    {Object.entries(stats.byStatus).map(([status, count]) => (
                      <div key={status} className="flex justify-between items-center p-2 rounded-md bg-muted/50">
                        <span className="text-sm capitalize">{status.replace('_', ' ')}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {stats.flaggedForReview > 0 && (
                <Card className="border-amber-200">
                  <CardContent className="py-3 flex items-center gap-2">
                    <Flag className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium">{stats.flaggedForReview} avtal flaggade för granskning</span>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="agreements" className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Sök bidragsnamn, finansiär eller användar-ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
              data-testid="search-agreements"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" data-testid="filter-status">
                <SelectValue placeholder="Filtrera status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                <SelectItem value="pending">Inväntar</SelectItem>
                <SelectItem value="active">Aktiva</SelectItem>
                <SelectItem value="fee_invoiced">Fakturerade</SelectItem>
                <SelectItem value="fee_paid">Betalda</SelectItem>
                <SelectItem value="rejected">Avslagna</SelectItem>
                <SelectItem value="cancelled">Avbrutna</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {agreementsLoading ? (
            <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : (
            <div className="space-y-3">
              {agreementsData?.agreements.map(agreement => (
                <Card key={agreement.id} data-testid={`admin-agreement-${agreement.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{agreement.grantTitle}</span>
                          <Badge variant="outline" className="text-xs">{agreement.status}</Badge>
                          {agreement.flaggedForReview && (
                            <Badge variant="destructive" className="text-xs"><Flag className="h-3 w-3 mr-1" />Flaggad</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {agreement.funder} • User: {agreement.userId.substring(0, 8)}...
                        </div>
                        {agreement.calculatedFeeSek && (
                          <div className="text-sm">
                            Avgift: <span className="font-semibold">{formatSek(agreement.calculatedFeeSek)} SEK</span>
                            {agreement.approvedAmountSek && <span className="text-muted-foreground"> ({agreement.feePercentage}% av {formatSek(agreement.approvedAmountSek)})</span>}
                          </div>
                        )}
                        {agreement.adminNotes && (
                          <div className="text-xs text-muted-foreground mt-1 bg-muted/50 p-2 rounded">{agreement.adminNotes}</div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {agreement.status === 'fee_invoiced' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendReminder.mutate(agreement.id)}
                            disabled={sendReminder.isPending}
                            data-testid={`btn-remind-${agreement.id}`}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Påminn
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateAdmin.mutate({
                            id: agreement.id,
                            flaggedForReview: !agreement.flaggedForReview,
                          })}
                          data-testid={`btn-flag-${agreement.id}`}
                        >
                          <Flag className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateAdmin.mutate({
                            id: agreement.id,
                            markReviewed: true,
                          })}
                          data-testid={`btn-review-${agreement.id}`}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {agreementsData?.agreements.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">Inga avtal hittade</div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          {settings && (
            <SettingsForm settings={settings} onSave={(data: any) => updateSettings.mutate(data)} isPending={updateSettings.isPending} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingsForm({ settings, onSave, isPending }: { settings: any; onSave: (data: any) => void; isPending: boolean }) {
  const [feePercentage, setFeePercentage] = useState(String(settings.defaultFeePercentage));
  const [maxCap, setMaxCap] = useState(String(settings.maxFeeCapSek));
  const [minFee, setMinFee] = useState(String(settings.minFeeSek));
  const [isEnabled, setIsEnabled] = useState(settings.isEnabled);
  const [daysUntilDue, setDaysUntilDue] = useState(String(settings.invoiceDaysUntilDue));
  const [autoExpire, setAutoExpire] = useState(String(settings.autoExpireMonths));
  const [termsVersion, setTermsVersion] = useState(settings.termsVersion);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Avgiftsinställningar</CardTitle>
        <CardDescription>Ändringar gäller bara för nya avtal. Befintliga avtal behåller sina villkor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} data-testid="switch-enabled" />
          <Label>Framgångsavgift aktiverad</Label>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Avgift (%)</Label>
            <Input type="number" value={feePercentage} onChange={e => setFeePercentage(e.target.value)} data-testid="input-fee-pct" />
          </div>
          <div>
            <Label>Maxtak (SEK)</Label>
            <Input type="number" value={maxCap} onChange={e => setMaxCap(e.target.value)} data-testid="input-max-cap" />
          </div>
          <div>
            <Label>Minimiavgift (SEK)</Label>
            <Input type="number" value={minFee} onChange={e => setMinFee(e.target.value)} data-testid="input-min-fee" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Betalningsvillkor (dagar)</Label>
            <Input type="number" value={daysUntilDue} onChange={e => setDaysUntilDue(e.target.value)} data-testid="input-days-due" />
          </div>
          <div>
            <Label>Auto-förfaller efter (månader)</Label>
            <Input type="number" value={autoExpire} onChange={e => setAutoExpire(e.target.value)} data-testid="input-auto-expire" />
          </div>
          <div>
            <Label>Villkorsversion</Label>
            <Input value={termsVersion} onChange={e => setTermsVersion(e.target.value)} data-testid="input-terms-version" />
          </div>
        </div>

        <Button
          onClick={() => onSave({
            defaultFeePercentage: parseInt(feePercentage),
            maxFeeCapSek: parseInt(maxCap),
            minFeeSek: parseInt(minFee),
            isEnabled,
            invoiceDaysUntilDue: parseInt(daysUntilDue),
            autoExpireMonths: parseInt(autoExpire),
            termsVersion,
          })}
          disabled={isPending}
          data-testid="btn-save-settings"
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Spara inställningar
        </Button>
      </CardContent>
    </Card>
  );
}
