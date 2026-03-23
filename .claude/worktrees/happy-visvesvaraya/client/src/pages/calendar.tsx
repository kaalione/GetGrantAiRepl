import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  CalendarDays, List, ChevronLeft, ChevronRight, AlertTriangle, Clock,
  Calendar as CalendarIcon, Star, ExternalLink, Banknote, Sparkles, Download, Bell,
  Target, FileText as FileTextIcon, Briefcase, Flag
} from "lucide-react";
import type { GrantProject } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarLegend } from "@/components/calendar/CalendarLegend";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek
} from "date-fns";
import { sv, enUS } from "date-fns/locale";
import { SEO } from '@/components/seo';

type EventType = "deadline" | "milestone";

interface CalendarEvent {
  id: string;
  title: string;
  deadline: string;
  daysUntil: number;
  urgency: "urgent" | "medium" | "upcoming";
  source: string;
  amount: string | null;
  matchScore: number;
  isBookmarked: boolean;
  url: string;
  eventType: EventType;
}

interface CalendarData {
  events: CalendarEvent[];
  summary: { urgent: number; thisMonth: number; nextMonth: number };
}

function getEventTypeStyles(event: CalendarEvent) {
  const isUrgent = event.daysUntil <= 3;

  if (isUrgent) {
    return {
      chip: "bg-red-100 dark:bg-red-950 border border-red-500 text-red-800 dark:text-red-200",
      border: "border-l-4 border-l-red-500",
      dot: "bg-red-500",
      text: "text-red-800 dark:text-red-200",
    };
  }

  if (event.eventType === "milestone") {
    return {
      chip: "bg-violet-100 dark:bg-violet-950 border border-violet-500 text-violet-800 dark:text-violet-200",
      border: "border-l-4 border-l-violet-500",
      dot: "bg-violet-500",
      text: "text-violet-800 dark:text-violet-200",
    };
  }

  return {
    chip: "bg-blue-100 dark:bg-blue-950 border border-blue-500 text-blue-800 dark:text-blue-200",
    border: "border-l-4 border-l-blue-500",
    dot: "bg-blue-500",
    text: "text-blue-800 dark:text-blue-200",
  };
}

