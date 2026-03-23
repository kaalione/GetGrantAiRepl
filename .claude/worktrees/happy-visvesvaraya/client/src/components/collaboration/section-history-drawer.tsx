import { useQuery, useMutation } from "@tanstack/react-query";
import { History, RotateCcw, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HistoryEntry {
  id: string;
  applicationId: string;
  sectionKey: string;
  content: string;
  editedBy: string;
  editorName: string;
  wordCount: number | null;
  createdAt: string;
}

interface SectionHistoryDrawerProps {
  applicationId: string;
  sectionKey: string;
  sectionTitle: string;
  onClose: () => void;
  onRestore?: (content: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const time = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  if (entryDate.getTime() === today.getTime()) {
    return `Idag ${time}`;
  }
  if (entryDate.getTime() === yesterday.getTime()) {
    return `Igår ${time}`;
  }
  return `${date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${time}`;
}

export function SectionHistoryDrawer({ applicationId, sectionKey, sectionTitle, onClose, onRestore }: SectionHistoryDrawerProps) {
  const { toast } = useToast();

  const { data: history = [], isLoading } = useQuery<HistoryEntry[]>({
    queryKey: ['/api/applications', applicationId, 'sections', sectionKey, 'history'],
    enabled: !!applicationId && !!sectionKey,
  });

  const restoreMutation = useMutation({
    mutationFn: async (historyId: string) => {
      const res = await apiRequest('POST', `/api/applications/${applicationId}/sections/${sectionKey}/restore/${historyId}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Version återställd", description: "Den tidigare versionen har laddats" });
      queryClient.invalidateQueries({ queryKey: ['/api/applications', applicationId, 'sections', sectionKey, 'history'] });
      onRestore?.(data.restoredContent);
    },
    onError: (error: Error) => {
      toast({ title: "Kunde inte återställa", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="border-l bg-card w-80 flex flex-col h-full" data-testid={`history-drawer-${sectionKey}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4" />
          <div>
            <p className="text-sm font-medium">Versionshistorik</p>
            <p className="text-xs text-muted-foreground">{sectionTitle}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} data-testid="button-close-history">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Ingen historik ännu</p>
        ) : (
          history.map((entry, i) => (
            <div
              key={entry.id}
              className="border rounded-lg p-2.5 space-y-1.5 hover:bg-muted/30 transition-colors"
              data-testid={`history-entry-${entry.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-xs font-medium">{formatDate(entry.createdAt)}</span>
                </div>
                {entry.wordCount && (
                  <span className="text-xs text-muted-foreground">{entry.wordCount} ord</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{entry.editorName}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {entry.content.substring(0, 100)}...
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs w-full mt-1"
                onClick={() => restoreMutation.mutate(entry.id)}
                disabled={restoreMutation.isPending}
                data-testid={`button-restore-${entry.id}`}
              >
                {restoreMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3 mr-1" />
                )}
                Återställ
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
