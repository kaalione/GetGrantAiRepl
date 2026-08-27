import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Target, ChevronDown, Plus, Check, Building2, FileUp, Loader2, Sparkles } from "lucide-react";
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

// Switches which search profile matching runs against ("what are we seeking
// funding for?"). The selection is sent as profileId with matching queries.
export function ProfileSwitcher({ companyId }: { companyId: string | null | undefined }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { profiles, selectedProfile, selectProfile, createProfile } = useSearchProfiles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goals, setGoals] = useState("");
  const [budget, setBudget] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<{
    focusAreas: string[];
    keywords: string[];
    timeframe?: string;
    sourceDocumentPath: string;
    extraction: Record<string, unknown>;
    confidence: number;
  } | null>(null);
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
      setName(p.name || "");
      setDescription(p.description || "");
      setGoals(p.goals || "");
      if (p.budget_sek) setBudget(String(p.budget_sek));
      setExtracted({
        focusAreas: p.focus_areas || [],
        keywords: p.keywords || [],
        timeframe: p.timeframe || undefined,
        sourceDocumentPath: body.sourceDocumentPath,
        extraction: { ...p, pages: body.pages },
        confidence: p.confidence ?? 0.5,
      });
      toast({
        title: t("profiles.extractDone", "Utkast ifyllt från dokumentet"),
        description: t("profiles.extractReview", "Granska och justera fälten innan du sparar."),
      });
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
        ...(extracted
          ? {
              focusAreas: extracted.focusAreas,
              keywords: extracted.keywords,
              timeframe: extracted.timeframe,
              createdFrom: "document" as const,
              sourceDocumentPath: extracted.sourceDocumentPath,
              extraction: extracted.extraction,
            }
          : {}),
      });
      setDialogOpen(false);
      setName("");
      setDescription("");
      setGoals("");
      setBudget("");
      setExtracted(null);
      toast({ title: t("profiles.created", "Sökprofil skapad") });
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="dialog-new-profile">
          <DialogHeader>
            <DialogTitle>{t("profiles.newTitle", "Ny projektprofil")}</DialogTitle>
            <DialogDescription>
              {t(
                "profiles.newDesc",
                "Beskriv vad ni söker finansiering till, så matchar vi bidrag mot projektet istället för kärnverksamheten."
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleDocument(e.target.files[0])}
              data-testid="input-profile-document"
            />
            <button
              type="button"
              disabled={extracting}
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover-elevate flex items-center justify-center gap-2"
              data-testid="button-upload-document"
            >
              {extracting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("profiles.extracting", "Läser dokumentet…")}
                </>
              ) : extracted ? (
                <>
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("profiles.extractedBadge", "Ifyllt från dokument — granska fälten nedan")}
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4" />
                  {t("profiles.uploadCta", "Har ni en pitch deck eller projektplan? Ladda upp en PDF så fyller vi i åt er")}
                </>
              )}
            </button>
            <div className="space-y-2">
              <Label htmlFor="profile-name">{t("profiles.fieldName", "Namn på projektet")}</Label>
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
              <Label htmlFor="profile-description">{t("profiles.fieldDescription", "Vad går projektet ut på?")}</Label>
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
              <Label htmlFor="profile-goals">{t("profiles.fieldGoals", "Vad vill ni uppnå?")}</Label>
              <Textarea
                id="profile-goals"
                rows={2}
                maxLength={4000}
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                data-testid="input-profile-goals"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-budget">{t("profiles.fieldBudget", "Ungefärlig budget (SEK, valfritt)")}</Label>
              <Input
                id="profile-budget"
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                data-testid="input-profile-budget"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createProfile.isPending} data-testid="button-create-profile-submit">
                {t("profiles.createButton", "Skapa profil")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
