import { Suspense, lazy, useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { OPEN_BROWSER_PAGE_EVENT, type OpenBrowserPageDetail } from '@/lib/html-in-browser';
import { StateView } from './primitives/state-view';
import { t } from '@lingui/core/macro';

const BrowserSurface = lazy(() =>
  import('./browser-surface').then((module) => ({ default: module.BrowserSurface })),
);

/**
 * A plugin page has no workbench, so a page its view opens in the shared
 * in-app Browser (a sign-in page on CLIO's computer, for example) shows here,
 * beside the page, for the page's own context conversation.
 */
export function PluginPageBrowser({ sessionId }: { sessionId: string | undefined }) {
  const [page, setPage] = useState<OpenBrowserPageDetail>();
  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<OpenBrowserPageDetail>).detail;
      if (sessionId && detail.sessionId === sessionId) setPage(detail);
    };
    window.addEventListener(OPEN_BROWSER_PAGE_EVENT, show);
    return () => window.removeEventListener(OPEN_BROWSER_PAGE_EVENT, show);
  }, [sessionId]);
  return (
    <Sheet open={Boolean(page)} onOpenChange={(open) => (open ? undefined : setPage(undefined))}>
      <SheetContent
        aria-describedby={undefined}
        className="w-full gap-0 p-0 pt-10 data-[side=right]:sm:max-w-[min(960px,90vw)]"
        data-slot="plugin-page-browser"
        side="right"
      >
        <SheetTitle className="sr-only">{page?.label ?? ''}</SheetTitle>
        {page ? (
          <div className="min-h-0 flex-1">
            <Suspense
              fallback={<StateView kind="loading" size="viewer" title={t`Opening the page`} />}
            >
              <BrowserSurface
                key={page.pageId}
                label={page.label}
                pageId={page.pageId}
                sessionId={page.sessionId}
              />
            </Suspense>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
