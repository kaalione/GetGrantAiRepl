import { Check, X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchFactor } from "@/lib/matching";

interface EligibilityChecklistProps {
  factors: MatchFactor[];
  className?: string;
}

export function EligibilityChecklist({ factors, className }: EligibilityChecklistProps) {
  if (factors.length === 0) {
    return (
      <div className={cn("text-muted-foreground text-sm", className)}>
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          <span>Skapa en företagsprofil för att se hur väl du matchar</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} data-testid="eligibility-checklist">
      {factors.map((factor, index) => (
        <div
          key={index}
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg border",
            factor.met
              ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50"
              : factor.points > 0
              ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50"
              : "border-muted bg-muted/50"
          )}
          data-testid={`eligibility-item-${factor.name.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <div
            className={cn(
              "shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
              factor.met
                ? "bg-green-500 text-white"
                : factor.points > 0
                ? "bg-amber-500 text-white"
                : "bg-muted-foreground/20 text-muted-foreground"
            )}
          >
            {factor.met ? (
              <Check className="h-4 w-4" />
            ) : factor.points > 0 ? (
              <span className="text-xs font-medium">~</span>
            ) : (
              <X className="h-4 w-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "font-medium text-sm",
                  factor.met
                    ? "text-green-700 dark:text-green-300"
                    : factor.points > 0
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground"
                )}
              >
                {factor.name}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {factor.points}/{factor.maxPoints} poäng
              </span>
            </div>
            <p
              className={cn(
                "text-sm mt-0.5",
                factor.met
                  ? "text-green-600 dark:text-green-400"
                  : "text-muted-foreground"
              )}
            >
              {factor.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
