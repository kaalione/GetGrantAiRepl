import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MatchResult } from "@shared/matching";

interface MatchIndicatorProps {
  matchResult: MatchResult;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function MatchIndicator({ matchResult, size = "md", showLabel = true }: MatchIndicatorProps) {
  const { score, factors, explanation } = matchResult;

  const sizeStyles = {
    sm: { wrapper: "h-8 w-8", text: "text-xs", stroke: 3 },
    md: { wrapper: "h-12 w-12", text: "text-sm", stroke: 4 },
    lg: { wrapper: "h-16 w-16", text: "text-base", stroke: 5 },
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-amber-600 dark:text-amber-400";
    if (score >= 40) return "text-orange-600 dark:text-orange-400";
    return "text-muted-foreground";
  };

  const getStrokeColor = (score: number) => {
    if (score >= 80) return "stroke-green-500";
    if (score >= 60) return "stroke-amber-500";
    if (score >= 40) return "stroke-orange-500";
    return "stroke-muted-foreground/30";
  };

  const styles = sizeStyles[size];
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  if (score === 0 && factors.length === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <div className={cn("relative", styles.wrapper)}>
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={styles.stroke}
                  className="text-muted/30"
                />
              </svg>
              <span className={cn("absolute inset-0 flex items-center justify-center font-medium", styles.text, "text-muted-foreground")}>
                ?
              </span>
            </div>
            {showLabel && (
              <span className="text-xs text-muted-foreground">Saknar profil</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{explanation}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 cursor-help" data-testid="match-indicator">
          <div className={cn("relative", styles.wrapper)}>
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={styles.stroke}
                className="text-muted/20"
              />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth={styles.stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className={cn("transition-all duration-500", getStrokeColor(score))}
              />
            </svg>
            <span className={cn("absolute inset-0 flex items-center justify-center font-semibold", styles.text, getScoreColor(score))}>
              {score}
            </span>
          </div>
          {showLabel && (
            <span className={cn("text-xs", getScoreColor(score))}>
              {score >= 80 ? "Utmärkt" : score >= 60 ? "Bra" : score >= 40 ? "Möjlig" : "Låg"}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-2">
          <p className="text-sm font-medium">{explanation}</p>
          {factors.length > 0 && (
            <div className="text-xs space-y-1 pt-1 border-t">
              {factors.map((factor, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className={factor.met ? "text-green-600" : "text-muted-foreground"}>
                    {factor.met ? "✓" : "○"} {factor.name}
                  </span>
                  <span className="text-muted-foreground">
                    {factor.points}/{factor.maxPoints}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
