import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { WhitelabelProvider, useWhitelabel } from "@/components/whitelabel-provider";
import { PoweredByFooter } from "@/components/powered-by-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ErrorBoundary } from "@/components/error-boundary";
import { SEO } from "@/components/seo";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import "@/i18n";
import Landing from "@/pages/landing";
import AuthPage from "@/pages/auth";
import AuthCallbackPage from "@/pages/auth-callback";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Grants from "@/pages/grants";
import GrantDetail from "@/pages/grant-detail";
import GrantApply from "@/pages/grant-apply";
import Company from "@/pages/company";
import Applications from "@/pages/applications";
import ApplicationsList from "@/pages/applications-list";
import AdminUsers from "@/pages/admin/users";
import AdminSources from "@/pages/admin/sources";
import AdminSourceNew from "@/pages/admin/sources/new";
import AdminSourceEdit from "@/pages/admin/sources/edit";
import AdminLogs from "@/pages/admin/logs";
import AdminSettings from "@/pages/admin/settings";
import Pricing from "@/pages/pricing";
import Settings from "@/pages/settings";
import Alerts from "@/pages/alerts";
import SuccessDashboard from "@/pages/success-dashboard";
import CalendarPage from "@/pages/calendar";
import InviteAccept from "@/pages/invite-accept";
import ContentLibraryPage from "@/pages/content-library";
import ProjectsPage from "@/pages/projects";
import ProjectDetailPage from "@/pages/project-detail";
import SuccessFeeTerms from "@/pages/success-fee-terms";
import SuccessFeeAdmin from "@/pages/admin/success-fee-admin";
import PartnerDashboard from "@/pages/partner/dashboard";
import PartnerClients from "@/pages/partner/clients";
import PartnerBranding from "@/pages/partner/branding";
import PartnerDomain from "@/pages/partner/domain";
import PartnerAnalytics from "@/pages/partner/analytics";
import PartnerSettings from "@/pages/partner/settings";
import PartnerJoin from "@/pages/partner/join";
import BrandedLogin from "@/pages/partner/branded-login";

interface UserStatus {
  isNewUser: boolean;
  hasCompany: boolean;
  isAuthenticated: boolean;
  profileCompletion?: number;
  resumeOnboardingSessionId?: string | null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/bidrag" component={Grants} />
      <Route path="/bidrag/:id" component={GrantDetail} />
      <Route path="/bidrag/:id/apply" component={GrantApply} />
      <Route path="/grants" component={Grants} />
      <Route path="/grants/:id" component={GrantDetail} />
      <Route path="/company" component={Company} />
      <Route path="/ansokan" component={ApplicationsList} />
      <Route path="/applications" component={Applications} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/sources" component={AdminSources} />
      <Route path="/admin/sources/new" component={AdminSourceNew} />
      <Route path="/admin/sources/:id/edit" component={AdminSourceEdit} />
      <Route path="/admin/logs" component={AdminLogs} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/priser" component={Pricing} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/settings" component={Settings} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/kalender" component={CalendarPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/success" component={SuccessDashboard} />
      <Route path="/bibliotek" component={ContentLibraryPage} />
      <Route path="/content-library" component={ContentLibraryPage} />
      <Route path="/projekt/:id" component={ProjectDetailPage} />
      <Route path="/projekt" component={ProjectsPage} />
      <Route path="/projects/:id" component={ProjectDetailPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/terms/success-fee" component={SuccessFeeTerms} />
      <Route path="/admin/success-fee" component={SuccessFeeAdmin} />
      <Route path="/partner" component={PartnerDashboard} />
      <Route path="/partner/dashboard" component={PartnerDashboard} />
      <Route path="/partner/clients" component={PartnerClients} />
      <Route path="/partner/branding" component={PartnerBranding} />
      <Route path="/partner/domain" component={PartnerDomain} />
      <Route path="/partner/analytics" component={PartnerAnalytics} />
      <Route path="/partner/settings" component={PartnerSettings} />
      <Route path="/join/:token" component={PartnerJoin} />
      <Route path="/invites/:token" component={InviteAccept} />
      <Route path="/auth/callback" component={AuthCallbackPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const { isWhitelabel } = useWhitelabel();
  
  const { data: userStatus, isLoading: statusLoading } = useQuery<UserStatus>({
    queryKey: ['/api/user/status'],
    retry: false,
    staleTime: 30000,
  });

  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "4rem",
  };

  useEffect(() => {
    if (userStatus) {
      if (userStatus.isAuthenticated && !onboardingComplete) {
        if (userStatus.isNewUser) {
          setShowOnboarding(true);
        } else if (
          userStatus.hasCompany &&
          typeof userStatus.profileCompletion === 'number' &&
          userStatus.profileCompletion < 40 &&
          userStatus.resumeOnboardingSessionId
        ) {
          setShowOnboarding(true);
        } else {
          setShowOnboarding(false);
        }
      } else {
        setShowOnboarding(false);
      }
    }
  }, [userStatus, onboardingComplete]);

  function handleOnboardingComplete() {
    setOnboardingComplete(true);
    setShowOnboarding(false);
    queryClient.invalidateQueries({ queryKey: ['/api/user/status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
    queryClient.invalidateQueries({ queryKey: ['/api/user/onboarding-progress'] });
    queryClient.invalidateQueries({ queryKey: ['/api/user/profile-completion'] });
  }

  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!userStatus?.isAuthenticated) {
    if (window.location.pathname.startsWith('/auth/callback')) {
      return <AuthCallbackPage />;
    }
    if (window.location.pathname.startsWith('/auth')) {
      return <AuthPage />;
    }
    if (window.location.pathname.startsWith('/join/')) {
      return <PartnerJoin />;
    }
    if (window.location.pathname.startsWith('/invites/')) {
      return <InviteAccept />;
    }
    if (window.location.pathname.startsWith('/terms/')) {
      return <SuccessFeeTerms />;
    }
    if (isWhitelabel) {
      return <BrandedLogin />;
    }
    return <Landing />;
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex h-14 items-center justify-between gap-4 border-b px-4 shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-3 sm:p-6">
            <div className="mx-auto max-w-7xl">
              <Router />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" storageKey="bidrag-ai-theme">
          <WhitelabelProvider>
            <TooltipProvider>
              <ErrorBoundary>
                <SEO />
                <AppContent />
                <PoweredByFooter />
              </ErrorBoundary>
              <Toaster />
            </TooltipProvider>
          </WhitelabelProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
