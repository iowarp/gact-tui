import type { BrowserPage } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { BrowserFrame } from './browser-frame';
import { FrameCommentsUnavailable } from './comments/frame-comments';
import { browserPagesKey, normalizeBrowserAddress } from './use-browser-pages';

export interface BrowserNewPageProps {
  sessionId: string;
  onOpened: (page: BrowserPage) => void;
  /**
   * Opens the address instead of this conversation's page call: a new
   * conversation has no session yet, so its page starts the conversation.
   * Resolves once the page is open somewhere the person is taken to.
   */
  open?: (url: string) => Promise<BrowserPage | undefined>;
}

/** The first-use Chromium download answers "preparing"; the open waits it out. */
const PREPARING = 'browser_runtime_preparing';
const PREPARING_RETRY_MS = 5_000;
const PREPARING_LIMIT_MS = 10 * 60_000;

/**
 * A New page tab: the browser frame with nothing open yet and its address
 * field focused. The page opens in the shared browser, and the tab becomes it
 * with the same frame row, so nothing moves.
 */
export function BrowserNewPage({ sessionId, onOpened, open }: BrowserNewPageProps) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const [preparing, setPreparing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    // StrictMode runs effects twice in development: mark it mounted again each time.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const openPage = async (url: string): Promise<BrowserPage | undefined> => {
    const started = Date.now();
    for (;;) {
      try {
        return await (open ? open(url) : repository.openBrowserPage(sessionId, url));
      } catch (reason) {
        const text = reason instanceof Error ? reason.message : '';
        if (!text.includes(PREPARING) || Date.now() - started > PREPARING_LIMIT_MS) throw reason;
        if (!mounted.current) return undefined;
        setPreparing(true);
        await new Promise((resolve) => setTimeout(resolve, PREPARING_RETRY_MS));
        if (!mounted.current) return undefined;
      }
    }
  };

  const submit = (address: string) => {
    if (pending) return;
    const url = normalizeBrowserAddress(address);
    if (!url) {
      setError('Enter a web address, like example.org');
      return;
    }
    setPending(url);
    setError(undefined);
    openPage(url)
      .then((page) => {
        if (!page || !mounted.current) return;
        void queryClient.invalidateQueries({
          queryKey: browserPagesKey(settings.endpoint, page.session_id || sessionId),
        });
        onOpened(page);
      })
      .catch((reason: unknown) => {
        if (!mounted.current) return;
        setError(reason instanceof Error ? reason.message : 'The page did not open.');
      })
      .finally(() => {
        if (!mounted.current) return;
        setPending(undefined);
        setPreparing(false);
      });
  };

  return (
    <BrowserFrame
      autoFocus
      comments={<FrameCommentsUnavailable reason="Open a page to comment on it" />}
      describedBy={error ? 'browser-new-page-error' : undefined}
      editable={!pending}
      facts={pending ? <span>Opening</span> : undefined}
      invalid={Boolean(error)}
      label="New page"
      loading={Boolean(pending)}
      loadingLabel={preparing ? 'Downloading the browser' : 'Opening the page'}
      onGo={submit}
      url={pending ?? ''}
    >
      {error || preparing ? (
        <p
          className={
            error
              ? 'px-4 py-3 text-[12.5px] text-destructive'
              : 'px-4 py-3 text-[12.5px] text-muted-foreground'
          }
          id={error ? 'browser-new-page-error' : undefined}
          role={error ? 'alert' : 'status'}
        >
          {error ??
            'Downloading the browser for this computer (first use only). The page opens when it is ready.'}
        </p>
      ) : null}
    </BrowserFrame>
  );
}
