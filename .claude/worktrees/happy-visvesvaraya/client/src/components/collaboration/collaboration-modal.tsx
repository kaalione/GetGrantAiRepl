import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Users, Mail, Copy, Check, X, ChevronDown, UserPlus, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface CollaborationModalProps {
  applicationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Collaborator {
  id: string;
  userId: string | null;
  email: string;
  role: string;
  status: string | null;
  joinedAt: string | null;
  createdAt: string | null;
  color: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Ägare',
  editor: 'Kan redigera',
  commenter: 'Kan kommentera',
  viewer: 'Kan visa',
};

export function CollaborationModal({ applicationId, open, onOpenChange }: CollaborationModalProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const { data: collaborators = [], isLoading } = useQuery<Collaborator[]>({
    queryKey: ['/api/applications', applicationId, 'collaborators'],
    enabled: open && !!applicationId,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/applications/${applicationId}/collaborators/invite`, {
        email: inviteEmail,
        role: inviteRole,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Inbjudan skickad", description: `En inbjudan har skickats till ${inviteEmail}` });
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ['/api/applications', applicationId, 'collaborators'] });
    },
    onError: (error: Error) => {
      toast({ title: "Kunde inte skicka inbjudan", description: error.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ collaboratorId, role }: { collaboratorId: string; role: string }) => {
      await apiRequest('PUT', `/api/applications/${applicationId}/collaborators/${collaboratorId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/applications', applicationId, 'collaborators'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (collaboratorId: string) => {
      await apiRequest('DELETE', `/api/applications/${applicationId}/collaborators/${collaboratorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/applications', applicationId, 'collaborators'] });
      toast({ title: "Medarbetare borttagen" });
    },
  });

  const handleCopyLink = () => {
    const url = `${window.location.origin}/bidrag/${applicationId}/apply`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isOwner = collaborators.some(c => c.role === 'owner' && c.id === 'owner');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Dela ansökan
          </DialogTitle>
          <DialogDescription>
            Bjud in kollegor att samarbeta på denna ansökan
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2" data-testid="invite-form">
            <Input
              type="email"
              placeholder="Kollegans e-postadress"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1"
              data-testid="input-invite-email"
            />
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="w-[140px]" data-testid="select-invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Kan redigera</SelectItem>
                <SelectItem value="commenter">Kan kommentera</SelectItem>
                <SelectItem value="viewer">Kan visa</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={!inviteEmail || inviteMutation.isPending}
              size="icon"
              data-testid="button-send-invite"
            >
              {inviteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Medarbetare</p>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1" data-testid="collaborators-list">
                {collaborators.map((collab) => (
                  <div
                    key={collab.id}
                    className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50"
                    data-testid={`collaborator-row-${collab.id}`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                      style={{ backgroundColor: collab.color }}
                    >
                      {collab.role === 'owner' ? (
                        <Crown className="h-4 w-4" />
                      ) : (
                        (collab.email?.[0] || '?').toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{collab.email || 'Ägare'}</p>
                    </div>
                    {collab.status === 'pending' && (
                      <Badge variant="outline" className="text-xs shrink-0">Väntar</Badge>
                    )}
                    {collab.role === 'owner' ? (
                      <Badge variant="secondary" className="text-xs shrink-0">Ägare</Badge>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <Select
                          value={collab.role}
                          onValueChange={(role) => updateRoleMutation.mutate({ collaboratorId: collab.id, role })}
                        >
                          <SelectTrigger className="h-7 text-xs w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">Kan redigera</SelectItem>
                            <SelectItem value="commenter">Kan kommentera</SelectItem>
                            <SelectItem value="viewer">Kan visa</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeMutation.mutate(collab.id)}
                          data-testid={`button-remove-collaborator-${collab.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Dela länk</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={`${window.location.origin}/bidrag/${applicationId}/apply`}
                className="text-xs"
                data-testid="input-share-link"
              />
              <Button variant="outline" size="icon" onClick={handleCopyLink} data-testid="button-copy-link">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
