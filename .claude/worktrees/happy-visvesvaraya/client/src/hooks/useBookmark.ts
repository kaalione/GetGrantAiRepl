import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export function useBookmark(grantId: string) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ bookmarked: boolean }>({
    queryKey: ['/api/bookmarks/check', grantId],
    enabled: !!grantId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/bookmarks', { grantId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks/check', grantId] });
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks'] });
      toast({ title: t('bookmarks.added') });
    },
    onError: () => {
      toast({ title: t('bookmarks.error'), variant: 'destructive' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/bookmarks/${grantId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks/check', grantId] });
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks'] });
      toast({ title: t('bookmarks.removed') });
    },
    onError: () => {
      toast({ title: t('bookmarks.error'), variant: 'destructive' });
    },
  });

  const toggleBookmark = () => {
    if (data?.bookmarked) {
      removeMutation.mutate();
    } else {
      addMutation.mutate();
    }
  };

  return {
    bookmarked: data?.bookmarked ?? false,
    loading: isLoading,
    toggling: addMutation.isPending || removeMutation.isPending,
    toggleBookmark,
  };
}
