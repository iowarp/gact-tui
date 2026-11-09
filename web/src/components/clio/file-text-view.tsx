import { lazy, Suspense, useContext, useMemo, useRef, useState, type Ref } from 'react';
import { BookOpenIcon, FileCode2Icon, Table2Icon, WrapTextIcon } from 'lucide-react';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { renderedFileText, textFileFormat, type TextFileFormat } from '@/lib/file-presentation';
import { cn } from '@/lib/utils';
import { DOCUMENT_MARKDOWN_CLASS_NAME, normalizeConvertedMarkdown } from '@/lib/document-markdown';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileSourceOptions, FileViewerInformationHost } from './file-viewer-context';
import { useFileViewerFacts } from './file-viewer-facts';
import { FileModeControls, type FileMode } from './file-mode-controls';
import { FrameContentsCopyButton } from './file-viewer-take';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { TextFileCopyAction } from './text-file-copy-action';
import { FileSourceView } from './file-source-view';
import { ContentMarkdown } from './content-markdown';
import { FileDataGrid } from './file-data-grid';
import { readDenseGridText } from './primitives/dense-grid-data';
import { tabularJsonDataset } from './json-resource-data';
import { ResourceLoading } from './resource-states';

// The CSV table loads with the first CSV file opened, not with the app (#644).
const ClioCsvView = lazy(() =>
  import('./csv-view').then((module) => ({ default: module.ClioCsvView })),
);

/** A file's content contributes representations and Copy to one owning toolbar. */
export function FileTextView({
  name,
  content,
  mediaType,
  format: explicitFormat,
  view,
}: {
  name: string;
  content: string;
  mediaType?: string;
  format?: TextFileFormat;
  view?: 'preview' | 'source';
}) {
  const shared = useContext(FileViewerInformationHost) !== undefined;
  const inherited = useContext(FileSourceOptions);
  const [wrap, setWrap] = useState(false);
  const localOptions = useMemo(() => ({ wrap, setWrap }), [wrap]);
  const options = inherited ?? localOptions;
  const format = explicitFormat ?? textFileFormat(name, mediaType);
  const dataset = useMemo(
    () => (format === 'json' ? tabularJsonDataset(content, name) : undefined),
    [content, format, name],
  );
  const lines = useMemo(() => content.split('\n').length, [content]);
  useFileViewerFacts(format === 'csv' || dataset ? undefined : [`${lines.toLocaleString()} lines`]);
  const modes: FileMode[] = [
    ...(format === 'markdown'
      ? [{ value: 'read', label: 'Read document', icon: BookOpenIcon }]
      : []),
    ...(format === 'csv' || dataset ? [{ value: 'data', label: 'Data', icon: Table2Icon }] : []),
    { value: 'source', label: 'Source', icon: FileCode2Icon },
  ];
  const [chosen, setChosen] = useState(modes[0].value);
  const selected = view
    ? view === 'source'
      ? 'source'
      : modes[0].value
    : modes.some((mode) => mode.value === chosen)
      ? chosen
      : modes[0].value;
  const reading = useRef<HTMLDivElement>(null);
  const readText = () =>
    selected === 'source'
      ? content
      : selected === 'data'
        ? (readDenseGridText(reading.current) ?? renderedFileText(reading.current, true))
        : renderedFileText(reading.current);
  const modeControls = !view ? (
    <FileModeControls modes={modes} value={selected} onChange={setChosen} />
  ) : null;
  return (
    <FileSourceOptions.Provider value={options}>
      <Tabs
        value={selected}
        onValueChange={setChosen}
        className="@container/viewer flex h-full min-h-0 min-w-0 flex-col gap-0"
        data-slot="file-text-view"
      >
        {shared ? (
          <ViewerToolbarContent>
            {modeControls}
            <TextFileCopyAction name={name} readText={readText} />
          </ViewerToolbarContent>
        ) : (
          <TooltipProvider delayDuration={200}>
            <FrameBar
              label="File"
              where={<FrameCrumbs parts={[{ label: name }]} />}
              format={modeControls}
              actions={
                <>
                  <FrameContentsCopyButton read={readText} />
                  {selected === 'source' ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <ToolbarAction label="File actions">
                          <MoreIcon aria-hidden="true" />
                        </ToolbarAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuCheckboxItem
                          checked={options.wrap}
                          onSelect={() => options.setWrap(!options.wrap)}
                        >
                          <WrapTextIcon aria-hidden="true" />
                          Wrap long lines
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </>
              }
            />
          </TooltipProvider>
        )}
        {format === 'markdown' ? (
          <TabsContent value="read" className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden">
            <FileReadView name={name} content={content} format={format} readingRef={reading} />
          </TabsContent>
        ) : null}
        {format === 'csv' || dataset ? (
          <TabsContent value="data" className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="h-full min-h-0 min-w-0" ref={reading}>
              {format === 'csv' ? (
                <Suspense fallback={<ResourceLoading label={`Loading ${name}`} />}>
                  <ClioCsvView content={content} title={name} />
                </Suspense>
              ) : dataset ? (
                <FileDataGrid
                  columns={dataset.columns}
                  fact={`${dataset.totalRows.toLocaleString()} records`}
                  label={dataset.label}
                  rows={dataset.rows}
                  status={
                    dataset.rows.length < dataset.totalRows ? (
                      <span className="min-w-0 truncate">
                        Showing {dataset.rows.length.toLocaleString()} of{' '}
                        {dataset.totalRows.toLocaleString()} records. Source retains the complete
                        file.
                      </span>
                    ) : undefined
                  }
                />
              ) : null}
            </div>
          </TabsContent>
        ) : null}
        <TabsContent
          value="source"
          aria-label="Source"
          aria-labelledby={undefined}
          className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <FileSourceView
            name={name}
            content={content}
            language={
              format === 'markdown'
                ? 'markdown'
                : format === 'html'
                  ? 'html'
                  : format === 'json'
                    ? 'json'
                    : undefined
            }
          />
        </TabsContent>
      </Tabs>
    </FileSourceOptions.Provider>
  );
}

/** One readable renderer for workspace files, uploads, and registered documents. */
export function FileReadView({
  content,
  readingRef,
}: {
  name: string;
  content: string;
  format: 'markdown';
  readingRef?: Ref<HTMLDivElement>;
}) {
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(content);
  const body = frontmatter ? content.slice(frontmatter[0].length) : content;
  return (
    <ScrollArea
      className="h-full min-w-0"
      viewportProps={{ className: '[&>div]:!block [&>div]:min-w-0 [&>div]:w-full' }}
    >
      <article className="mx-auto min-w-0 w-full max-w-[80ch] px-5 py-4">
        {frontmatter ? (
          <details className="mb-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Document metadata</summary>
            <CodeBlock code={frontmatter[1]} language="yaml" />
          </details>
        ) : null}
        <div ref={readingRef}>
          <ContentMarkdown className={cn(DOCUMENT_MARKDOWN_CLASS_NAME, 'text-base leading-7')}>
            {normalizeConvertedMarkdown(body)}
          </ContentMarkdown>
        </div>
      </article>
    </ScrollArea>
  );
}
