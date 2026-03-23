import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import {
  Library,
  Plus,
  Search,
  FileText,
  Users,
  Lightbulb,
  TrendingUp,
  Cpu,
  Target,
  Leaf,
  DollarSign,
  Tag,
  Copy,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  Download,
  CheckCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { SEO } from "@/components/seo";
import type { ContentBlock, Application, Grant } from "@shared/schema";

const CONTENT_TYPE_CONFIG: Record<
  string,
  { label: string; labelEn: string; icon: any; color: string }
> = {
  company_description: {
    label: "Företagsbeskrivning",
    labelEn: "Company Description",
    icon: FileText,
    color: "text-blue-500",
  },
  team_overview: {
    label: "Teamöversikt",
    labelEn: "Team Overview",
    icon: Users,
    color: "text-green-500",
  },
  problem_statement: {
    label: "Problemformulering",
    labelEn: "Problem Statement",
    icon: Lightbulb,
    color: "text-amber-500",
  },
  market_analysis: {
    label: "Marknadsanalys",
    labelEn: "Market Analysis",
    icon: TrendingUp,
    color: "text-purple-500",
  },
  technology_description: {
    label: "Teknologibeskrivning",
    labelEn: "Technology Description",
    icon: Cpu,
    color: "text-cyan-500",
  },
  impact_statement: {
    label: "Effektbeskrivning",
    labelEn: "Impact Statement",
    icon: Target,
    color: "text-red-500",
  },
  budget_approach: {
    label: "Budgetansats",
    labelEn: "Budget Approach",
    icon: DollarSign,
    color: "text-emerald-500",
  },
  sustainability_plan: {
    label: "Hållbarhetsplan",
    labelEn: "Sustainability Plan",
    icon: Leaf,
    color: "text-green-600",
  },
  custom: {
    label: "Anpassad",
    labelEn: "Custom",
    icon: Tag,
    color: "text-gray-500",
  },
};

interface ApplicationWithGrant extends Application {
  grant?: Grant;
}

export default function ContentLibrary() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const isEn = i18n.language === "en";

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [langFilter, setLangFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ContentBlock | null>(null);
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const [reviewBlocks, setReviewBlocks] = useState<ContentBlock[]>([]);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [newBlock, setNewBlock] = useState({
    contentType: "company_description",
    title: "",
    content: "",
    language: "sv",
    tags: "",
  });

  const blocksQuery = useQuery<ContentBlock[]>({
    queryKey: [
      "/api/content-library",
      typeFilter !== "all" ? `contentType=${typeFilter}` : "",
      langFilter !== "all" ? `language=${langFilter}` : "",
      searchQuery ? `search=${searchQuery}` : "",
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("contentType", typeFilter);
      if (langFilter !== "all") params.set("language", langFilter);
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/content-library?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const applicationsQuery = useQuery<ApplicationWithGrant[]>({
    queryKey: ["/api/applications"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newBlock) => {
      const tags = data.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await apiRequest("POST", "/api/content-library", {
        ...data,
        tags,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-library"] });
      setCreateDialogOpen(false);
      setNewBlock({
        contentType: "company_description",
        title: "",
        content: "",
        language: "sv",
        tags: "",
      });
      toast({
        title: t("contentLibrary.blockCreated", "Innehållsblock skapat"),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { title?: string; content?: string; tags?: string[]; isApproved?: boolean };
    }) => {
      const res = await apiRequest("PUT", `/api/content-library/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-library"] });
      setEditingBlock(null);
      toast({
        title: t("contentLibrary.blockUpdated", "Innehållsblock uppdaterat"),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/content-library/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-library"] });
      toast({
        title: t("contentLibrary.blockDeleted", "Innehållsblock borttaget"),
      });
    },
  });

  const extractMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/content-library/extract/${applicationId}`
      );
      return res.json() as Promise<{ extracted: number; blocks: ContentBlock[] }>;
    },
    onSuccess: (data) => {
      setExtractDialogOpen(false);
      if (data.blocks.length > 0) {
        setReviewBlocks(data.blocks);
        setReviewDialogOpen(true);
      } else {
        toast({
          title: t(
            "contentLibrary.noBlocksExtracted",
            "Inga återanvändbara block hittades"
          ),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/content-library"] });
    },
    onError: () => {
      toast({
        title: t("contentLibrary.extractFailed", "Extraktion misslyckades"),
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(
        "POST",
        `/api/content-library/${id}/approve`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-library"] });
    },
  });

  const blocks = blocksQuery.data || [];
  const approvedBlocks = blocks.filter((b) => b.isApproved);
  const pendingBlocks = blocks.filter((b) => !b.isApproved);

  const groupedBlocks: Record<string, ContentBlock[]> = {};
  for (const block of approvedBlocks) {
    if (!groupedBlocks[block.contentType]) {
      groupedBlocks[block.contentType] = [];
    }
    groupedBlocks[block.contentType].push(block);
  }

  const handleCopy = (block: ContentBlock) => {
    navigator.clipboard.writeText(block.content);
    setCopiedId(block.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const completedApps = (applicationsQuery.data || []).filter(
    (a) =>
      a.sections &&
      a.sections.length > 0 &&
      (a.status === "submitted" ||
        a.status === "approved" ||
        a.status === "ready" ||
        a.status === "draft")
  );

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <SEO
        title={t("contentLibrary.title", "Innehållsbibliotek")}
        noindex={true}
      />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-content-library-title">
            <Library className="h-6 w-6" />
            {t("contentLibrary.title", "Innehållsbibliotek")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1" data-testid="text-content-library-desc">
            {t(
              "contentLibrary.description",
              "Återanvändbara innehållsblock från dina ansökningar."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setExtractDialogOpen(true)}
            data-testid="button-extract-from-app"
          >
            <Download className="mr-2 h-4 w-4" />
            {t("contentLibrary.extractFromApp", "Extrahera från ansökan")}
          </Button>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            data-testid="button-add-block"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("contentLibrary.addManually", "Lägg till manuellt")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("contentLibrary.searchPlaceholder", "Sök i biblioteket...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-library"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-type-filter">
            <SelectValue placeholder={t("contentLibrary.allTypes", "Alla typer")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("contentLibrary.allTypes", "Alla typer")}
            </SelectItem>
            {Object.entries(CONTENT_TYPE_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {isEn ? config.labelEn : config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={langFilter} onValueChange={setLangFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-lang-filter">
            <SelectValue placeholder={t("contentLibrary.allLanguages", "Alla språk")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("contentLibrary.allLanguages", "Alla språk")}
            </SelectItem>
            <SelectItem value="sv">Svenska</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {blocksQuery.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!blocksQuery.isLoading && blocks.length === 0 && (
        <EmptyLibrary onCreateBlock={() => setCreateDialogOpen(true)} />
      )}

      {pendingBlocks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-pending-review-heading">
            <Clock className="h-5 w-5 text-amber-500" />
            {t("contentLibrary.pendingReview", "Väntar på granskning")} ({pendingBlocks.length})
          </h2>
          <div className="space-y-2">
            {pendingBlocks.map((block) => {
              const config = CONTENT_TYPE_CONFIG[block.contentType] || CONTENT_TYPE_CONFIG.custom;
              const Icon = config.icon;
              return (
                <Card key={block.id} data-testid={`card-pending-block-${block.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`h-4 w-4 ${config.color}`} />
                          <span className="font-medium text-sm">{block.title}</span>
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {t("contentLibrary.pending", "Väntar")}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {block.content.substring(0, 200)}...
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{block.wordCount} {t("contentLibrary.words", "ord")}</span>
                          <span>{isEn ? config.labelEn : config.label}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate(block.id)}
                          data-testid={`button-approve-block-${block.id}`}
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          {t("contentLibrary.approve", "Godkänn")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingBlock(block)}
                          data-testid={`button-edit-pending-${block.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(block.id)}
                          data-testid={`button-discard-block-${block.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {Object.entries(groupedBlocks).map(([type, typeBlocks]) => {
        const config = CONTENT_TYPE_CONFIG[type] || CONTENT_TYPE_CONFIG.custom;
        const Icon = config.icon;
        return (
          <Collapsible key={type} defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 hover:bg-muted/50 rounded-md px-2">
              <ChevronDown className="h-4 w-4 transition-transform" />
              <Icon className={`h-5 w-5 ${config.color}`} />
              <h2 className="font-semibold" data-testid={`text-type-heading-${type}`}>
                {isEn ? config.labelEn : config.label}
              </h2>
              <Badge variant="outline" className="text-xs ml-1">
                {typeBlocks.length}
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {typeBlocks.map((block) => (
                <Card key={block.id} data-testid={`card-block-${block.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{block.title}</span>
                          <Badge variant="default" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t("contentLibrary.approved", "Godkänd")}
                          </Badge>
                          {block.language && (
                            <Badge variant="outline" className="text-xs uppercase">
                              {block.language}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          "{block.content.substring(0, 300)}
                          {block.content.length > 300 ? "..." : '"'}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span>
                            {block.wordCount} {t("contentLibrary.words", "ord")}
                          </span>
                          {(block.usageCount ?? 0) > 0 && (
                            <span>
                              {t("contentLibrary.usedTimes", "Använd {{count}} gånger", {
                                count: block.usageCount ?? 0,
                              })}
                            </span>
                          )}
                          {block.tags && block.tags.length > 0 && (
                            <div className="flex gap-1">
                              {block.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingBlock(block)}
                          data-testid={`button-edit-block-${block.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(block)}
                          data-testid={`button-copy-block-${block.id}`}
                        >
                          {copiedId === block.id ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(block.id)}
                          data-testid={`button-delete-block-${block.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("contentLibrary.createBlock", "Skapa nytt innehållsblock")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("contentLibrary.type", "Typ")}</Label>
              <Select
                value={newBlock.contentType}
                onValueChange={(v) =>
                  setNewBlock((p) => ({ ...p, contentType: v }))
                }
              >
                <SelectTrigger data-testid="select-new-block-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTENT_TYPE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {isEn ? config.labelEn : config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("contentLibrary.blockTitle", "Titel")}</Label>
              <Input
                value={newBlock.title}
                onChange={(e) =>
                  setNewBlock((p) => ({ ...p, title: e.target.value }))
                }
                placeholder={t(
                  "contentLibrary.titlePlaceholder",
                  "t.ex. Standard svensk pitch"
                )}
                data-testid="input-new-block-title"
              />
            </div>
            <div>
              <Label>{t("contentLibrary.content", "Innehåll")}</Label>
              <Textarea
                value={newBlock.content}
                onChange={(e) =>
                  setNewBlock((p) => ({ ...p, content: e.target.value }))
                }
                rows={6}
                placeholder={t(
                  "contentLibrary.contentPlaceholder",
                  "Klistra in eller skriv ditt innehåll..."
                )}
                data-testid="input-new-block-content"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {newBlock.content.split(/\s+/).filter(Boolean).length}{" "}
                {t("contentLibrary.words", "ord")}
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label>{t("contentLibrary.language", "Språk")}</Label>
                <Select
                  value={newBlock.language}
                  onValueChange={(v) =>
                    setNewBlock((p) => ({ ...p, language: v }))
                  }
                >
                  <SelectTrigger data-testid="select-new-block-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sv">Svenska</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label>{t("contentLibrary.tags", "Taggar")}</Label>
                <Input
                  value={newBlock.tags}
                  onChange={(e) =>
                    setNewBlock((p) => ({ ...p, tags: e.target.value }))
                  }
                  placeholder="vinnova, teknisk"
                  data-testid="input-new-block-tags"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              {t("common.cancel", "Avbryt")}
            </Button>
            <Button
              onClick={() => createMutation.mutate(newBlock)}
              disabled={
                !newBlock.title || !newBlock.content || createMutation.isPending
              }
              data-testid="button-save-new-block"
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("common.save", "Spara")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingBlock}
        onOpenChange={(open) => !open && setEditingBlock(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("contentLibrary.editBlock", "Redigera innehållsblock")}
            </DialogTitle>
          </DialogHeader>
          {editingBlock && (
            <div className="space-y-4">
              <div>
                <Label>{t("contentLibrary.blockTitle", "Titel")}</Label>
                <Input
                  value={editingBlock.title}
                  onChange={(e) =>
                    setEditingBlock({ ...editingBlock, title: e.target.value })
                  }
                  data-testid="input-edit-block-title"
                />
              </div>
              <div>
                <Label>{t("contentLibrary.content", "Innehåll")}</Label>
                <Textarea
                  value={editingBlock.content}
                  onChange={(e) =>
                    setEditingBlock({
                      ...editingBlock,
                      content: e.target.value,
                    })
                  }
                  rows={8}
                  data-testid="input-edit-block-content"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {editingBlock.content.split(/\s+/).filter(Boolean).length}{" "}
                  {t("contentLibrary.words", "ord")}
                </p>
              </div>
              <div>
                <Label>{t("contentLibrary.tags", "Taggar")}</Label>
                <Input
                  value={(editingBlock.tags || []).join(", ")}
                  onChange={(e) =>
                    setEditingBlock({
                      ...editingBlock,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  data-testid="input-edit-block-tags"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBlock(null)}>
              {t("common.cancel", "Avbryt")}
            </Button>
            <Button
              onClick={() => {
                if (!editingBlock) return;
                updateMutation.mutate({
                  id: editingBlock.id,
                  data: {
                    title: editingBlock.title,
                    content: editingBlock.content,
                    tags: editingBlock.tags || [],
                    isApproved: true,
                  },
                });
              }}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit-block"
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingBlock && !editingBlock.isApproved
                ? t("contentLibrary.approveAndSave", "Godkänn och spara")
                : t("common.save", "Spara")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={extractDialogOpen} onOpenChange={setExtractDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(
                "contentLibrary.extractTitle",
                "Extrahera block från ansökan"
              )}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            {t(
              "contentLibrary.extractDesc",
              "Välj en ansökan att extrahera återanvändbara innehållsblock från:"
            )}
          </p>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {completedApps.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t(
                  "contentLibrary.noAppsToExtract",
                  "Inga ansökningar med innehåll hittades."
                )}
              </p>
            ) : (
              completedApps.map((app) => (
                <Button
                  key={app.id}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-3"
                  disabled={extractMutation.isPending}
                  onClick={() => extractMutation.mutate(app.id)}
                  data-testid={`button-extract-app-${app.id}`}
                >
                  <FileText className="h-4 w-4 mr-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {app.grant?.title || t("applications.unknownGrant", "Okänt bidrag")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {app.sections?.length || 0}{" "}
                      {t("contentLibrary.sections", "avsnitt")} ·{" "}
                      {app.status}
                    </div>
                  </div>
                  {extractMutation.isPending &&
                    extractMutation.variables === app.id && (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    )}
                </Button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("contentLibrary.reviewExtracted", "Granska extraherade block")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t(
              "contentLibrary.reviewExtractedDesc",
              "{{count}} block extraherades. Granska och godkänn de du vill spara.",
              { count: reviewBlocks.length }
            )}
          </p>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {reviewBlocks.map((block) => {
              const config =
                CONTENT_TYPE_CONFIG[block.contentType] ||
                CONTENT_TYPE_CONFIG.custom;
              const Icon = config.icon;
              return (
                <Card key={block.id} data-testid={`card-review-block-${block.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 ${config.color}`} />
                      <span className="font-medium text-sm">
                        {block.title}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {block.wordCount} {t("contentLibrary.words", "ord")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {block.content.substring(0, 250)}...
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={() => {
                          approveMutation.mutate(block.id);
                          setReviewBlocks((prev) =>
                            prev.filter((b) => b.id !== block.id)
                          );
                        }}
                        data-testid={`button-review-approve-${block.id}`}
                      >
                        <CheckCircle className="mr-1 h-3 w-3" />
                        {t("contentLibrary.approve", "Godkänn")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingBlock(block);
                          setReviewDialogOpen(false);
                        }}
                        data-testid={`button-review-edit-${block.id}`}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        {t("contentLibrary.editBeforeApprove", "Redigera")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          deleteMutation.mutate(block.id);
                          setReviewBlocks((prev) =>
                            prev.filter((b) => b.id !== block.id)
                          );
                        }}
                        data-testid={`button-review-discard-${block.id}`}
                      >
                        <X className="mr-1 h-3 w-3" />
                        {t("contentLibrary.discard", "Förkasta")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {reviewBlocks.length > 0 && (
            <DialogFooter>
              <Button
                onClick={() => {
                  reviewBlocks.forEach((b) => approveMutation.mutate(b.id));
                  setReviewBlocks([]);
                  setReviewDialogOpen(false);
                  toast({
                    title: t(
                      "contentLibrary.allApproved",
                      "Alla block godkända"
                    ),
                  });
                }}
                data-testid="button-approve-all"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {t("contentLibrary.approveAll", "Godkänn alla")} ({reviewBlocks.length})
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
