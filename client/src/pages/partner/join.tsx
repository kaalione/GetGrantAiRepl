import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, CheckCircle, AlertTriangle, AlertCircle, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { SEO } from '@/components/seo';

interface InviteResponse {
  valid: boolean;
  expired?: boolean;
  partnerName?: string;
  clientEmail?: string;
  platformName?: string;
  logoUrl?: string;
  primaryColor?: string;
}

interface AcceptInviteResponse {
  message: string;
  client: { id: string };
}

export default function PartnerJoin() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [formError, setFormError] = useState("");

  const { data: invite, isLoading, error: inviteError } = useQuery<InviteResponse>({
    queryKey: [`/api/whitelabel/invite/${token}`],
    enabled: !!token,
  });

  const acceptMutation = useMutation({
    mutationFn: async (data: { name: string; companyName?: string }) => {
      const res = await apiRequest("POST", `/api/whitelabel/accept-invite/${token}`, data);
      return res.json() as Promise<AcceptInviteResponse>;
    },
    onError: (error: Error) => {
      setFormError(error.message || "Ett fel inträffade. Försök igen.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!name.trim()) {
      setFormError("Namn är obligatoriskt");
      return;
    }

    acceptMutation.mutate({
      name: name.trim(),
      companyName: companyName.trim() || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (inviteError || !invite?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <CardTitle>Inbjudan är ogiltig</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Denna inbjudan kunde inte hittas eller är inte längre gyldig.
            </p>
            <p className="text-sm text-muted-foreground">
              Kontakta din partner för en ny inbjudan.
            </p>
            <Button variant="outline" onClick={() => window.history.back()} data-testid="button-back">
              Tillbaka
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-yellow-600 dark:text-yellow-500 mb-4" />
            <CardTitle>Inbjudan har gått ut</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Denna inbjudan har gått ut och kan inte längre användas.
            </p>
            {invite.platformName && (
              <p className="text-sm text-muted-foreground">
                Kontakta <strong>{invite.platformName}</strong> för att få en ny inbjudan.
              </p>
            )}
            <Button variant="outline" onClick={() => window.history.back()} data-testid="button-back-expired">
              Tillbaka
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (acceptMutation.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-600 dark:text-green-500 mb-4" />
            <CardTitle>Välkommen!</CardTitle>
            <CardDescription>Din inbjudan har accepterats</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Du är nu registrerad hos {invite.platformName || invite.partnerName}. Logga in för att komma igång.
            </p>
            <Button
              onClick={() => (window.location.href = "/api/login")}
              data-testid="button-login"
              className="w-full"
            >
              Logga in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <SEO title={`Gå med – ${invite.platformName || invite.partnerName || 'Partner'}`} noindex={true} />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {invite.logoUrl ? (
            <img
              src={invite.logoUrl}
              alt={invite.platformName || invite.partnerName || ""}
              className="h-10 w-auto mx-auto mb-3 object-contain"
              data-testid="img-partner-logo"
            />
          ) : invite.platformName ? (
            <div
              className="text-lg font-bold mb-2"
              style={{ color: invite.primaryColor || undefined }}
              data-testid="text-platform-name"
            >
              {invite.platformName}
            </div>
          ) : null}
          <CardTitle>Acceptera inbjudan</CardTitle>
          <CardDescription>
            Fyll i dina uppgifter för att komma igång
            {invite.partnerName && (
              <span> med <strong>{invite.partnerName}</strong></span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" data-testid="label-email">
                E-post
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={invite.clientEmail || ""}
                  readOnly
                  className="pl-9 bg-muted cursor-not-allowed"
                  data-testid="input-email"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                E-postadressen är kopplad till din inbjudan
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" data-testid="label-name">
                Namn *
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Ditt fullständiga namn"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={acceptMutation.isPending}
                data-testid="input-name"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName" data-testid="label-company-name">
                Företagsnamn
              </Label>
              <Input
                id="companyName"
                type="text"
                placeholder="Ditt företagsnamn (valfritt)"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={acceptMutation.isPending}
                data-testid="input-company-name"
              />
            </div>

            {formError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span data-testid="text-form-error">{formError}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={acceptMutation.isPending || !name.trim()}
              className="w-full"
              data-testid="button-submit"
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Accepterar...
                </>
              ) : (
                "Acceptera och fortsätt"
              )}
            </Button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => (window.location.href = "/api/login")}
                className="text-sm text-primary hover:underline"
                data-testid="link-already-account"
              >
                Har du redan ett konto? Logga in
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
