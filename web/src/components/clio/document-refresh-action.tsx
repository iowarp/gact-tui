import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { RefreshAction } from './refresh-button';
import { t } from '@lingui/core/macro';

/** Refresh the retained document revision from the file's secondary action menu. */
export function DocumentRefreshAction({
  refreshing,
  onReviews,
}: {
  refreshing: boolean;
  onReviews: () => Promise<unknown>;
}) {
  const client = useQueryClient();
  const { settings } = useConnectionSettings();
  const refresh = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.key('document-manifest', settings.endpoint) }),
      client.invalidateQueries({ queryKey: queryKeys.key('document-content', settings.endpoint) }),
      onReviews(),
    ]);
  }, [client, settings.endpoint, onReviews]);
  return (
    <RefreshAction
      secondary
      label={t`Refresh document revision`}
      refreshing={refreshing}
      onRefresh={refresh}
    />
  );
}
