import { GlobeIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOpenFileInBrowser } from '@/hooks/use-open-file-in-browser';
import type { BrowserFileTarget } from '@/lib/html-in-browser';
import { FileTextView } from './file-text-view';
import { t } from '@lingui/core/macro';

/**
 * An HTML file where a viewer would have previewed it: it opens in the browser when shown
 * (`openOnShow`, a viewer the person opened), and here shows its source with the control
 * that opens it again.
 */
export function HtmlFileInBrowser({
  name,
  content,
  path,
  artifactId,
  openOnShow = false,
}: {
  name: string;
  content: string;
  /** The workspace file's path; or `artifactId` for an artifact's file. */
  path?: string;
  artifactId?: string;
  openOnShow?: boolean;
}) {
  const open = useOpenFileInBrowser();
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<string>();
  const opened = useRef(false);
  const show = useCallback(() => {
    const target: BrowserFileTarget | undefined = artifactId
      ? { artifact_id: artifactId }
      : path
        ? { path }
        : undefined;
    if (!target) return;
    setOpening(true);
    setFailure(undefined);
    // A refusal reads in the bar, where the person is looking, not as a toast.
    void open(target, name, setFailure).finally(() => setOpening(false));
  }, [artifactId, name, open, path]);
  useEffect(() => {
    if (!openOnShow || opened.current) return;
    opened.current = true;
    show();
  }, [openOnShow, show]);
  return (
    <div className="flex h-full min-h-0 flex-col" data-slot="html-file-in-browser">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        <GlobeIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        {failure ? (
          <span className="min-w-0 flex-1" role="alert">
            <span className="font-medium">{t`Couldn't open it in the browser.`}</span>{' '}
            <span className="text-muted-foreground">{failure}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-muted-foreground">
            {t`HTML files open in the shared browser, where their scripts run.`}
          </span>
        )}
        <Button disabled={opening} onClick={show} size="sm" variant="secondary">
          {t`Open in browser`}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <FileTextView content={content} format="html" name={name} view="source" />
      </div>
    </div>
  );
}
