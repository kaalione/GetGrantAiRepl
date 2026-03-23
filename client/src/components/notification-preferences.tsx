import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Mail, Bell, Clock, Calendar, Send, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import type { NotificationPreference } from "@shared/schema";

export function NotificationPreferences() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [localPrefs, setLocalPrefs] = useState<Partial<NotificationPreference> | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: prefs, isLoading } = useQuery<NotificationPreference>({
    queryKey: ["/api/notifications/preferences"],
  });

  useEffect(() => {
    if (prefs && !localPrefs) {
      setLocalPrefs(prefs);
    }
  }, [prefs, localPrefs]);

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<NotificationPreference>) => {
      const res = await apiRequest("PATCH", "/api/notifications/preferences", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/preferences"] });
      setHasChanges(false);
      toast({ title: t("notifications.saveSuccess") });
    },
    onError: () => {
      toast({ title: t("notifications.saveError"), variant: "destructive" });
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notifications/test");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("notifications.testEmailSent") });
    },
    onError: () => {
      toast({ title: t("notifications.testEmailError"), variant: "destructive" });
    },
  });

  function updatePreference(key: string, value: unknown) {
    setLocalPrefs((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }

  function toggleReminderDay(day: number) {
    const days = (localPrefs?.deadlineReminderDays as number[]) || [];
    const newDays = days.includes(day)
      ? days.filter((d: number) => d !== day)
      : [...days, day].sort((a: number, b: number) => b - a);
    updatePreference("deadlineReminderDays", newDays);
  }

  function handleSave() {
    if (!localPrefs) return;
    const { id, userId, createdAt, updatedAt, ...updates } = localPrefs as NotificationPreference;
    saveMutation.mutate(updates);
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-64 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!localPrefs) return null;

  return (
    <Card data-testid="notification-preferences">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t("notifications.title")}
        </CardTitle>
        <CardDescription>{t("notifications.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 p-4 rounded-md border border-border bg-muted/50">
          <div className="flex-1">
            <div className="font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4" />
              {t("notifications.masterToggle")}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {t("notifications.masterToggleDesc")}
            </div>
          </div>
          <Switch
            data-testid="switch-master-toggle"
            checked={!!localPrefs.emailNotificationsEnabled}
            onCheckedChange={(checked) => updatePreference("emailNotificationsEnabled", checked)}
          />
        </div>

        {localPrefs.emailNotificationsEnabled && (
          <>
            <div className="border-t pt-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex-1">
                  <div className="font-semibold">{t("notifications.newGrants.title")}</div>
                  <div className="text-sm text-muted-foreground">
                    {t("notifications.newGrants.description")}
                  </div>
                </div>
                <Switch
                  data-testid="switch-new-grants"
                  checked={!!localPrefs.newGrantsEnabled}
                  onCheckedChange={(checked) => updatePreference("newGrantsEnabled", checked)}
                />
              </div>

              {localPrefs.newGrantsEnabled && (
                <div className="ml-6 space-y-4">
                  <div>
                    <Label className="text-sm mb-2 block">
                      {t("notifications.newGrants.frequency")}
                    </Label>
                    <Select
                      value={localPrefs.newGrantsFrequency || "daily"}
                      onValueChange={(value) => updatePreference("newGrantsFrequency", value)}
                    >
                      <SelectTrigger data-testid="select-grant-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">{t("notifications.frequency.immediate")}</SelectItem>
                        <SelectItem value="daily">{t("notifications.frequency.daily")}</SelectItem>
                        <SelectItem value="weekly">{t("notifications.frequency.weekly")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm mb-2 block">
                      {t("notifications.newGrants.minScore")} ({localPrefs.newGrantsMinMatchScore || 60}%)
                    </Label>
                    <Slider
                      data-testid="slider-min-score"
                      value={[localPrefs.newGrantsMinMatchScore || 60]}
                      onValueChange={([value]) => updatePreference("newGrantsMinMatchScore", value)}
                      min={40}
                      max={100}
                      step={5}
                      className="mt-2"
                    />
                    <div className="text-xs text-muted-foreground mt-2">
                      {t("notifications.newGrants.minScoreDesc")}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex-1">
                  <div className="font-semibold">{t("notifications.deadlines.title")}</div>
                  <div className="text-sm text-muted-foreground">
                    {t("notifications.deadlines.description")}
                  </div>
                </div>
                <Switch
                  data-testid="switch-deadline-reminders"
                  checked={!!localPrefs.deadlineRemindersEnabled}
                  onCheckedChange={(checked) => updatePreference("deadlineRemindersEnabled", checked)}
                />
              </div>

              {localPrefs.deadlineRemindersEnabled && (
                <div className="ml-6 space-y-3">
                  <Label className="text-sm">{t("notifications.deadlines.reminderDays")}</Label>
                  {[14, 7, 3, 1].map((day) => (
                    <div key={day} className="flex items-center gap-3">
                      <Checkbox
                        data-testid={`checkbox-reminder-${day}`}
                        checked={((localPrefs.deadlineReminderDays as number[]) || []).includes(day)}
                        onCheckedChange={() => toggleReminderDay(day)}
                      />
                      <Label className="text-sm cursor-pointer">
                        {t("notifications.deadlines.daysBefore", { count: day })}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex-1">
                  <div className="font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {t("notifications.digest.title")}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("notifications.digest.description")}
                  </div>
                </div>
                <Switch
                  data-testid="switch-weekly-digest"
                  checked={!!localPrefs.weeklyDigestEnabled}
                  onCheckedChange={(checked) => updatePreference("weeklyDigestEnabled", checked)}
                />
              </div>

              {localPrefs.weeklyDigestEnabled && (
                <div className="ml-6">
                  <Label className="text-sm mb-2 block">{t("notifications.digest.day")}</Label>
                  <Select
                    value={(localPrefs.weeklyDigestDay || 1).toString()}
                    onValueChange={(value) => updatePreference("weeklyDigestDay", parseInt(value))}
                  >
                    <SelectTrigger data-testid="select-digest-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t("days.monday")}</SelectItem>
                      <SelectItem value="2">{t("days.tuesday")}</SelectItem>
                      <SelectItem value="3">{t("days.wednesday")}</SelectItem>
                      <SelectItem value="4">{t("days.thursday")}</SelectItem>
                      <SelectItem value="5">{t("days.friday")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="border-t pt-6">
              <Label className="text-sm mb-2 block flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t("notifications.preferredTime")}
              </Label>
              <Select
                value={(localPrefs.preferredHour || 8).toString()}
                onValueChange={(value) => updatePreference("preferredHour", parseInt(value))}
              >
                <SelectTrigger data-testid="select-preferred-hour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((hour) => (
                    <SelectItem key={hour} value={hour.toString()}>
                      {hour.toString().padStart(2, "0")}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground mt-2">
                {t("notifications.preferredTimeDesc")}
              </div>
            </div>
          </>
        )}

        <div className="flex gap-3 pt-6 border-t flex-wrap">
          <Button
            data-testid="button-save-preferences"
            onClick={handleSave}
            disabled={saveMutation.isPending || !hasChanges}
            className="flex-1"
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saveMutation.isPending ? t("common.saving") : t("common.save")}
          </Button>

          <Button
            data-testid="button-send-test-email"
            variant="outline"
            onClick={() => testEmailMutation.mutate()}
            disabled={testEmailMutation.isPending || !localPrefs.emailNotificationsEnabled}
          >
            {testEmailMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {testEmailMutation.isPending ? t("notifications.sending") : t("notifications.sendTest")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
