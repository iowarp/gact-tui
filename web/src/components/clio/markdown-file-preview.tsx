import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import { MessageResponse } from '@/components/ai-elements/message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DOCUMENT_MARKDOWN_CLASS_NAME, normalizeConvertedMarkdown } from '@/lib/document-markdown';

/** Render Markdown as a document by default, retaining exact source on demand. */
export function MarkdownFilePreview({ name, content }: { name: string; content: string }) {
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(content);
  const body = frontmatter ? content.slice(frontmatter[0].length) : content;
  return (
    <Tabs defaultValue="preview" className="flex h-full min-h-0 min-w-0 flex-col gap-2 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{name}</span>
        <TabsList aria-label="Markdown file view">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="source">Source</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="preview" className="min-h-0 min-w-0 flex-1">
        <ScrollArea
          className="h-full min-w-0 rounded-md border bg-muted/40"
          viewportProps={{ className: '[&>div]:!block [&>div]:min-w-0 [&>div]:w-full' }}
        >
          <article className="min-w-0 p-3">
            {frontmatter ? (
              <details className="mb-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Document metadata
                </summary>
                <CodeBlock code={frontmatter[1]} language="yaml" />
              </details>
            ) : null}
            <MessageResponse className={DOCUMENT_MARKDOWN_CLASS_NAME}>
              {normalizeConvertedMarkdown(body)}
            </MessageResponse>
          </article>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="source" className="min-h-0 min-w-0 flex-1">
        <CodeBlock className="h-full" code={content} language="markdown" showLineNumbers>
          <CodeBlockCopyButton aria-label={`Copy ${name}`} />
        </CodeBlock>
      </TabsContent>
    </Tabs>
  );
}
