import { useContext, useEffect, useMemo, useState } from 'react';

import { ResourceUnavailable } from './resource-states';
import { htmlPreviewDocument } from './html-preview-policy';
import { hasHtmlScripts, interactiveHtmlDocument } from './html-interactive-policy';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { DesktopHtmlFrame, HtmlRendererFrame } from './desktop-html-frame';
import { FileViewerInformationHost } from './file-viewer-context';
import { ViewerToolbarContent } from './viewer-toolbar';
import type { HtmlPreviewTextReaderChange } from './html-preview-bridge';

/** Render authored HTML and WebGL in an opaque frame with no native app bridge. */
export function HtmlPreview({
  name,
  content,
  onTextReader,
}: {
  name: string;
  content: string;
  onTextReader?: HtmlPreviewTextReaderChange;
}) {
  const sharedToolbar = useContext(FileViewerInformationHost) !== undefined;
  const scripted = useMemo(() => hasHtmlScripts(content), [content]);
  const [interactive, setInteractive] = useState<{
    content: string;
    html?: string;
    error?: string;
  }>();
  const [stopped, setStopped] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!scripted) return;
    let cancelled = false;
    void interactiveHtmlDocument(content).then(
      (html) => {
        if (!cancelled) setInteractive({ content, html });
      },
      (error: unknown) => {
        if (!cancelled)
          setInteractive({
            content,
            error:
              error instanceof Error ? error.message : 'Could not prepare interactive preview.',
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [content, scripted]);
  const preview = useMemo(() => {
    if (scripted) return interactive?.content === content ? interactive : {};
    try {
      return { html: htmlPreviewDocument(content) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not prepare HTML preview.' };
    }
  }, [content, scripted, interactive]);
  if (preview.error)
    return <ResourceUnavailable label="HTML preview unavailable" detail={preview.error} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {scripted ? (
        <ViewerToolbarContent>
          <div
            className={`flex shrink-0 justify-end gap-2 ${sharedToolbar ? '' : 'border-b px-3 py-1'}`}
          >
            <Button variant="ghost" size="sm" disabled={stopped} onClick={() => setStopped(true)}>
              Stop
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStopped(false);
                setGeneration((value) => value + 1);
              }}
            >
              Restart
            </Button>
          </div>
        </ViewerToolbarContent>
      ) : null}
      {stopped ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          Preview stopped. Restart to run it again.
        </p>
      ) : !preview.html ? (
        <Skeleton aria-label="Loading interactive preview" className="m-3 min-h-32 flex-1" />
      ) : inTauri() ? (
        <DesktopHtmlFrame
          key={`${generation}:${content}`}
          name={name}
          html={preview.html}
          onTextReader={onTextReader}
        />
      ) : (
        <HtmlRendererFrame
          key={generation}
          name={name}
          html={preview.html}
          onTextReader={onTextReader}
        />
      )}
    </div>
  );
}
