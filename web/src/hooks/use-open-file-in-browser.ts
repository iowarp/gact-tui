import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import {
  OPEN_BROWSER_PAGE_EVENT,
  browserFileFailure,
  type BrowserFileTarget,
  type OpenBrowserPageDetail,
} from '@/lib/html-in-browser';
import { t } from '@lingui/core/macro';

/**
 * Open an HTML file in the conversation's shared browser and show its tab. A failure is
 * one plain sentence: handed to `onError` when given, else a toast.
 */
export function useOpenFileInBrowser(): (
  target: BrowserFileTarget,
  label: string,
  onError?: (message: string) => void,
) => Promise<void> {
  const repository = useRepository();
  const { sessionId = '' } = useParams();
  return useCallback(
    async (target, label, onError) => {
      const fail = onError ?? ((message: string) => toast.error(message));
      if (!sessionId) {
        fail(t`Open a conversation to view HTML files in its browser.`);
        return;
      }
      try {
        const page = await repository.openBrowserFile(sessionId, target);
        window.dispatchEvent(
          new CustomEvent<OpenBrowserPageDetail>(OPEN_BROWSER_PAGE_EVENT, {
            detail: { pageId: page.id, sessionId, label: page.title || label },
          }),
        );
      } catch (error) {
        fail(browserFileFailure(error instanceof Error ? error.message : '', label));
      }
    },
    [repository, sessionId],
  );
}
