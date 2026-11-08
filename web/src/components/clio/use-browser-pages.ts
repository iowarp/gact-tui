import type { BrowserPage } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { livePollInterval, useLiveStreamHealthy } from '@/hooks/use-live-poll-interval';

/** The query key of one session's browser pages; `browser.page.*` events invalidate it. */
export function browserPagesKey(endpoint: string, sessionId: string) {
  return ['browser-pages', endpoint, sessionId] as const;
}

/** A session's open browser pages (the agent's and the person's), for the rail and tabs. */
export function useBrowserPages(sessionId: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const streamHealthy = useLiveStreamHealthy();
  return useQuery({
    queryKey: browserPagesKey(settings.endpoint, sessionId),
    queryFn: ({ signal }) => repository.browserPages(sessionId, signal),
    enabled: Boolean(sessionId),
    refetchInterval: livePollInterval(10_000, streamHealthy),
  });
}

/** The label a page's tab and rail row use: its session's name, then its title or host. */
export function browserPageLabel(page: Pick<BrowserPage, 'label' | 'title' | 'host'>): string {
  return page.label || page.title || page.host || 'Browser';
}
