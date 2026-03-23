import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PresenceUser {
  userId: string;
  userName: string;
  userColor: string;
  currentSection: string | null;
}

interface PresenceBarProps {
  users: PresenceUser[];
}

export function PresenceBar({ users }: PresenceBarProps) {
  if (users.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1" data-testid="presence-bar">
        {users.map((user) => (
          <Tooltip key={user.userId}>
            <TooltipTrigger asChild>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium cursor-default ring-2 ring-background"
                style={{ backgroundColor: user.userColor }}
                data-testid={`presence-avatar-${user.userId}`}
              >
                {user.userName.charAt(0).toUpperCase()}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{user.userName}</p>
              {user.currentSection && (
                <p className="text-xs text-muted-foreground">Redigerar: {user.currentSection}</p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
        <span className="text-xs text-muted-foreground ml-1">
          {users.length} {users.length === 1 ? 'person' : 'personer'} online
        </span>
      </div>
    </TooltipProvider>
  );
}

interface SectionPresenceProps {
  sectionKey: string;
  users: PresenceUser[];
}

export function SectionPresenceIndicator({ sectionKey, users }: SectionPresenceProps) {
  const sectionUser = users.find(u => u.currentSection === sectionKey);
  if (!sectionUser) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-xs py-1"
      style={{ color: sectionUser.userColor }}
      data-testid={`section-presence-${sectionKey}`}
    >
      <div
        className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] font-medium"
        style={{ backgroundColor: sectionUser.userColor }}
      >
        {sectionUser.userName.charAt(0).toUpperCase()}
      </div>
      <span>{sectionUser.userName} redigerar detta avsnitt</span>
    </div>
  );
}
