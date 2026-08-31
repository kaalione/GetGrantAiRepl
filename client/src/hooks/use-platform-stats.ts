import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { applyPlatformStats } from "@/i18n";

interface PlatformStats {
  activeGrants: number;
  sources: number;
}

// Rounded down to the nearest hundred and shown with a "+", so the figure reads
// as a floor rather than a precise count that looks stale the moment it moves.
function floorToHundred(n: number): string {
  return `${(Math.floor(n / 100) * 100).toLocaleString("sv-SE")}+`;
}

/**
 * The grant and source counts shown in marketing copy. These were hardcoded in
 * the translation files and drifted badly — the site claimed 1 700 grants and
 * 39 sources while the database held 2 103 and 66. The fallbacks below are
 * deliberately conservative: if the request fails the page understates rather
 * than promises something we cannot show.
 */
export function usePlatformStats() {
  const { data } = useQuery<PlatformStats>({
    queryKey: ["/api/stats"],
    staleTime: 10 * 60 * 1000,
  });

  const grants = data ? floorToHundred(data.activeGrants) : "2 000+";
  const sources = data ? `${data.sources}` : "60+";

  // Translation strings interpolate {{grants}} and {{sources}}, so publishing
  // the figures to i18n updates every piece of copy at once — landing page,
  // onboarding, dashboard and the SEO descriptions.
  useEffect(() => {
    if (data) applyPlatformStats({ grants, sources });
  }, [data, grants, sources]);

  return { grants, sources, raw: data };
}
