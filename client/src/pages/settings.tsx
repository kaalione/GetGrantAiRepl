import { useTranslation } from "react-i18next";
import { NotificationPreferences } from "@/components/notification-preferences";
import { SEO } from "@/components/seo";
import { Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  const { t } = useTranslation();

  return (
    <>
      <SEO title={t("nav.settings")} description={t("notifications.description")} noindex={true} />
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3" data-testid="text-settings-title">
            <SettingsIcon className="h-8 w-8" />
            {t("nav.settings")}
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-settings-subtitle">
            {t("settings.subtitle")}
          </p>
        </div>

        <NotificationPreferences />
      </div>
    </>
  );
}
