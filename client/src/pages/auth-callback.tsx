import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabase, establishServerSession } from "@/lib/supabase";

// Landing page for OAuth redirects and email confirmation links. Supabase JS
// picks the session out of the URL; we then exchange it for a server session.
export default function AuthCallbackPage() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!supabase) {
        setError("Supabase is not configured");
        return;
      }
      // Give supabase-js a moment to process the URL fragment / PKCE code.
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          try {
            await establishServerSession(data.session.access_token);
            const params = new URLSearchParams(window.location.search);
            const returnUrl = params.get("returnUrl");
            window.location.href =
              returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")
                ? returnUrl
                : "/";
          } catch (err: any) {
            setError(err.message || String(err));
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      setError(t("auth.callbackFailed", "Kunde inte slutföra inloggningen. Försök igen."));
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {error ? (
        <div className="max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertDescription data-testid="text-callback-error">{error}</AlertDescription>
          </Alert>
          <Button className="w-full" onClick={() => (window.location.href = "/auth")}>
            {t("auth.backToLogin", "Tillbaka till inloggning")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-callback-loading">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("auth.signingIn", "Loggar in...")}
        </div>
      )}
    </div>
  );
}
