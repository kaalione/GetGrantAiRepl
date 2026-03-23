import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageSquare, Send, Check, X, CornerDownRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Comment {
  id: string;
  sectionKey: string | null;
  userId: string;
  authorName: string;
  authorEmail: string;
  content: string;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  parentId: string | null;
  createdAt: string;
  replies?: Comment[];
}

interface CommentPanelProps {
  applicationId: string;
  sectionKey: string;
  onClose: () => void;
  onCommentAdded?: (comment: Comment) => void;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just nu';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h sedan`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d sedan`;
  return date.toLocaleDateString('sv-SE');
}

export function CommentPanel({ applicationId, sectionKey, onClose, onCommentAdded }: CommentPanelProps) {
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const { toast } = useToast();

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ['/api/applications', applicationId, 'comments', { sectionKey }],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${applicationId}/comments?sectionKey=${sectionKey}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch comments');
      return res.json();
    },
    enabled: !!applicationId,
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: string }) => {
      const res = await apiRequest('POST', `/api/applications/${applicationId}/comments`, {
        sectionKey,
        content,
        parentId,
      });
      return res.json();
    },
    onSuccess: (comment) => {
      queryClient.invalidateQueries({ queryKey: ['/api/applications', applicationId, 'comments'] });
      setNewComment("");
      setReplyTo(null);
      setReplyContent("");
      onCommentAdded?.(comment);
    },
    onError: (error: Error) => {
      toast({ title: "Kunde inte lägga till kommentar", description: error.message, variant: "destructive" });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiRequest('PUT', `/api/applications/${applicationId}/comments/${commentId}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/applications', applicationId, 'comments'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiRequest('DELETE', `/api/applications/${applicationId}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/applications', applicationId, 'comments'] });
    },
  });

  const unresolvedCount = comments.filter(c => !c.resolved).length;

  return (
    <div className="border-l bg-card w-80 flex flex-col h-full" data-testid={`comment-panel-${sectionKey}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          <span className="text-sm font-medium">Kommentarer</span>
          {unresolvedCount > 0 && (
            <Badge variant="secondary" className="text-xs h-5 w-5 flex items-center justify-center p-0 rounded-full">
              {unresolvedCount}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} data-testid="button-close-comments">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Inga kommentarer ännu</p>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className={`rounded-lg border p-2.5 text-sm space-y-1.5 ${comment.resolved ? 'opacity-50' : ''}`}
              data-testid={`comment-${comment.id}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs">{comment.authorName}</span>
                <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
              </div>
              <p className="text-sm leading-relaxed">{comment.content}</p>
              <div className="flex items-center gap-1 pt-1">
                {!comment.resolved && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => resolveMutation.mutate(comment.id)}
                      data-testid={`button-resolve-${comment.id}`}
                    >
                      <Check className="h-3 w-3 mr-1" /> Lös
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                    >
                      <CornerDownRight className="h-3 w-3 mr-1" /> Svara
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2 ml-auto text-muted-foreground"
                  onClick={() => deleteMutation.mutate(comment.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {comment.replies && comment.replies.length > 0 && (
                <div className="pl-3 border-l space-y-2 mt-2">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="text-xs space-y-0.5">
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{reply.authorName}</span>
                        <span className="text-muted-foreground">{timeAgo(reply.createdAt)}</span>
                      </div>
                      <p>{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {replyTo === comment.id && (
                <div className="flex gap-1 mt-1">
                  <Textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Skriv ett svar..."
                    className="min-h-[40px] text-xs"
                    data-testid={`textarea-reply-${comment.id}`}
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => addCommentMutation.mutate({ content: replyContent, parentId: comment.id })}
                    disabled={!replyContent.trim() || addCommentMutation.isPending}
                  >
                    <Send className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Lägg till en kommentar..."
            className="min-h-[40px] text-sm"
            data-testid="textarea-new-comment"
          />
          <Button
            size="icon"
            className="shrink-0"
            onClick={() => addCommentMutation.mutate({ content: newComment })}
            disabled={!newComment.trim() || addCommentMutation.isPending}
            data-testid="button-add-comment"
          >
            {addCommentMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CommentTriggerProps {
  applicationId: string;
  sectionKey: string;
  onClick: () => void;
}

export function CommentTrigger({ applicationId, sectionKey, onClick }: CommentTriggerProps) {
  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ['/api/applications', applicationId, 'comments', { sectionKey }],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${applicationId}/comments?sectionKey=${sectionKey}`, {
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!applicationId,
  });

  const unresolvedCount = comments.filter(c => !c.resolved).length;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-muted-foreground hover:text-foreground"
      onClick={onClick}
      data-testid={`button-comments-${sectionKey}`}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {unresolvedCount > 0 && (
        <Badge variant="destructive" className="text-[10px] h-4 w-4 flex items-center justify-center p-0 rounded-full ml-1">
          {unresolvedCount}
        </Badge>
      )}
    </Button>
  );
}
