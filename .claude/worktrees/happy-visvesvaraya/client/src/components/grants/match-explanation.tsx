import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";

interface MatchExplanationData {
  headline: string;
  reasons: string[];
  bestFitAspect: string;
  matchScore: number;
}

interface MatchExplanationProps {
  grantId: string;
  matchScore: number;
  variant?: "inline" | "expanded";
}

export function MatchExplanation({ grantId, matchScore, variant = "inline" }: MatchExplanationProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(variant === "expanded");

  const cachedQuery = useQuery<{ explanation: MatchExplanationData | null; cached: boolean }>({
    queryKey: [`/api/grants/${grantId}/explain-match`],
    staleTime: 10 * 60 * 1000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/grants/${grantId}/explain-match`, { matchScore });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/grants/${grantId}/explain-match`] });
    },
  });

  const explanation: MatchExplanationData | null = generateMutation.data?.explanation || cachedQuery.data?.explanation || null;
  const isLoading = generateMutation.isPending;

  const handleWhyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (explanation) {
      setExpanded(!expanded);
    } else {
      setExpanded(true);
      generateMutation.mutate();
    }
  };

  if (matchScore < 40) return null;

  return (
    <div data-testid={`match-explanation-${grantId}`}>
      {!expanded && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleWhyClick}
          className="text-xs text-muted-foreground gap-1"
          data-testid={`button-why-match-${grantId}`}
        >
          {t('matchExplanation.why')}
          <ChevronDown className="h-3 w-3" />
        </Button>
      )}

      {expanded && (
        <div className="mt-2 space-y-2 animate-in slide-in-from-top-2 duration-200" data-testid={`match-explanation-panel-${grantId}`}>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('matchExplanation.analyzing')}</span>
            </div>
          )}

          {explanation && !isLoading && (
            <>
              <p className="text-sm font-medium" data-testid={`match-headline-${grantId}`}>
                {explanation.headline}
              </p>
              {explanation.reasons.length > 0 && (
                <ul className="space-y-1.5" data-testid={`match-reasons-${grantId}`}>
                  {explanation.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Badge variant="secondary" className="text-xs gap-1" data-testid={`match-best-fit-${grantId}`}>
                <Sparkles className="h-3 w-3" />
                {explanation.bestFitAspect}
              </Badge>
            </>
          )}

          {!isLoading && !explanation && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); generateMutation.mutate(); }}
              className="text-xs"
              data-testid={`button-generate-explanation-${grantId}`}
            >
              {t('matchExplanation.generate')}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleWhyClick}
            className="text-xs text-muted-foreground gap-1"
            data-testid={`button-collapse-explanation-${grantId}`}
          >
            <ChevronUp className="h-3 w-3" />
            {t('matchExplanation.collapse')}
          </Button>
        </div>
      )}
    </div>
  );
}
