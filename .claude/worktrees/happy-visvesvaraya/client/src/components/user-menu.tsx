import { useTranslation } from 'react-i18next';
import { LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

export function UserMenu() {
  const { t } = useTranslation();
  const { user, isLoading, isAuthenticated, logout, isLoggingOut } = useAuth();

  if (isLoading) {
    return <Skeleton className="h-8 w-8 rounded-full" />;
  }

  if (!isAuthenticated || !user) {
    return (
      <Button asChild variant="default" size="sm" data-testid="button-login">
        <a href="/api/login">{t('common.logIn')}</a>
      </Button>
    );
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const initials = fullName
    ? fullName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          data-testid="button-user-menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.profileImageUrl ?? undefined} alt={fullName} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            {fullName && (
              <p className="text-sm font-medium leading-none">{fullName}</p>
            )}
            {user.email && (
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logout()}
          disabled={isLoggingOut}
          className="cursor-pointer"
          data-testid="button-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{isLoggingOut ? t('common.loggingOut') : t('common.logOut')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
