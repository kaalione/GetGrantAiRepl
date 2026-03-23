import { FileSearch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  icon?: LucideIcon | "search" | "add";
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  icon = "search",
}: EmptyStateProps) {
  const Icon = icon === "search" ? FileSearch : icon === "add" ? Plus : icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center" data-testid="empty-state">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2" data-testid="text-empty-title">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6" data-testid="text-empty-description">{description}</p>
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex gap-3">
          {actionLabel && onAction && (
            <Button onClick={onAction} data-testid="button-empty-action">
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="outline" onClick={onSecondaryAction} data-testid="button-empty-secondary-action">
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
