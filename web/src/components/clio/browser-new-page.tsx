import type { BrowserPage } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { AddIcon } from '@/lib/icon-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ListRow } from './primitives/list-row';
import { browserPagesKey, normalizeBrowserAddress } from './use-browser-pages';

export interface BrowserNewPageProps {
  sessionId: string;
  /**
   * Start with the address field open and focused: the Browser list was
   * opened with no pages, so it opens one. Read once, when the row mounts.
   */
  startOpen?: boolean;
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
 * The Browser list's first row. "New page" turns into an address field; the
 * page opens in the shared browser and then as a tab.
 */
export function BrowserNewPage({
  sessionId,
  startOpen = false,
  onOpened,
  open,
}: BrowserNewPageProps) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [editing, setEditing] = useState(startOpen);
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string>();
  const [opening, setOpening] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

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

  const close = () => {
    setEditing(false);
    setAddress('');
    setError(undefined);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (opening) return;
    const url = normalizeBrowserAddress(address);
    if (!url) {
      setError('Enter a web address, like example.org');
      return;
    }
    setOpening(true);
    setError(undefined);
    openPage(url)
      .then((page) => {
        if (!page || !mounted.current) return;
        void queryClient.invalidateQueries({
          queryKey: browserPagesKey(settings.endpoint, page.session_id || sessionId),
        });
        close();
        onOpened(page);
      })
      .catch((reason: unknown) => {
        if (!mounted.current) return;
        setError(reason instanceof Error ? reason.message : 'The page did not open.');
      })
      .finally(() => {
        if (!mounted.current) return;
        setOpening(false);
        setPreparing(false);
      });
  };

  if (!editing)
    return (
      <div role="listitem">
        <ListRow
          className="cursor-pointer"
          icon={<AddIcon />}
          onClick={() => setEditing(true)}
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            setEditing(true);
          }}
          role="button"
          tabIndex={0}
          title="New page"
        />
      </div>
    );

  return (
    <div className="px-0.5 py-0.5" role="listitem">
      <form aria-label="New page" onSubmit={submit}>
        <div className="flex h-7 items-center gap-2 px-1.5">
          <span
            aria-hidden="true"
            className="grid size-4 shrink-0 place-items-center text-muted-foreground"
          >
            <AddIcon className="size-4" />
          </span>
          <Input
            aria-describedby={error ? 'browser-new-page-error' : undefined}
            aria-invalid={error ? true : undefined}
            aria-label="Address"
            autoComplete="off"
            autoFocus
            className="h-6 min-w-0 flex-1 px-1.5 text-[12.5px]"
            disabled={opening}
            inputMode="url"
            onChange={(event) => {
              setAddress(event.target.value);
              if (error) setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
            }}
            placeholder="Enter an address"
            spellCheck={false}
            value={address}
          />
        </div>
        {opening || error ? (
          <p
            className={
              error
                ? 'px-2 pt-0.5 pb-1 text-[11.5px] text-destructive'
                : 'px-2 pt-0.5 pb-1 text-[11.5px] text-muted-foreground'
            }
            id={error ? 'browser-new-page-error' : undefined}
            role={error ? 'alert' : 'status'}
          >
            {error ??
              (preparing
                ? 'Downloading the browser for this computer (first use only). The page opens when it is ready.'
                : 'Opening the page')}
          </p>
        ) : null}
      </form>
    </div>
  );
}
