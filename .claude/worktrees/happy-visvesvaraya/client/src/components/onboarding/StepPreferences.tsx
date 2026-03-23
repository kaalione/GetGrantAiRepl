import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft, Loader2, Target, Bell,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface StepPreferencesProps {
  sessionId: string;
  onComplete: () => void;
  onBack: () => void;
}

export function StepPreferences({ sessionId, onComplete, onBack }: StepPreferencesProps) {
  const [goal, setGoal] = useState('');
  const [fundingRange, setFundingRange] = useState('');
  const [urgency, setUrgency] = useState('');
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [instantNotify, setInstantNotify] = useState(false);
  const [deadlineReminders, setDeadlineReminders] = useState(false);
  const [saving, setSaving] = useState(false);

  const goals = [
    { value: 'rd', label: 'Produktutveckling / R&D' },
    { value: 'export', label: 'Marknadsetablering / export' },
    { value: 'hiring', label: 'Rekrytering / kompetensförsörjning' },
    { value: 'sustainability', label: 'Hållbarhetsomställning' },
    { value: 'digitalization', label: 'Digitalisering' },
    { value: 'infrastructure', label: 'Infrastruktur / lokaler' },
  ];

  const fundingRanges = [
    { value: '0-500k', label: 'Upp till 500 000 SEK (seed/tidig fas)' },
    { value: '500k-2m', label: '500 000 – 2 000 000 SEK (tillväxt)' },
    { value: '2m-10m', label: '2 000 000 – 10 000 000 SEK (scale-up)' },
    { value: '10m+', label: 'Över 10 000 000 SEK (stora projekt)' },
    { value: 'unknown', label: 'Vet inte ännu' },
  ];

  const urgencies = [
    { value: '3months', label: 'Inom 3 månader' },
    { value: '3-12months', label: '3–12 månader' },
    { value: 'exploring', label: 'Inget akut — utforskar möjligheter' },
  ];

  async function handleSubmit() {
    setSaving(true);
    try {
      await apiRequest('POST', '/api/onboarding/save-goals', {
        sessionId,
        goal,
        fundingRange,
        urgency,
      });
    } catch {}
    try {
      await apiRequest('POST', '/api/onboarding/save-notifications', {
        sessionId,
        weeklyDigest,
        instantNotify,
        deadlineReminders,
      });
    } catch {}
    setSaving(false);
    onComplete();
  }

  return (
    <div className="space-y-6" data-testid="step-preferences">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <Target className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Mål & notiser</h2>
        <p className="text-muted-foreground">
          Berätta vad du söker och hur du vill bli notifierad.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <Label className="mb-2 block font-medium">Vad är ditt primära mål? (välj ett)</Label>
          <div className="space-y-2">
            {goals.map((g) => (
              <label
                key={g.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  goal === g.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  name="goal"
                  value={g.value}
                  checked={goal === g.value}
                  onChange={(e) => setGoal(e.target.value)}
                  className="accent-primary"
                  data-testid={`radio-goal-${g.value}`}
                />
                <span className="text-sm">{g.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2 block font-medium">Hur stor finansiering letar du efter?</Label>
          <div className="space-y-2">
            {fundingRanges.map((f) => (
              <label
                key={f.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  fundingRange === f.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  name="funding"
                  value={f.value}
                  checked={fundingRange === f.value}
                  onChange={(e) => setFundingRange(e.target.value)}
                  className="accent-primary"
                  data-testid={`radio-funding-${f.value}`}
                />
                <span className="text-sm">{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2 block font-medium">Hur snabbt behöver du finansiering?</Label>
          <div className="space-y-2">
            {urgencies.map((u) => (
              <label
                key={u.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  urgency === u.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  name="urgency"
                  value={u.value}
                  checked={urgency === u.value}
                  onChange={(e) => setUrgency(e.target.value)}
                  className="accent-primary"
                  data-testid={`radio-urgency-${u.value}`}
                />
                <span className="text-sm">{u.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t pt-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Notiser</h3>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
            <Checkbox
              checked={weeklyDigest}
              onCheckedChange={(c) => setWeeklyDigest(!!c)}
              className="mt-0.5"
              data-testid="checkbox-weekly-digest"
            />
            <div>
              <p className="font-medium text-sm">Veckovis sammanfattning av nya matchningar</p>
              <p className="text-xs text-muted-foreground">(rekommenderas)</p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
            <Checkbox
              checked={instantNotify}
              onCheckedChange={(c) => setInstantNotify(!!c)}
              className="mt-0.5"
              data-testid="checkbox-instant-notify"
            />
            <div>
              <p className="font-medium text-sm">Direktnotifiering vid nya bidrag</p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
            <Checkbox
              checked={deadlineReminders}
              onCheckedChange={(c) => setDeadlineReminders(!!c)}
              className="mt-0.5"
              data-testid="checkbox-deadline-reminders"
            />
            <div>
              <p className="font-medium text-sm">Deadline-påminnelser (7 och 1 dag innan)</p>
            </div>
          </label>
        </div>
      </div>

      <div className="flex justify-between items-center pt-4 border-t">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-preferences">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={saving}
          data-testid="button-finish-onboarding"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Klar — visa mina bidrag
        </Button>
      </div>
    </div>
  );
}
