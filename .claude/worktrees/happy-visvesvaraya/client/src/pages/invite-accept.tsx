import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Users, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { SEO } from '@/components/seo';

interface InviteInfo {
  email: string;
  role: string;
  status: string;
  grantTitle: string;
  expiresAt: string;
}

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [accepting, setAccepting] = useState(false);

  const { data: invite, isLoading, error } = useQuery<InviteInfo>({
    queryKey: ['/api/invites', token],
    queryFn: async () => {
      const res = await fetch(`/api/invites/${token}`, { credentials: 'include' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      return res.json();
    },
    enabled: !!token,
  });

  const handleAccept = async () => {
    if (!user) {
      window.location.href = `/api/login?returnUrl=/invites/${token}`;
      return;
    }

    setAccepting(true);
    try {
      const res = await fetch(`/api/invites/${token}/accept`, {
        credentials: 'include',
        redirect: 'follow',
      });
      if (res.redirected) {
        window.location.href = res.url;
      } else {
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        navigate('/dashboard');
      }
    } catch (err) {
      setAccepting(false);
    }
  };

  useEffect(() => {
    if (user && invite?.status === 'pending') {
      handleAccept();
    }
  }, [user, invite?.status]);

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="text-lg font-medium mb-2">Inbjudan hittades inte</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Denna inbjudan kan ha gått ut eller redan accepterats.
            </p>
            <Button onClick={() => navigate('/dashboard')} data-testid="button-go-dashboard">
              Gå till dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite?.status === 'accepted') {
    return (
      <div className="max-w-md mx-auto mt-20">
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Inbjudan redan accepterad</h3>
            <p className="text-sm text-muted-foreground mb-4">Du har redan accepterat denna inbjudan.</p>
            <Button onClick={() => navigate('/dashboard')} data-testid="button-go-dashboard-accepted">
              Gå till dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ROLE_DESCRIPTIONS: Record<string, string> = {
    editor: 'redigera alla sektioner och lämna kommentarer',
    commenter: 'lämna kommentarer men inte redigera',
    viewer: 'se ansökan men inte göra ändringar',
  };

  return (
    <div className="max-w-md mx-auto mt-20">
      <SEO title="Acceptera inbjudan" noindex={true} />
      <Card>
        <CardHeader className="text-center">
          <Users className="h-12 w-12 mx-auto text-primary mb-2" />
          <CardTitle>Du har bjudits in att samarbeta</CardTitle>
          <CardDescription>
            {invite?.grantTitle && (
              <span className="block mt-1 font-medium text-foreground">{invite.grantTitle}</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Du kan {ROLE_DESCRIPTIONS[invite?.role || 'viewer']}.
          </p>
          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={accepting}
            data-testid="button-accept-invite"
          >
            {accepting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            {user ? 'Acceptera inbjudan' : 'Logga in och acceptera'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
