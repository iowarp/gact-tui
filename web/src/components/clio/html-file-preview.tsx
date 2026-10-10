import { useMemo } from 'react';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResourceUnavailable } from './resource-states';
import { htmlPreviewDocument } from './html-preview-policy';

/** Display HTML/CSS/SVG in an opaque, script-free frame with no external resources. */
export function HtmlPreview({ name, content }: { name: string; content: string }) {
  const preview = useMemo(() => {
    try {
      return { html: htmlPreviewDocument(content) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not prepare HTML preview.' };
    }
  }, [content]);
  if (preview.error)
    return <ResourceUnavailable label="HTML preview unavailable" detail={preview.error} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 px-3 py-1.5 text-xs text-muted-foreground">
        Static preview · Scripts and external resources are disabled. Open in a browser to run this
        HTML.
      </p>
      <iframe
        className="min-h-0 w-full flex-1 border-0 bg-white"
        title={`HTML preview of ${name}`}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={preview.html}
      />
    </div>
  );
}

/** File and upload HTML previews retain their exact source in a peer view. */
export function HtmlFilePreview({ name, content }: { name: string; content: string }) {
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
      <TabsContent value="source" className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden p-3">
        <CodeBlock className="h-full" code={content} language="html" showLineNumbers>
          <CodeBlockCopyButton aria-label={`Copy ${name}`} />
        </CodeBlock>
      </TabsContent>
    </Tabs>
  );
}