function getUrgencyStyles(urgency: string) {
  switch (urgency) {
    case "urgent":
      return { dot: "bg-destructive", badge: "bg-destructive/10 text-destructive", text: "text-destructive" };
    case "medium":
      return { dot: "bg-primary", badge: "bg-primary/10 text-primary", text: "text-primary" };
    default:
      return { dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground", text: "text-muted-foreground" };
  }
}

function generateGoogleCalendarUrl(event: CalendarEvent) {
  const deadline = new Date(event.deadline);
  const startStr = format(deadline, "yyyyMMdd");
  const endDate = new Date(deadline);
  endDate.setDate(endDate.getDate() + 1);
  const endStr = format(endDate, "yyyyMMdd");
  const isProject = event.eventType === "milestone";
  const title = encodeURIComponent(isProject ? `Projekt: ${event.title}` : `Deadline: ${event.title}`);
  const details = encodeURIComponent(isProject
    ? `Projekt: ${event.source}`
    : `Grant from ${event.source}\nApply at: https://getgrant.ai/bidrag/${event.id}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}`;
}

function generateIcsContent(event: CalendarEvent) {
  const deadline = new Date(event.deadline);
  const startStr = format(deadline, "yyyyMMdd'T'HHmmss'Z'");
  const endDate = new Date(deadline);
  endDate.setHours(endDate.getHours() + 1);
  const endStr = format(endDate, "yyyyMMdd'T'HHmmss'Z'");
  const isProject = event.eventType === "milestone";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GetGrant.ai//Deadline Calendar//EN",
    "BEGIN:VEVENT",
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${isProject ? "Projekt" : "Deadline"}: ${event.title}`,
    `DESCRIPTION:${isProject ? event.source : `Grant from ${event.source}. Apply at https://getgrant.ai/bidrag/${event.id}`}`,
    ...(isProject ? [] : [`URL:https://getgrant.ai/bidrag/${event.id}`]),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(event: CalendarEvent) {
  const content = generateIcsContent(event);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deadline-${event.id.slice(0, 8)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "sv" ? sv : enUS;
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [sourceFilter, setSourceFilter] = useState<"all" | "bookmarks" | "matches">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "deadlines" | "milestones">("all");

  const { data, isLoading } = useQuery<CalendarData>({
    queryKey: [`/api/calendar/events?sources=${sourceFilter}`],
    staleTime: 5 * 60 * 1000,
  });

  const { data: projects } = useQuery<GrantProject[]>({
    queryKey: ["/api/projects"],
  });

  const projectEvents = useMemo(() => {
    if (!projects) return [];
    const items: CalendarEvent[] = [];
    for (const p of projects) {
      if (p.status !== "active") continue;
      if (p.endDate) {
        const daysUntil = Math.ceil((new Date(p.endDate).getTime() - Date.now()) / 86400000);
        items.push({
          id: `proj-${p.id}`,
          title: `${p.title}`,
          deadline: p.endDate,
          daysUntil,
          urgency: daysUntil <= 7 ? "urgent" : daysUntil <= 30 ? "medium" : "upcoming",
          source: `Projekt: ${p.funder || ""}`,
          amount: p.approvedAmountSek ? String(p.approvedAmountSek) : null,
          matchScore: 0,
          isBookmarked: false,
          url: `/projekt/${p.id}`,
          eventType: "milestone",
        });
      }
    }
    return items;
  }, [projects]);

  const rawEvents: CalendarEvent[] = useMemo(() => {
    const grantEvents = (data?.events || []).map((e: any) => ({
      ...e,
      eventType: e.eventType || "deadline" as EventType,
    }));
    return [...grantEvents, ...projectEvents];
  }, [data?.events, projectEvents]);

  const events = useMemo(() => {
    if (typeFilter === "all") return rawEvents;
    if (typeFilter === "deadlines") return rawEvents.filter((e) => e.eventType === "deadline");
    return rawEvents.filter((e) => e.eventType === "milestone");
  }, [rawEvents, typeFilter]);

  const summary = data?.summary || { urgent: 0, thisMonth: 0, nextMonth: 0 };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(new Date(e.deadline), day));

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, i + 1);
    return format(d, "EEE", { locale });
  });

  const urgentEvents = events.filter((e) => e.urgency === "urgent");
  const mediumEvents = events.filter((e) => e.urgency === "medium");
  const upcomingEvents = events.filter((e) => e.urgency === "upcoming");

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <SEO title={t("calendar.title")} noindex={true} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-calendar-title">
            {t("calendar.title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("calendar.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md border overflow-visible">
            <Button
              variant={sourceFilter === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSourceFilter("all")}
              className="rounded-none rounded-l-md"
              data-testid="button-filter-all"
            >
              {t("calendar.filterAll")}
            </Button>
            <Button
              variant={sourceFilter === "bookmarks" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSourceFilter("bookmarks")}
              className="rounded-none"
              data-testid="button-filter-bookmarks"
            >
              <Star className="h-3 w-3 mr-1" />
              {t("calendar.filterBookmarks")}
            </Button>
            <Button
              variant={sourceFilter === "matches" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSourceFilter("matches")}
              className="rounded-none rounded-r-md"
              data-testid="button-filter-matches"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {t("calendar.filterMatches")}
            </Button>
          </div>
          <div className="flex rounded-md border overflow-visible">
            <Button
              variant={typeFilter === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTypeFilter("all")}
              className="rounded-none rounded-l-md"
              data-testid="button-type-all"
            >
              {t("calendar.typeAll")}
            </Button>
            <Button
              variant={typeFilter === "deadlines" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTypeFilter("deadlines")}
              className="rounded-none"
              data-testid="button-type-deadlines"
            >
              <CalendarIcon className="h-3 w-3 mr-1" />
              {t("calendar.typeDeadlines")}
            </Button>
            <Button
              variant={typeFilter === "milestones" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTypeFilter("milestones")}
              className="rounded-none rounded-r-md"
              data-testid="button-type-milestones"
            >
              <Flag className="h-3 w-3 mr-1" />
              {t("calendar.typeMilestones")}
            </Button>
          </div>
          <div className="flex rounded-md border overflow-visible">
            <Button
              variant={viewMode === "calendar" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("calendar")}
              className="rounded-none rounded-l-md"
              data-testid="button-view-calendar"
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
              className="rounded-none rounded-r-md"
              data-testid="button-view-list"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-3">
        <Card data-testid="stat-urgent">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.urgent}</p>
              <p className="text-xs text-muted-foreground">{t("calendar.urgentDeadlines")}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-this-month">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.thisMonth}</p>
              <p className="text-xs text-muted-foreground">{t("calendar.thisMonth")}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-next-month">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
              <CalendarIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.nextMonth}</p>
              <p className="text-xs text-muted-foreground">{t("calendar.nextMonth")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <CalendarLegend />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : viewMode === "calendar" ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                data-testid="button-prev-month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-lg" data-testid="text-current-month">
                {format(currentMonth, "MMMM yyyy", { locale })}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                data-testid="button-next-month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-2 md:p-4">
            <div className="grid grid-cols-7 gap-px">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
              {calendarDays.map((day) => {
                const dayEvents = getEventsForDay(day);
                const inMonth = isSameMonth(day, currentMonth);
                const today = isToday(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[4.5rem] p-1 border border-border/50 rounded-md ${
                      !inMonth ? "opacity-30" : ""
                    } ${today ? "bg-primary/5 border-primary/30" : ""}`}
                    data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
                  >
                    <div className={`text-xs font-medium mb-0.5 ${today ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 2).map((event) => {
                        const typeStyles = getEventTypeStyles(event);
                        const eventHref = event.url || `/bidrag/${event.id}`;
                        return (
                          <Tooltip key={event.id}>
                            <TooltipTrigger asChild>
                              <Link href={eventHref}>
                                <div
                                  className={`text-xs truncate rounded px-1 py-0.5 cursor-pointer ${typeStyles.chip}`}
                                  data-testid={`calendar-event-${event.id}`}
                                >
                                  {event.isBookmarked && <Star className="h-2.5 w-2.5 inline mr-0.5 fill-current" />}
                                  {event.title.length > 20 ? event.title.substring(0, 20) + "..." : event.title}
                                </div>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">{event.title}</p>
                              <p className="text-xs">{event.source}</p>
                              <p className="text-xs">{t("calendar.daysLeft", { count: event.daysUntil })}</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{dayEvents.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-6" data-testid="deadline-list">
        {urgentEvents.length > 0 && (
          <DeadlineSection
            title={t("calendar.urgentTitle")}
            icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
            events={urgentEvents}
            urgency="urgent"
          />
        )}
        {mediumEvents.length > 0 && (
          <DeadlineSection
            title={t("calendar.thisMonthTitle")}
            icon={<Clock className="h-5 w-5 text-primary" />}
            events={mediumEvents}
            urgency="medium"
          />
        )}
        {upcomingEvents.length > 0 && (
          <DeadlineSection
            title={t("calendar.upcomingTitle")}
            icon={<CalendarIcon className="h-5 w-5 text-muted-foreground" />}
            events={upcomingEvents}
            urgency="upcoming"
          />
        )}
        {events.length === 0 && !isLoading && (
          <Card>
            <CardContent className="p-8 text-center">
              <CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{t("calendar.noEvents")}</h3>
              <p className="text-muted-foreground text-sm mb-4">{t("calendar.noEventsDesc")}</p>
              <Button variant="default" asChild>
                <Link href="/bidrag" data-testid="link-browse-grants">{t("calendar.browseGrants")}</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings" data-testid="link-notification-settings">
            <Bell className="h-4 w-4 mr-2" />
            {t("calendar.notificationSettings")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function DeadlineSection({
  title,
  icon,
  events,
  urgency,
}: {
  title: string;
  icon: React.ReactNode;
  events: CalendarEvent[];
  urgency: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "sv" ? sv : enUS;
  const styles = getUrgencyStyles(urgency);

  return (
    <div data-testid={`deadline-section-${urgency}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="font-semibold">{title}</h2>
        <Badge variant="secondary" className={styles.badge}>
          {events.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {events.map((event) => {
          const isProjectEvent = event.eventType === "milestone";
          const eventHref = event.url || `/bidrag/${event.id}`;
          const typeStyles = getEventTypeStyles(event);
          const TypeIcon = isProjectEvent ? Flag : CalendarIcon;
          return (
          <Card key={event.id} className={`hover-elevate ${typeStyles.border}`} data-testid={`deadline-event-${event.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <TypeIcon className={`h-3.5 w-3.5 shrink-0 ${typeStyles.text}`} data-testid={`event-type-icon-${event.id}`} />
                    {event.isBookmarked && (
                      <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
                    )}
                    <Link href={eventHref}>
                      <span className="font-medium text-sm hover:text-primary cursor-pointer" data-testid={`deadline-title-${event.id}`}>
                        {event.title}
                      </span>
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{event.source}</span>
                    {event.amount && (
                      <span className="flex items-center gap-1">
                        <Banknote className="h-3 w-3" />
                        {parseFloat(event.amount) >= 1000000
                          ? `${(parseFloat(event.amount) / 1000000).toFixed(1)}M kr`
                          : `${(parseFloat(event.amount) / 1000).toFixed(0)}k kr`}
                      </span>
                    )}
                    {event.matchScore > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {event.matchScore}% match
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${styles.text}`}>
                      {t("calendar.daysLeft", { count: event.daysUntil })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(event.deadline), "d MMM yyyy", { locale })}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(generateGoogleCalendarUrl(event), "_blank")}
                          data-testid={`button-gcal-${event.id}`}
                        >
                          <CalendarDays className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("calendar.addToGoogle")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => downloadIcs(event)}
                          data-testid={`button-ics-${event.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("calendar.downloadIcs")}</TooltipContent>
                    </Tooltip>
                    {!isProjectEvent && (
                      <Button variant="default" size="sm" asChild>
                        <Link href={`/bidrag/${event.id}/apply`} data-testid={`button-apply-${event.id}`}>
                          <Sparkles className="h-3 w-3 mr-1" />
                          {t("calendar.applyWithAI")}
                        </Link>
                      </Button>
                    )}
                    {isProjectEvent && (
                      <Button variant="default" size="sm" asChild>
                        <Link href={eventHref} data-testid={`button-view-project-${event.id}`}>
                          <Briefcase className="h-3 w-3 mr-1" />
                          Visa projekt
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
