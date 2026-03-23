import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Settings, Save, RefreshCw, Key, Copy, Trash2, Plus, Shield, Crown, AlertTriangle, ExternalLink, CreditCard, Users, Mail, ToggleLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/seo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface PartnerProfile {
  id: number;
  name: string;
  subdomain: string;
  plan: string;
  companyName?: string;
  orgNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  allowClientSelfSignup?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSubscriptionStatus?: string;
}

interface ProfileFormValues {
  companyName: string;
  orgNumber: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
}

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
}

interface NewApiKeyResponse {
  id: number;
  name: string;
  key: string;
  scopes: string[];
}

const PLAN_DETAILS: Record<string, { name: string; features: string[] }> = {
  starter: {
    name: "Starter",
    features: ["Upp till 10 kunder", "Grundläggande varumärke", "Subdomän"],
  },
  professional: {
    name: "Professional",
    features: ["Upp till 50 kunder", "Fullständigt varumärke", "Anpassad domän", "API-åtkomst", "Prioriterad support"],
  },
  enterprise: {
    name: "Enterprise",
    features: ["Obegränsade kunder", "Fullständigt varumärke", "Anpassad domän", "API-åtkomst", "Dedikerad support", "SLA"],
  },
};

const SCOPE_OPTIONS = [
  { value: "read_clients", label: "Läsa kunder" },
  { value: "manage_clients", label: "Hantera kunder" },
  { value: "read_analytics", label: "Läsa analys" },
];

