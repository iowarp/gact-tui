import { lazy, Suspense, useContext, useMemo, useRef, useState, type Ref } from 'react';
import {
  BookOpenIcon,
  FileCode2Icon,
  GitBranchIcon,
  NotebookTextIcon,
  Table2Icon,
  WrapTextIcon,
} from 'lucide-react';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { renderedFileText, textFileFormat, type TextFileFormat } from '@/lib/file-presentation';
import { readNotebook } from '@/lib/notebook';
import { cn } from '@/lib/utils';
import {
  DOCUMENT_MARKDOWN_CLASS_NAME,
  READ_TYPE_SCALE,
  normalizeConvertedMarkdown,
} from '@/lib/document-markdown';
import { TABLE_SCROLL_CUE_CLASS_NAME, useTableScrollCue } from '@/lib/use-table-scroll-cue';
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

// Mermaid loads with the first diagram file opened.
const ClioMermaidDiagram = lazy(() =>
  import('./mermaid-diagram').then((module) => ({ default: module.ClioMermaidDiagram })),
);

// The CSV table loads with the first CSV file opened, not with the app (#644).
const ClioCsvView = lazy(() =>
  import('./csv-view').then((module) => ({ default: module.ClioCsvView })),
);

// The notebook reader loads with the first notebook opened.
const NotebookView = lazy(() =>
  import('./notebook-view').then((module) => ({ default: module.NotebookView })),
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
  const diagram = !explicitFormat && /\.(?:mmd|mermaid)$/i.test(name);
  const notebook = useMemo(
    () => (format === 'notebook' ? readNotebook(content) : undefined),
    [content, format],
  );
  const lines = useMemo(() => content.split('\n').length, [content]);
  useFileViewerFacts(
    notebook?.ok
      ? [
          `${notebook.notebook.cells.length.toLocaleString()} ${notebook.notebook.cells.length === 1 ? 'cell' : 'cells'}`,
          ...(notebook.notebook.kernel ? [notebook.notebook.kernel] : []),
        ]
      : format === 'csv' || dataset
        ? undefined
        : [`${lines.toLocaleString()} lines`],
  );
  const modes: FileMode[] = [
    ...(notebook ? [{ value: 'notebook', label: 'Notebook', icon: NotebookTextIcon }] : []),
    ...(diagram ? [{ value: 'diagram', label: 'Diagram', icon: GitBranchIcon }] : []),
    ...(format === 'markdown'
      ? [{ value: 'read', label: 'Read document', icon: BookOpenIcon }]
      : []),
    ...(format === 'csv' || dataset ? [{ value: 'data', label: 'Data', icon: Table2Icon }] : []),
    { value: 'source', label: 'Source', icon: FileCode2Icon, shortcut: 'render-source' },
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
    selected === 'source' || selected === 'diagram'
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
        {notebook ? (
          <TabsContent value="notebook" className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden">
            <Suspense fallback={<ResourceLoading label={`Loading ${name}`} />}>
              <NotebookView
                name={name}
                onShowSource={view ? undefined : () => setChosen('source')}
                read={notebook}
                readingRef={reading}
              />
            </Suspense>
          </TabsContent>
        ) : null}
        {format === 'markdown' ? (
          <TabsContent value="read" className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden">
            <FileReadView name={name} content={content} format={format} readingRef={reading} />
          </TabsContent>
        ) : null}
        {diagram ? (
          <TabsContent value="diagram" className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden">
            <Suspense fallback={<ResourceLoading label={`Loading ${name}`} />}>
              <ClioMermaidDiagram framed source={content} title={name} />
            </Suspense>
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
                  : format === 'json' || format === 'notebook'
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
  const tables = useRef<HTMLDivElement>(null);
  useTableScrollCue(tables);
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
          <div ref={tables} className={TABLE_SCROLL_CUE_CLASS_NAME}>
            <ContentMarkdown className={cn(DOCUMENT_MARKDOWN_CLASS_NAME, READ_TYPE_SCALE)}>
              {normalizeConvertedMarkdown(body)}
            </ContentMarkdown>
          </div>
        </div>
      </article>
    </ScrollArea>
  );
}
