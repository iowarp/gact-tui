import type { BrowserPage } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { livePollInterval, useLiveStreamHealthy } from '@/hooks/use-live-poll-interval';
import { t } from '@lingui/core/macro';

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
  return page.label || page.title || page.host || t`Browser`;
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/|$)/iu;

/**
 * The address a person typed, as the URL the shared browser opens: a bare
 * host gets `https://` (`http://` for this computer). Only web addresses
 * open; anything else returns undefined.
 */
export function normalizeBrowserAddress(text: string): string | undefined {
  const value = text.trim();
  if (!value || /\s/u.test(value)) return undefined;
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//iu.test(value);
  if (!hasScheme && !LOCAL_HOST.test(value) && !/^[^/]+\.[^/]+/u.test(value)) return undefined;
  const candidate = hasScheme ? value : `${LOCAL_HOST.test(value) ? 'http' : 'https'}://${value}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
