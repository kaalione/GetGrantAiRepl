import { useTranslation } from "react-i18next";

export function CalendarLegend() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground" data-testid="calendar-legend">
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
        <span>{t("calendar.legendDeadline")}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
        <span>{t("calendar.legendMilestone")}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        <span>{t("calendar.legendUrgent")}</span>
      </div>
    </div>
  );
}
