import { useContext, useEffect, useMemo, useState } from 'react';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResourceUnavailable } from './resource-states';
import { htmlPreviewDocument } from './html-preview-policy';
import { hasHtmlScripts, interactiveHtmlDocument } from './html-interactive-policy';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { DesktopHtmlFrame, HtmlRendererFrame } from './desktop-html-frame';
import { FileViewerInformationHost } from './file-viewer-context';
import { ViewerToolbarContent } from './viewer-toolbar';

/** Render authored HTML and WebGL in an opaque frame with no native app bridge. */
export function HtmlPreview({ name, content }: { name: string; content: string }) {
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
        <DesktopHtmlFrame key={`${generation}:${content}`} name={name} html={preview.html} />
      ) : (
        <HtmlRendererFrame key={generation} name={name} html={preview.html} />
      )}
    </div>
  );
}

/** File and upload HTML previews retain their exact source in a peer view. */
export function HtmlFilePreview({
  name,
  content,
  view,
}: {
  name: string;
  content: string;
  /** File hosts own navigation in their existing toolbar. */
  view?: 'preview' | 'source';
}) {
  if (view === 'preview') return <HtmlPreview name={name} content={content} />;
  if (view === 'source') return <HtmlSource name={name} content={content} />;
  return (
    <Tabs defaultValue="preview" className="flex h-full min-h-0 min-w-0 flex-col gap-0">
      <div className="flex min-w-0 items-center gap-2 border-b px-3 py-1">
        <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
        <TabsList aria-label="HTML file view">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="source">Source</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="preview" className="m-0 min-h-0 flex-1 overflow-hidden">
        <HtmlPreview name={name} content={content} />
      </TabsContent>
      <TabsContent value="source" className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden">
        <HtmlSource name={name} content={content} />
      </TabsContent>
    </Tabs>
  );
}

function HtmlSource({ name, content }: { name: string; content: string }) {
  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden p-3">
      <CodeBlock className="h-full" code={content} language="html" showLineNumbers>
        <CodeBlockCopyButton aria-label={`Copy ${name}`} />
      </CodeBlock>
    </div>
  );
}
