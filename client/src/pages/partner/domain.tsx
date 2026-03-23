import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Globe, CheckCircle2, Clock, Trash2, RefreshCw, ArrowUpCircle, Copy, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/seo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PartnerProfile {
  id: number;
  name: string;
  subdomain: string;
  plan: string;
  customDomain?: string;
  domainVerified?: boolean;
  domainVerificationToken?: string;
}

function DnsInstructions({ domain, token }: { domain: string; token?: string }) {
  const { toast } = useToast();

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Kopierat", description: "Värdet har kopierats till urklipp." });
  }

  return (
    <div className="space-y-4">
      <Alert data-testid="alert-dns-cname">
        <Globe className="h-4 w-4" />
        <AlertTitle>CNAME-post</AlertTitle>
        <AlertDescription>
          <p className="mb-2 text-sm">Skapa en CNAME-post för din domän som pekar till vår server:</p>
          <div className="flex items-center gap-2 rounded-md bg-muted p-3 font-mono text-sm">
            <div className="flex-1 min-w-0">
              <p><span className="text-muted-foreground">Namn:</span> {domain}</p>
              <p><span className="text-muted-foreground">Värde:</span> partner.getgrant.ai</p>
              <p><span className="text-muted-foreground">Typ:</span> CNAME</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyToClipboard("partner.getgrant.ai")}
              data-testid="button-copy-cname"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      {token && (
        <Alert data-testid="alert-dns-txt">
          <Shield className="h-4 w-4" />
          <AlertTitle>TXT-post (verifiering)</AlertTitle>
          <AlertDescription>
            <p className="mb-2 text-sm">Skapa en TXT-post för att verifiera domänägandet:</p>
            <div className="flex items-center gap-2 rounded-md bg-muted p-3 font-mono text-sm">
              <div className="flex-1 min-w-0">
                <p><span className="text-muted-foreground">Namn:</span> _getgrant-verify.{domain}</p>
                <p className="break-all"><span className="text-muted-foreground">Värde:</span> {token}</p>
                <p><span className="text-muted-foreground">Typ:</span> TXT</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(token)}
                data-testid="button-copy-txt"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default function PartnerDomain() {
  const { toast } = useToast();
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const { data: profile, isLoading } = useQuery<PartnerProfile>({
    queryKey: ["/api/partner/profile"],
  });

  const domainForm = useForm<{ customDomain: string }>({
    defaultValues: { customDomain: "" },
  });

  const isProfessionalPlus = profile?.plan === "professional" || profile?.plan === "enterprise";

  const setDomainMutation = useMutation({
    mutationFn: async (values: { customDomain: string }) => {
      await apiRequest("POST", "/api/partner/domain", values);
    },
    onSuccess: () => {
      toast({ title: "Domän sparad", description: "Konfigurera DNS-posterna nedan för att slutföra." });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/profile"] });
      domainForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/partner/domain/verify");
    },
    onSuccess: () => {
      toast({ title: "Domän verifierad", description: "Din anpassade domän är nu aktiv." });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/profile"] });
    },
    onError: (error: Error) => {
      toast({ title: "Verifiering misslyckades", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/partner/domain");
    },
    onSuccess: () => {
      toast({ title: "Domän borttagen", description: "Din anpassade domän har tagits bort." });
      setShowRemoveConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/partner/profile"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <>
      <SEO title="Domän - Partner" description="Hantera din anpassade domän" noindex={true} />
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-domain-title">Domän</h1>
          <p className="text-muted-foreground" data-testid="text-domain-subtitle">
            Hantera din subdomän och anpassade domän.
          </p>
        </div>

        <Card data-testid="card-subdomain">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Subdomän
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="rounded-md bg-muted px-4 py-2 font-mono text-sm" data-testid="text-subdomain">
                {profile?.subdomain || "partner"}.getgrant.ai
              </div>
              <Badge variant="default" data-testid="badge-subdomain-active">Aktiv</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Din standardsubdomän är alltid tillgänglig.
            </p>
          </CardContent>
        </Card>

        {!isProfessionalPlus ? (
          <Card data-testid="card-upgrade-prompt">
            <CardContent className="p-6">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900 shrink-0">
                  <ArrowUpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Uppgradera för anpassad domän</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Anpassade domäner är tillgängliga från Professional-planen och uppåt.
                    Uppgradera din plan för att använda din egen domän.
                  </p>
                  <Button variant="default" className="mt-3" data-testid="button-upgrade-plan">
                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                    Uppgradera plan
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {profile?.customDomain ? (
              <Card data-testid="card-custom-domain">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Anpassad domän
                    </CardTitle>
                    {profile.domainVerified ? (
                      <Badge variant="default" className="gap-1" data-testid="badge-domain-verified">
                        <CheckCircle2 className="h-3 w-3" />
                        Verifierad
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1" data-testid="badge-domain-pending">
                        <Clock className="h-3 w-3" />
                        Väntar på verifiering
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md bg-muted px-4 py-2 font-mono text-sm" data-testid="text-custom-domain">
                    {profile.customDomain}
                  </div>

                  {!profile.domainVerified && (
                    <>
                      <DnsInstructions
                        domain={profile.customDomain}
                        token={profile.domainVerificationToken}
                      />
                      <div className="flex gap-3 flex-wrap">
                        <Button
                          onClick={() => verifyMutation.mutate()}
                          disabled={verifyMutation.isPending}
                          data-testid="button-verify-domain"
                        >
                          {verifyMutation.isPending ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              Verifierar...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Verifiera domän
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}

                  <div className="pt-2 border-t">
                    {showRemoveConfirm ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-sm text-muted-foreground">Är du säker?</p>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeMutation.mutate()}
                          disabled={removeMutation.isPending}
                          data-testid="button-confirm-remove-domain"
                        >
                          {removeMutation.isPending ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Ta bort
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowRemoveConfirm(false)}
                          data-testid="button-cancel-remove-domain"
                        >
                          Avbryt
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setShowRemoveConfirm(true)}
                        data-testid="button-remove-domain"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Ta bort anpassad domän
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card data-testid="card-add-domain">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Lägg till anpassad domän
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={domainForm.handleSubmit((values) => setDomainMutation.mutate(values))}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="customDomain">Domännamn</Label>
                      <Input
                        id="customDomain"
                        {...domainForm.register("customDomain")}
                        placeholder="portal.mittforetag.se"
                        data-testid="input-custom-domain"
                      />
                      <p className="text-xs text-muted-foreground">
                        Ange den domän du vill använda för din partnerportal.
                      </p>
                    </div>
                    <Button
                      type="submit"
                      disabled={setDomainMutation.isPending}
                      data-testid="button-save-domain"
                    >
                      {setDomainMutation.isPending ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Sparar...
                        </>
                      ) : (
                        <>
                          <Globe className="mr-2 h-4 w-4" />
                          Lägg till domän
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}