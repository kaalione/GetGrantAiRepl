import { useState, useEffect } from "react";
import { LayoutDashboard, FileText, Building2, FolderOpen, Settings, Database, Sparkles, ScrollText, Crown, Bell, Radar, Trophy, CalendarDays, Library, FolderKanban, DollarSign, Users, Palette, Globe, BarChart3, ChevronDown, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useTranslation } from 'react-i18next';
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { MarketSelector } from "@/components/market-selector";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

function usePersistedCollapsible(key: string, defaultOpen: boolean, autoExpandPath: string, location: string) {
  const routeMatches = location.startsWith(autoExpandPath);

  const [isOpen, setIsOpen] = useState(() => {
    if (routeMatches) return true;
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored === "true";
    return defaultOpen;
  });

  useEffect(() => {
    if (routeMatches && !isOpen) {
      setIsOpen(true);
    }
  }, [routeMatches]);

  const handleChange = (open: boolean) => {
    setIsOpen(open);
    localStorage.setItem(key, String(open));
  };

  return [isOpen, handleChange] as const;
}

export function AppSidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();

  const partnerQuery = useQuery<{ id: number; name: string; plan: string }>({
    queryKey: ['/api/partner/profile'],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const isPartner = !!partnerQuery.data && !partnerQuery.isError;

  const calendarQuery = useQuery<{ events: any[]; summary: { urgent: number } }>({
    queryKey: ['/api/calendar/events?sources=all'],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const urgentCount = calendarQuery.data?.summary?.urgent || 0;

  const projectDashQuery = useQuery<{ urgent: any[] }>({
    queryKey: ['/api/projects/dashboard'],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const projectUrgentCount = projectDashQuery.data?.urgent?.length || 0;

  const contentBlocksQuery = useQuery<any[]>({
    queryKey: ['/api/content-library'],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const contentBlockCount = contentBlocksQuery.data?.length || 0;

  const [adminOpen, setAdminOpen] = usePersistedCollapsible("sidebar_admin_open", false, "/admin", location);
  const [partnerOpen, setPartnerOpen] = usePersistedCollapsible("sidebar_partner_open", true, "/partner", location);

  const mainNavItems = [
    {
      title: t('nav.dashboard'),
      url: "/",
      icon: LayoutDashboard,
    },
    {
      title: t('nav.grants'),
      url: "/bidrag",
      icon: FileText,
    },
    {
      title: t('nav.calendar'),
      url: "/kalender",
      icon: CalendarDays,
      badge: urgentCount > 0 ? urgentCount : undefined,
    },
    {
      title: t('nav.applications'),
      url: "/ansokan",
      icon: FolderOpen,
    },
    {
      title: t('nav.projects', 'Projekt'),
      url: "/projekt",
      icon: FolderKanban,
      badge: projectUrgentCount > 0 ? projectUrgentCount : undefined,
    },
    {
      title: t('nav.contentLibrary', 'Innehållsbibliotek'),
      url: "/bibliotek",
      icon: Library,
      badge: contentBlockCount > 0 ? contentBlockCount : undefined,
    },
    {
      title: t('nav.companyProfile'),
      url: "/company",
      icon: Building2,
    },
    {
      title: t('nav.alerts'),
      url: "/alerts",
      icon: Radar,
    },
    {
      title: t('nav.success'),
      url: "/success",
      icon: Trophy,
    },
    {
      title: t('nav.prices'),
      url: "/priser",
      icon: Crown,
    },
    {
      title: t('nav.notificationSettings'),
      url: "/settings",
      icon: Bell,
    },
  ];

  const partnerNavItems = [
    {
      title: "Dashboard",
      url: "/partner/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Kunder",
      url: "/partner/clients",
      icon: Users,
    },
    {
      title: "Varumärke",
      url: "/partner/branding",
      icon: Palette,
    },
    {
      title: "Domän",
      url: "/partner/domain",
      icon: Globe,
    },
    {
      title: "Analys",
      url: "/partner/analytics",
      icon: BarChart3,
    },
    {
      title: "Inställningar",
      url: "/partner/settings",
      icon: Settings,
    },
  ];

  const adminNavItems = [
    {
      title: t('nav.users', 'Användare'),
      url: "/admin/users",
      icon: Users,
    },
    {
      title: t('nav.scraperSources'),
      url: "/admin/sources",
      icon: Database,
    },
    {
      title: t('nav.scraperLogs'),
      url: "/admin/logs",
      icon: ScrollText,
    },
    {
      title: t('nav.settings'),
      url: "/admin/settings",
      icon: Settings,
    },
    {
      title: t('nav.successFeeAdmin', 'Framgångsavgift'),
      url: "/admin/success-fee",
      icon: DollarSign,
    },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight">getgrant.ai</span>
            <span className="text-xs text-muted-foreground">{t('nav.tagline')}</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.navigation')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url || (item.url !== "/" && location.startsWith(item.url))}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{item.title}</span>
                      {'badge' in item && item.badge && (
                        <Badge variant="destructive" className="text-xs" data-testid="badge-urgent-deadlines">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isPartner && (
          <SidebarGroup>
            <Separator className="mb-2" />
            <Collapsible open={partnerOpen} onOpenChange={setPartnerOpen}>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer flex items-center justify-between gap-2 w-full" data-testid="sidebar-partner-toggle">
                  <span>Partner Portal</span>
                  {partnerOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {partnerNavItems.map((item) => (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === item.url || (item.url !== "/partner/dashboard" && location.startsWith(item.url))}
                        >
                          <Link href={item.url} data-testid={`nav-partner-${item.title.toLowerCase()}`}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <Separator className="mb-2" />
          <Collapsible open={adminOpen} onOpenChange={setAdminOpen}>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer flex items-center justify-between gap-2 w-full" data-testid="sidebar-admin-toggle">
                <span>{t('nav.administration')}</span>
                {adminOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminNavItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url || location.startsWith(item.url)}
                      >
                        <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Version 1.0.0
          </div>
          <MarketSelector />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
