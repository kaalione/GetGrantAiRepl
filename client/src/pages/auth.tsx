import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { SiGoogle, SiGithub } from "react-icons/si";
import { supabase, establishServerSession } from "@/lib/supabase";
import { SEO } from "@/components/seo";

function getReturnUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get("returnUrl");
  // Only allow same-origin relative paths.
  if (returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
    return returnUrl;
  }
  return "/";
}

export default function AuthPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Alert className="max-w-md">
          <AlertDescription>
            {t("auth.notConfigured", "Inloggning är inte konfigurerad. Sätt VITE_SUPABASE_URL och VITE_SUPABASE_PUBLISHABLE_KEY.")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const sb = supabase;

  const oauthSignIn = async (provider: "google" | "github") => {
    setError(null);
    setBusy(provider);
    const returnUrl = getReturnUrl();
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`,
      },
    });
    if (error) {
      setError(error.message);
      setBusy(null);
    }
    // On success the browser navigates away to the provider.
  };

  const finishLogin = async (accessToken: string) => {
    await establishServerSession(accessToken);
    window.location.href = getReturnUrl();
  };

  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("password");
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await finishLogin(data.session.access_token);
    } catch (err: any) {
      setError(err.message || String(err));
      setBusy(null);
    }
  };

  const signUpWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy("signup");
    try {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      if (data.session) {
        // Email confirmation disabled in Supabase — signed in directly.
        await finishLogin(data.session.access_token);
      } else {
        setInfo(t("auth.confirmEmailSent", "Kolla din inkorg — vi har skickat en bekräftelselänk."));
        setBusy(null);
      }
    } catch (err: any) {
      setError(err.message || String(err));
      setBusy(null);
    }
  };

  // A provider that is not enabled in Supabase fails on click, so ask which
  // ones are on rather than hardcoding the list. Enabling one in the Supabase
  // dashboard makes its button appear here with no code change.
  const [providers, setProviders] = useState<{ google: boolean; github: boolean }>({
    google: false,
    github: false,
  });

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
    if (!url || !key) return;

    let cancelled = false;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.external) return;
        setProviders({
          google: Boolean(data.external.google),
          github: Boolean(data.external.github),
        });
      })
      // Leaving both off on failure hides the buttons, which is the safe way
      // to be wrong: email sign-in still works.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const anyOauth = providers.google || providers.github;

  const oauthButtons = !anyOauth ? null : (
    <div className="space-y-2">
      {providers.google && (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={!!busy}
        onClick={() => oauthSignIn("google")}
        data-testid="button-login-google"
      >
        {busy === "google" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SiGoogle className="mr-2 h-4 w-4" />}
        {t("auth.continueWithGoogle", "Fortsätt med Google")}
      </Button>
      )}
      {providers.github && (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={!!busy}
        onClick={() => oauthSignIn("github")}
        data-testid="button-login-github"
      >
        {busy === "github" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SiGithub className="mr-2 h-4 w-4" />}
        {t("auth.continueWithGithub", "Fortsätt med GitHub")}
      </Button>
      )}
    </div>
  );

  const divider = !anyOauth ? null : (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-2 text-muted-foreground">
          {t("auth.orWithEmail", "eller med e-post")}
        </span>
      </div>
    </div>
  );

  const emailFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth.email", "E-post")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="input-email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.password", "Lösenord")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="input-password"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SEO title={t("auth.title", "Logga in")} />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">GetGrant.ai</CardTitle>
          <CardDescription>
            {t("auth.subtitle", "Logga in eller skapa ett konto för att hitta bidrag som matchar ditt företag")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">{t("auth.logIn", "Logga in")}</TabsTrigger>
              <TabsTrigger value="signup" data-testid="tab-signup">{t("auth.signUp", "Skapa konto")}</TabsTrigger>
            </TabsList>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription data-testid="text-auth-error">{error}</AlertDescription>
              </Alert>
            )}
            {info && (
              <Alert className="mt-4">
                <AlertDescription data-testid="text-auth-info">{info}</AlertDescription>
              </Alert>
            )}

            <TabsContent value="login" className="mt-4">
              {oauthButtons}
              {divider}
              <form onSubmit={signInWithPassword} className="space-y-4">
                {emailFields}
                <Button type="submit" className="w-full" disabled={!!busy} data-testid="button-login-email">
                  {busy === "password" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("auth.logIn", "Logga in")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              {oauthButtons}
              {divider}
              <form onSubmit={signUpWithPassword} className="space-y-4">
                {emailFields}
                <Button type="submit" className="w-full" disabled={!!busy} data-testid="button-signup-email">
                  {busy === "signup" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("auth.signUp", "Skapa konto")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
