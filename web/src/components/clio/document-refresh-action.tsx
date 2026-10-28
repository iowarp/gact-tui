import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { RefreshAction } from './refresh-button';

/** Refresh the retained document revision from the file's secondary action menu. */
export function DocumentRefreshAction({
  refreshing,
  onReviews,
  onEditorHealth,
}: {
  refreshing: boolean;
  onReviews: () => Promise<unknown>;
  onEditorHealth: () => Promise<unknown>;
}) {
  const client = useQueryClient();
  const { settings } = useConnectionSettings();
  const refresh = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.key('document-manifest', settings.endpoint) }),
      client.invalidateQueries({ queryKey: queryKeys.key('document-content', settings.endpoint) }),
      onReviews(),
      onEditorHealth(),
    ]);
  }, [client, settings.endpoint, onReviews, onEditorHealth]);
  return (
    <RefreshAction
      secondary
      label="Refresh document revision"
      refreshing={refreshing}
      onRefresh={refresh}
    />
  );
}
