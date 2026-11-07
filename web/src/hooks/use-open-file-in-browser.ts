import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import {
  OPEN_BROWSER_PAGE_EVENT,
  type BrowserFileTarget,
  type OpenBrowserPageDetail,
} from '@/lib/html-in-browser';

/** Open an HTML file in the conversation's shared browser and show its tab. */
export function useOpenFileInBrowser(): (
  target: BrowserFileTarget,
  label: string,
) => Promise<void> {
  const repository = useRepository();
  const { sessionId = '' } = useParams();
  return useCallback(
    async (target, label) => {
      if (!sessionId) {
        toast.error('Open a conversation to view HTML files in its browser.');
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
        toast.error(
          error instanceof Error ? error.message : 'Could not open the file in the browser.',
        );
      }
    },
    [repository, sessionId],
  );
}
