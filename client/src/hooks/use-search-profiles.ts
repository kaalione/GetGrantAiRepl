import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { SearchProfile } from "@shared/schema";

const STORAGE_KEY = "gg.selectedProfileId";

async function fetchProfiles(): Promise<SearchProfile[]> {
  const res = await fetch("/api/profiles", { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export interface CreateProfileInput {
  companyId: string;
  name: string;
  description?: string;
  goals?: string;
  budgetSek?: number;
  timeframe?: string;
  focusAreas?: string[];
  keywords?: string[];
  createdFrom?: "wizard" | "document";
  sourceDocumentPath?: string;
  extraction?: Record<string, unknown>;
}

export function useSearchProfiles() {
  const queryClient = useQueryClient();
  const { data: profiles, isLoading } = useQuery<SearchProfile[]>({
    queryKey: ["/api/profiles"],
    queryFn: fetchProfiles,
    staleTime: 60_000,
  });

  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
  );

  // Fall back to the default (core) profile when nothing valid is selected.
  const selectedProfile =
    profiles?.find((p) => p.id === selectedId) ??
    profiles?.find((p) => p.isDefault) ??
    profiles?.[0] ??
    null;

  useEffect(() => {
    if (profiles && selectedId && !profiles.some((p) => p.id === selectedId)) {
      localStorage.removeItem(STORAGE_KEY);
      setSelectedId(null);
    }
  }, [profiles, selectedId]);

  const selectProfile = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setSelectedId(id);
  }, []);

  const createProfile = useMutation({
    mutationFn: async (input: CreateProfileInput): Promise<SearchProfile> => {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error(body?.message || body?.error || `${res.status}`) as Error & {
          upgrade?: boolean;
        };
        err.upgrade = body?.upgrade === true;
        throw err;
      }
      return body;
    },
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      selectProfile(profile.id);
    },
  });

  return { profiles: profiles ?? [], isLoading, selectedProfile, selectProfile, createProfile };
}