export default function PartnerSettings() {
  const { toast } = useToast();
  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read_clients"]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data: profile, isLoading: profileLoading } = useQuery<PartnerProfile>({
    queryKey: ["/api/partner/profile"],
  });

  const isProfessionalPlus = profile?.plan === "professional" || profile?.plan === "enterprise";

  const { data: apiKeysData, isLoading: keysLoading } = useQuery<{ keys: ApiKey[] }>({
    queryKey: ["/api/partner/api-keys"],
    enabled: isProfessionalPlus,
  });

  const apiKeys = apiKeysData?.keys || (Array.isArray(apiKeysData) ? apiKeysData as unknown as ApiKey[] : []);

  const form = useForm<ProfileFormValues>({
    defaultValues: {
      companyName: "",
      orgNumber: "",
      contactEmail: "",
      contactPhone: "",
      website: "",
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        companyName: profile.companyName || "",
        orgNumber: profile.orgNumber || "",
        contactEmail: profile.contactEmail || "",
        contactPhone: profile.contactPhone || "",
        website: profile.website || "",
      });
    }
  }, [profile, form]);

  const saveProfileMutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      await apiRequest("PUT", "/api/partner/profile", values);
    },
    onSuccess: () => {
      toast({ title: "Inställningar sparade", description: "Dina kontoinställningar har uppdaterats." });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/profile"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/partner/api-keys", {
        name: newKeyName,
        scopes: newKeyScopes,
      });
      return res.json() as Promise<NewApiKeyResponse>;
    },
    onSuccess: (data) => {
      setCreatedKey(data.key);
      toast({ title: "API-nyckel skapad", description: "Kopiera nyckeln nu – den visas inte igen." });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/api-keys"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      await apiRequest("DELETE", `/api/partner/api-keys/${keyId}`);
    },
    onSuccess: () => {
      toast({ title: "API-nyckel borttagen", description: "Nyckeln har revokerats." });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/api-keys"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    },
  });

  function handleCopyKey() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      toast({ title: "Kopierat", description: "API-nyckeln har kopierats till urklipp." });
    }
  }

  function handleNewKeyDialogClose(open: boolean) {
    if (!open) {
      setNewKeyName("");
      setNewKeyScopes(["read_clients"]);
      setCreatedKey(null);
    }
    setNewKeyDialogOpen(open);
  }

  function toggleScope(scope: string) {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  const planInfo = PLAN_DETAILS[profile?.plan || "starter"] || PLAN_DETAILS.starter;

  if (profileLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <>
      <SEO title="Inställningar - Partner" description="Hantera dina partnerinställningar" noindex={true} />
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-settings-title">Inställningar</h1>
          <p className="text-muted-foreground" data-testid="text-settings-subtitle">
            Hantera ditt partnerkonto och API-nycklar.
          </p>
        </div>

        <Card data-testid="card-company-info">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Företagsinformation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((values) => saveProfileMutation.mutate(values))} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Företagsnamn</Label>
                  <Input
                    id="companyName"
                    {...form.register("companyName")}
                    placeholder="Företag AB"
                    data-testid="input-company-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgNumber">Organisationsnummer</Label>
                  <Input
                    id="orgNumber"
                    {...form.register("orgNumber")}
                    placeholder="556000-0000"
                    data-testid="input-org-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Kontakt e-post</Label>
                  <Input
                    id="contactEmail"
                    {...form.register("contactEmail")}
                    placeholder="kontakt@foretag.se"
                    data-testid="input-contact-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Kontakttelefon</Label>
                  <Input
                    id="contactPhone"
                    {...form.register("contactPhone")}
                    placeholder="+46 70 123 45 67"
                    data-testid="input-contact-phone"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="website">Webbplats</Label>
                  <Input
                    id="website"
                    {...form.register("website")}
                    placeholder="https://foretag.se"
                    data-testid="input-website"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={saveProfileMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {saveProfileMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Sparar...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Spara inställningar
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card data-testid="card-plan">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Crown className="h-5 w-5" />
              Partnerplan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h3 className="text-xl font-bold" data-testid="text-plan-name">{planInfo.name}</h3>
              <Badge variant="default" data-testid="badge-current-plan">Aktiv</Badge>
            </div>
            <ul className="space-y-2">
              {planInfo.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm" data-testid={`text-plan-feature-${i}`}>
                  <Shield className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {isProfessionalPlus && (
          <Card data-testid="card-client-settings">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Klientinställningar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">Klient-självanmälan</p>
                  <p className="text-sm text-muted-foreground">
                    Tillåt nya klienter att registrera sig själva via din plattform utan inbjudan.
                  </p>
                </div>
                <Switch
                  checked={profile?.allowClientSelfSignup ?? false}
                  onCheckedChange={async (checked) => {
                    try {
                      await apiRequest("PUT", "/api/partner/profile", { allowClientSelfSignup: checked });
                      queryClient.invalidateQueries({ queryKey: ["/api/partner/profile"] });
                      toast({ title: checked ? "Självanmälan aktiverad" : "Självanmälan inaktiverad" });
                    } catch (error: any) {
                      toast({ title: "Fel", description: error.message, variant: "destructive" });
                    }
                  }}
                  data-testid="switch-self-signup"
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-billing">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Fakturering & Prenumeration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-medium text-sm">Plan: {planInfo.name}</p>
                <p className="text-sm text-muted-foreground">
                  {profile?.stripeSubscriptionStatus === 'active'
                    ? 'Din prenumeration är aktiv'
                    : 'Hantera din fakturering via Stripe'}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await apiRequest("POST", "/api/billing/portal", {});
                    const data = await res.json();
                    if (data.url) window.location.href = data.url;
                  } catch (error: any) {
                    toast({ title: "Fel", description: error.message, variant: "destructive" });
                  }
                }}
                data-testid="button-manage-billing"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Hantera fakturering
              </Button>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              Du kan uppgradera, nedgradera eller avsluta din prenumeration via Stripe-portalen. Ändringar träder i kraft omedelbart.
            </p>
          </CardContent>
        </Card>

        {isProfessionalPlus && (
          <Card data-testid="card-api-keys">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API-nycklar
                </CardTitle>
                <Dialog open={newKeyDialogOpen} onOpenChange={handleNewKeyDialogClose}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-create-api-key">
                      <Plus className="mr-2 h-4 w-4" />
                      Skapa ny nyckel
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Skapa API-nyckel</DialogTitle>
                      <DialogDescription>
                        Skapa en ny API-nyckel för att integrera med ditt system.
                      </DialogDescription>
                    </DialogHeader>

                    {createdKey ? (
                      <div className="space-y-4">
                        <div className="rounded-md bg-muted p-4">
                          <p className="text-sm font-medium mb-2">Din nya API-nyckel:</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm break-all font-mono" data-testid="text-new-api-key">
                              {createdKey}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleCopyKey}
                              data-testid="button-copy-api-key"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          Kopiera nyckeln nu. Den visas inte igen.
                        </p>
                        <DialogFooter>
                          <Button onClick={() => handleNewKeyDialogClose(false)} data-testid="button-done-api-key">
                            Klar
                          </Button>
                        </DialogFooter>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="keyName">Nyckelnamn</Label>
                          <Input
                            id="keyName"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            placeholder="Min integration"
                            data-testid="input-api-key-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Behörigheter</Label>
                          <div className="space-y-3">
                            {SCOPE_OPTIONS.map((scope) => (
                              <div key={scope.value} className="flex items-center gap-2">
                                <Checkbox
                                  id={scope.value}
                                  checked={newKeyScopes.includes(scope.value)}
                                  onCheckedChange={() => toggleScope(scope.value)}
                                  data-testid={`checkbox-scope-${scope.value}`}
                                />
                                <Label htmlFor={scope.value} className="text-sm font-normal cursor-pointer">
                                  {scope.label}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => createKeyMutation.mutate()}
                            disabled={!newKeyName || newKeyScopes.length === 0 || createKeyMutation.isPending}
                            data-testid="button-generate-api-key"
                          >
                            {createKeyMutation.isPending ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Skapar...
                              </>
                            ) : (
                              <>
                                <Key className="mr-2 h-4 w-4" />
                                Skapa nyckel
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {keysLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : apiKeys.length > 0 ? (
                <div className="space-y-3">
                  {apiKeys.map((apiKey) => (
                    <div
                      key={apiKey.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-md border flex-wrap"
                      data-testid={`api-key-${apiKey.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{apiKey.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <code className="text-xs text-muted-foreground font-mono">{apiKey.keyPrefix}...</code>
                          {apiKey.scopes.map((scope) => (
                            <Badge key={scope} variant="secondary" className="text-xs">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Skapad {format(new Date(apiKey.createdAt), "d MMM yyyy", { locale: sv })}
                          {apiKey.lastUsedAt && (
                            <> · Senast använd {format(new Date(apiKey.lastUsedAt), "d MMM yyyy", { locale: sv })}</>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive shrink-0"
                        onClick={() => revokeKeyMutation.mutate(apiKey.id)}
                        disabled={revokeKeyMutation.isPending}
                        data-testid={`button-revoke-key-${apiKey.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Inga API-nycklar</p>
                  <p className="text-xs mt-1">Skapa en nyckel för att integrera med ditt system.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-destructive/30" data-testid="card-danger-zone">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Farlig zon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Om du vill radera ditt partnerkonto, vänligen kontakta vår support.
            </p>
            <Button variant="outline" asChild data-testid="button-contact-support">
              <a href="mailto:support@getgrant.ai">
                <ExternalLink className="mr-2 h-4 w-4" />
                Kontakta support
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}