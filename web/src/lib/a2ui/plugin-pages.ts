import type { PluginPage } from '@clio/core/v3';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { readRetryDelayMs, serviceStillStarting } from '@/lib/connection-attempt';
import { connectionScope } from '@/lib/connection-scope';
import { STARTING_READ_RETRIES } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { readStoredPluginPages, storePluginPages } from './plugin-page-snapshot';

/** Where a plugin's primary page opens. */
export function pluginPageRoute(page: Pick<PluginPage, 'plugin' | 'page'>): string {
  return `/plugins/${encodeURIComponent(page.plugin)}/${encodeURIComponent(page.page)}`;
}

/**
 * The pages installed plugins add to the left bar (one each at most). They are
 * global: no conversation owns them. A service without them lists none.
 */
/** Each page's context session, so a request it raises opens the page, not a conversation. */
const pageRouteByContext = new Map<string, string>();

/** The page a context session belongs to, once the pages have been read. */
export function pluginPageRouteForContext(sessionId: string): string | undefined {
  return pageRouteByContext.get(sessionId);
}

function rememberContexts(pages: readonly PluginPage[]): readonly PluginPage[] {
  for (const page of pages)
    if (page.context_session_id)
      pageRouteByContext.set(page.context_session_id, pluginPageRoute(page));
  return pages;
}

export function usePluginPagesQuery() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  return useQuery<readonly PluginPage[]>({
    queryKey: ['plugin-pages', scope],
    queryFn: async ({ signal }) => {
      const pages = rememberContexts(await repository.pluginPages(signal));
      storePluginPages(scope, pages);
      return pages;
    },
    // The last list read, so the left bar and a page route resolve before the service answers.
    placeholderData: () => {
      const stored = readStoredPluginPages(scope);
      return stored ? rememberContexts(stored) : undefined;
    },
    retry: (failures, error) => serviceStillStarting(error) && failures < STARTING_READ_RETRIES,
    retryDelay: readRetryDelayMs,
    staleTime: 30_000,
  });
}

const NONE: readonly PluginPage[] = [];

export function usePluginPages(): readonly PluginPage[] {
  return usePluginPagesQuery().data ?? NONE;
}

/** A plugin was installed, trusted or updated: its page, title or icon may have changed. */
export function invalidatePluginPages(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['plugin-pages'] });
}
