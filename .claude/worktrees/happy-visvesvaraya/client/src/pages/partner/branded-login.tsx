import { useWhitelabel } from "@/components/whitelabel-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WhitelabelFooter } from "@/components/powered-by-footer";
import { LogIn, UserPlus } from "lucide-react";
import { SEO } from '@/components/seo';

export default function BrandedLogin() {
  const { branding, config } = useWhitelabel();

  const allowSelfSignup = config?.features?.allowSelfSignup ?? false;

  return (
    <div className="min-h-screen flex flex-col">
      <SEO title={`Logga in – ${branding?.platformName || 'Partner'}`} noindex={true} />
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md" data-testid="card-branded-login">
          <CardHeader className="text-center space-y-4 pb-2">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.platformName}
                className="h-12 w-auto mx-auto object-contain"
                data-testid="img-branded-logo"
              />
            ) : (
              <div
                className="text-2xl font-bold"
                style={{ color: branding.primaryColor }}
                data-testid="text-branded-name"
              >
                {branding.platformName}
              </div>
            )}
            {branding.tagline && (
              <p className="text-muted-foreground text-sm" data-testid="text-branded-tagline">
                {branding.tagline}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <Button
              className="w-full"
              size="lg"
              style={{ backgroundColor: branding.primaryColor, color: branding.primaryTextColor }}
              onClick={() => (window.location.href = "/api/login")}
              data-testid="button-branded-login"
            >
              <LogIn className="mr-2 h-5 w-5" />
              Logga in
            </Button>

            {allowSelfSignup && (
              <Button
                variant="outline"
                className="w-full"
                size="lg"
                onClick={() => (window.location.href = "/api/login")}
                data-testid="button-branded-signup"
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Skapa konto
              </Button>
            )}

            <p className="text-center text-xs text-muted-foreground pt-2">
              {branding.supportEmail && (
                <>
                  Behöver du hjälp? Kontakta{" "}
                  <a
                    href={`mailto:${branding.supportEmail}`}
                    className="text-primary hover:underline"
                    data-testid="link-branded-support"
                  >
                    {branding.supportEmail}
                  </a>
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>
      <WhitelabelFooter />
    </div>
  );
}
