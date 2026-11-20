import type { ClioRepository } from '@clio/core/v3';
import { useEffect } from 'react';
import { OPEN_BROWSER_PAGE_EVENT, type OpenBrowserPageDetail } from '@/lib/html-in-browser';

/**
 * What the `openUrl` catalog function needs to open a loopback link
 * (`isA2uiLoopbackLink`) in the conversation's shared in-app Browser. A2UI
 * catalog functions run outside React, so the one view on screen that shows
 * A2UI surfaces (a workspace conversation, or a plugin page and its context)
 * registers the conversation here, as `kernel-runtime.ts` does for
 * `openArtifact`. Opening reveals the page through `OPEN_BROWSER_PAGE_EVENT`.
 */
export interface A2uiBrowserLinkRuntime {
  sessionId: string;
  openLink: (url: string) => Promise<void>;
}

let activeRuntime: A2uiBrowserLinkRuntime | undefined;

export function activeA2uiBrowserLinkRuntime(): A2uiBrowserLinkRuntime | undefined {
  return activeRuntime;
}

export function useA2uiBrowserLinkRuntime(
  repository: Pick<ClioRepository, 'openBrowserPage'>,
  sessionId: string | undefined,
): void {
  useEffect(() => {
    if (!sessionId) return;
    const runtime: A2uiBrowserLinkRuntime = {
      sessionId,
      openLink: async (url) => {
        const page = await repository.openBrowserPage(sessionId, url);
        window.dispatchEvent(
          new CustomEvent<OpenBrowserPageDetail>(OPEN_BROWSER_PAGE_EVENT, {
            detail: { pageId: page.id, sessionId, label: page.title || page.host || url },
          }),
        );
      },
    };
    activeRuntime = runtime;
    return () => {
      if (activeRuntime === runtime) activeRuntime = undefined;
    };
  }, [repository, sessionId]);
}
