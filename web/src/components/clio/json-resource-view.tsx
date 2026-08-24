import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClioDataTable } from './data-table';
import { tabularJsonDataset } from './json-resource-data';

/** Renders homogeneous JSON records through the shared ReUI data grid while preserving source. */
export function ClioJsonResourceView({ content, title }: { content: string; title: string }) {
  const dataset = tabularJsonDataset(content, title);
  if (!dataset) return <JsonSource content={content} title={title} />;

  return (
    <Tabs className="min-w-0" defaultValue="data">
      <TabsList>
        <TabsTrigger value="data">Data</TabsTrigger>
        <TabsTrigger value="source">Source</TabsTrigger>
      </TabsList>
      <TabsContent className="min-w-0 pt-3" value="data">
        <ClioDataTable columns={dataset.columns} label={dataset.label} rows={dataset.rows} />
        {dataset.rows.length < dataset.totalRows ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the first {dataset.rows.length.toLocaleString()} of{' '}
            {dataset.totalRows.toLocaleString()} records. The complete JSON remains available in
            Source.
          </p>
        ) : null}
      </TabsContent>
      <TabsContent className="min-w-0 pt-3" value="source">
        <JsonSource content={content} title={title} />
      </TabsContent>
    </Tabs>
  );
}

function JsonSource({ content, title }: { content: string; title: string }) {
  return (
    <CodeBlock code={content} language="json" showLineNumbers>
      <CodeBlockHeader>
        <CodeBlockTitle>
          <CodeBlockFilename>{title}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton aria-label={`Copy ${title}`} size="icon-xs" />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}
