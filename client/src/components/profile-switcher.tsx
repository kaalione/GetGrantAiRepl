import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Target, ChevronDown, Plus, Check, Building2, FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSearchProfiles } from "@/hooks/use-search-profiles";

function SourceTag() {
  const { t } = useTranslation();
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary" data-testid="tag-from-pdf">
      {t("profiles.fromPdf", "ur pdf")}
    </span>
  );
}

// Switches which search profile matching runs against ("what are we seeking
// funding for?"). The selection is sent as profileId with matching queries.
export function ProfileSwitcher({ companyId }: { companyId: string | null | undefined }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { profiles, selectedProfile, selectProfile, createProfile } = useSearchProfiles();
  const [dialogOpen, setDialogOpen] = useState(false);
  // The dialog is two steps: pick a source, then review what we read out of it.
  // Nothing is saved until the user approves step 2.
  const [step, setStep] = useState<"source" | "review">("source");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goals, setGoals] = useState("");
  const [budget, setBudget] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<{
    focusAreas: string[];
    keywords: string[];
    timeframe?: string;
    sourceDocumentPath: string;
    extraction: Record<string, unknown>;
    confidence: number;
    // What the document proposed, kept separate from the editable values so a
    // field can stop claiming "ur pdf" the moment the user overwrites it.
    proposed: { name: string; description: string; goals: string; budget: string; timeframe: string };
  } | null>(null);
  const [preview, setPreview] = useState<{ matches: number; position: number; limit: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDocument = async (file: File) => {
    setExtracting(true);
    try {
      const form = new FormData();
      form.append("document", file);
      const res = await fetch("/api/profiles/extract-document", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || body?.error || `${res.status}`);

      const p = body.proposal;
      const proposed = {
        name: p.name || "",
        description: p.description || "",
        goals: p.goals || "",
        budget: p.budget_sek ? String(p.budget_sek) : "",
        timeframe: p.timeframe || "",
      };
      setName(proposed.name);
      setDescription(proposed.description);
      setGoals(proposed.goals);
      setBudget(proposed.budget);
      setTimeframe(proposed.timeframe);
      setKeywords(p.keywords || []);
      setFileName(file.name);
      setExtracted({
        focusAreas: p.focus_areas || [],
        keywords: p.keywords || [],
        timeframe: p.timeframe || undefined,
        sourceDocumentPath: body.sourceDocumentPath,
        extraction: { ...p, pages: body.pages },
        confidence: p.confidence ?? 0.5,
        proposed,
      });
      setStep("review");
    } catch (err: any) {
      toast({
        title: t("profiles.extractFailed", "Kunde inte läsa dokumentet"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // The footer promises a match count, so it is recomputed as the user edits the
  // fields that drive relevance — debounced, because each run scores the index.
  useEffect(() => {
    if (step !== "review" || !companyId) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/profiles/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            description: description || null,
            goals: goals || null,
            focusAreas: extracted?.focusAreas ?? null,
            keywords: keywords.length ? keywords : null,
          }),
        });
        if (res.ok) setPreview(await res.json());
      } catch {
        // A missing preview only costs the reassuring number; saving still works.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [step, companyId, description, goals, keywords, extracted]);

  const resetDialog = () => {
    setStep("source");
    setName("");
    setDescription("");
    setGoals("");
    setBudget("");
    setTimeframe("");
    setKeywords([]);
    setKeywordDraft("");
    setFileName(null);
    setExtracted(null);
    setPreview(null);
  };

  // A field only claims to come from the document while it still holds what the
  // document proposed; the tag disappears as soon as the user edits it.
  const fromDocument = (field: keyof NonNullable<typeof extracted>["proposed"], value: string) =>
    !!extracted && !!extracted.proposed[field] && extracted.proposed[field] === value;

  const filledFromDocument = extracted
    ? (["name", "description", "goals", "budget", "timeframe"] as const).filter(
        (f) => !!extracted.proposed[f],
      ).length +
      (extracted.keywords.length ? 1 : 0) +
      (extracted.focusAreas.length ? 1 : 0)
    : 0;

  const addKeyword = () => {
    const value = keywordDraft.trim();
    if (!value || keywords.includes(value) || keywords.length >= 30) return;
    setKeywords([...keywords, value]);
    setKeywordDraft("");
  };

  if (!companyId || profiles.length === 0) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createProfile.mutateAsync({
        companyId,
        name: name.trim(),
        description: description.trim() || undefined,
        goals: goals.trim() || undefined,
        budgetSek: budget ? parseInt(budget, 10) : undefined,
        timeframe: timeframe.trim() || undefined,
        keywords: keywords.length ? keywords : undefined,
        ...(extracted
          ? {
              focusAreas: extracted.focusAreas,
              createdFrom: "document" as const,
              sourceDocumentPath: extracted.sourceDocumentPath,
              extraction: extracted.extraction,
            }
          : {}),
      });
      setDialogOpen(false);
      resetDialog();
      toast({ title: t("profiles.created", "Satsningen sparad") });
    } catch (err: any) {
      toast({
        title: err.upgrade
          ? t("profiles.upgradeNeeded", "Uppgradering krävs")
          : t("profiles.createFailed", "Kunde inte skapa profilen"),
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-profile-switcher">
            <Target className="h-4 w-4" />
            <span className="max-w-[180px] truncate">{selectedProfile?.name}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{t("profiles.switchLabel", "Visa matchningar för")}</DropdownMenuLabel>
          {profiles.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => selectProfile(p.id)}
              data-testid={`menuitem-profile-${p.id}`}
            >
              {p.kind === "core" ? (
                <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              ) : (
                <Target className="mr-2 h-4 w-4 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{p.name}</span>
              {selectedProfile?.id === p.id && <Check className="ml-2 h-4 w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialogOpen(true)} data-testid="menuitem-new-profile">
            <Plus className="mr-2 h-4 w-4" />
            {t("profiles.newProject", "Nytt projekt…")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetDialog();
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl" data-testid="dialog-new-profile">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleDocument(e.target.files[0])}
            data-testid="input-profile-document"
          />

          {step === "source" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("profiles.step1Title", "Ny satsning — steg 1 av 2")}</DialogTitle>
                <DialogDescription>
                  {t(
                    "profiles.step1Desc",
                    "Har ni redan skrivit ned projektet? Ladda upp det, så läser vi ut fälten åt er. Ni granskar allt innan något sparas."
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={extracting}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-lg border border-dashed p-6 text-sm hover-elevate flex flex-col items-center justify-center gap-2"
                  data-testid="button-upload-document"
                >
                  {extracting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span>{t("profiles.extracting", "Läser dokumentet…")}</span>
                    </>
                  ) : (
                    <>
                      <FileUp className="h-5 w-5 text-primary" />
                      <span className="font-medium">
                        {t("profiles.uploadTitle", "Ladda upp pitch deck eller projektplan")}
                      </span>
                      <span className="text-muted-foreground">{t("profiles.uploadHint", "PDF")}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("review")}
                  className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                  data-testid="button-fill-manually"
                >
                  {t("profiles.fillManually", "Eller fyll i själv")}
                </button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {extracted
                    ? t("profiles.step2Title", "Steg 2 av 2 — granska vad vi läste ur dokumentet")
                    : t("profiles.step2TitleManual", "Beskriv satsningen")}
                </DialogTitle>
                <DialogDescription>
                  {extracted
                    ? t(
                        "profiles.step2Desc",
                        "Vi föreslår, ni bestämmer. Justera fritt — inget sparas förrän ni godkänner."
                      )
                    : t(
                        "profiles.step2DescManual",
                        "Det här styr vilka utlysningar ni matchas mot. Inget sparas förrän ni godkänner."
                      )}
                </DialogDescription>
              </DialogHeader>

              {extracted && (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm">
                      <FileUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="max-w-[220px] truncate">{fileName}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={extracting}
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-change-file"
                    >
                      {extracting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        t("profiles.changeFile", "Byt fil")
                      )}
                    </Button>
                    <span className="ml-auto text-sm text-muted-foreground" data-testid="text-read-quality">
                      {t("profiles.readQuality", "Läskvalitet")} {Math.round(extracted.confidence * 100)} %
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground" data-testid="text-filled-count">
                    {filledFromDocument} {t("profiles.fieldsFromDoc", "fält ifyllda från dokumentet")}
                  </p>
                </div>
              )}

              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2">{t("profiles.howUsed", "Så används satsningen")}</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  <li>{t("profiles.howUsed1", "Utlysningar rankas mot det här projektet i stället för mot kärnverksamheten.")}</li>
                  <li>{t("profiles.howUsed2", "Bevakningar och deadlines följer satsningen.")}</li>
                  <li>{t("profiles.howUsed3", "Ansökningar ni startar hämtar sin bakgrund härifrån.")}</li>
                </ul>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="profile-name">{t("profiles.fieldName", "Namn på projektet")}</Label>
                    {fromDocument("name", name) && <SourceTag />}
                  </div>
                  <Input
                    id="profile-name"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("profiles.fieldNamePlaceholder", "t.ex. Exportsatsning EU")}
                    data-testid="input-profile-name"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="profile-description">{t("profiles.fieldDescription", "Vad går projektet ut på?")}</Label>
                    {fromDocument("description", description) && <SourceTag />}
                  </div>
                  <Textarea
                    id="profile-description"
                    rows={3}
                    maxLength={4000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    data-testid="input-profile-description"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="profile-goals">{t("profiles.fieldGoals", "Vad vill ni uppnå?")}</Label>
                    {fromDocument("goals", goals) && <SourceTag />}
                  </div>
                  <Textarea
                    id="profile-goals"
                    rows={2}
                    maxLength={4000}
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                    data-testid="input-profile-goals"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="profile-budget">{t("profiles.fieldBudget", "Budget (SEK)")}</Label>
                      {fromDocument("budget", budget) && <SourceTag />}
                    </div>
                    <Input
                      id="profile-budget"
                      type="number"
                      min={0}
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      data-testid="input-profile-budget"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="profile-timeframe">{t("profiles.fieldTimeframe", "Tidsram")}</Label>
                      {fromDocument("timeframe", timeframe) && <SourceTag />}
                    </div>
                    <Input
                      id="profile-timeframe"
                      maxLength={120}
                      value={timeframe}
                      onChange={(e) => setTimeframe(e.target.value)}
                      placeholder={t("profiles.fieldTimeframePlaceholder", "18 månader")}
                      data-testid="input-profile-timeframe"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("profiles.fieldKeywords", "Nyckelord")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((keyword) => (
                      <button
                        key={keyword}
                        type="button"
                        onClick={() => setKeywords(keywords.filter((k) => k !== keyword))}
                        className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm hover-elevate"
                        data-testid={`chip-keyword-${keyword}`}
                      >
                        {keyword}
                        <X className="h-3 w-3 opacity-60" />
                      </button>
                    ))}
                    <div className="inline-flex items-center gap-1">
                      <Input
                        value={keywordDraft}
                        onChange={(e) => setKeywordDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addKeyword();
                          }
                        }}
                        placeholder={t("profiles.addKeyword", "lägg till")}
                        className="h-8 w-32"
                        data-testid="input-keyword-draft"
                      />
                    </div>
                  </div>
                </div>

                {preview && (
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                    <p className="text-sm font-medium" data-testid="text-match-preview">
                      {t("profiles.matchPreview", {
                        defaultValue: "{{count}} utlysningar matchar den här satsningen just nu",
                        count: preview.matches,
                      })}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid="text-quota">
                      {t("profiles.quota", {
                        defaultValue: "Sparas som er {{position}}:a av {{limit}} projektsatsningar",
                        position: preview.position,
                        limit: preview.limit,
                      })}
                    </p>
                  </div>
                )}

                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDialogOpen(false)}
                    data-testid="button-cancel-profile"
                  >
                    {t("common.cancel", "Avbryt")}
                  </Button>
                  <Button type="submit" disabled={createProfile.isPending} data-testid="button-create-profile-submit">
                    {createProfile.isPending
                      ? t("profiles.saving", "Sparar…")
                      : t("profiles.createButton", "Spara satsningen")}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
