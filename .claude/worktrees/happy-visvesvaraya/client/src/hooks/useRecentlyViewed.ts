import { useEffect, useState, useCallback } from 'react';

interface RecentlyViewedGrant {
  id: string;
  title: string;
  sourceName: string;
  matchScore?: number;
  viewedAt: number;
}

const STORAGE_KEY = 'getgrant_recently_viewed';
const MAX_ITEMS = 5;

export function useRecentlyViewed() {
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedGrant[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRecentlyViewed(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const addToRecentlyViewed = useCallback((grant: {
    id: string;
    title: string;
    sourceName: string;
    matchScore?: number;
  }) => {
    setRecentlyViewed(prev => {
      const filtered = prev.filter(g => g.id !== grant.id);
      const updated = [
        { ...grant, viewedAt: Date.now() },
        ...filtered,
      ].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecentlyViewed = useCallback(() => {
    setRecentlyViewed([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { recentlyViewed, addToRecentlyViewed, clearRecentlyViewed };
}
