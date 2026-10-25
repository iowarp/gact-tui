import { useCallback, useContext, useMemo, useRef, useState, type Ref } from 'react';
import { BookOpenIcon, EyeIcon, FileCode2Icon, Table2Icon, WrapTextIcon } from 'lucide-react';
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
import { FileModeControls, type FileMode } from './file-mode-controls';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { TextFileCopyAction } from './text-file-copy-action';
import { FileSourceView } from './file-source-view';
import { ContentMarkdown } from './content-markdown';
import { ClioCsvView } from './csv-view';
import { ClioDataTable } from './data-table';
import { tabularJsonDataset } from './json-resource-data';
import { HtmlPreview } from './html-preview';
import type { HtmlPreviewTextReaderChange } from './html-preview-bridge';

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
  const modes: FileMode[] = [
    ...(format === 'markdown'
      ? [{ value: 'read', label: 'Read document', icon: BookOpenIcon }]
      : []),
    ...(format === 'html' ? [{ value: 'read', label: 'HTML preview', icon: EyeIcon }] : []),
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
  const htmlReader = useRef<(() => Promise<string>) | undefined>(undefined);
  const [htmlReady, setHtmlReady] = useState(false);
  const registerHtmlReader = useCallback((reader?: () => Promise<string>) => {
    htmlReader.current = reader;
    setHtmlReady(Boolean(reader));
  }, []);
  const controls = (
    <>
      {!view ? <FileModeControls modes={modes} value={selected} onChange={setChosen} /> : null}
      <TextFileCopyAction
        name={name}
        disabled={selected === 'read' && format === 'html' && !htmlReady}
        readText={() =>
          selected === 'source'
            ? content
            : format === 'html'
              ? htmlReader.current?.()
              : renderedFileText(reading.current, selected === 'data')
        }
      />
      {!shared && selected === 'source' ? (
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
  );
  return (
    <FileSourceOptions.Provider value={options}>
      <Tabs
        value={selected}
        onValueChange={setChosen}
        className="@container/viewer flex h-full min-h-0 min-w-0 flex-col gap-0"
        data-slot="file-text-view"
      >
        {shared ? (
          <ViewerToolbarContent>{controls}</ViewerToolbarContent>
        ) : (
          <div
            className="flex h-10 shrink-0 items-center gap-1 border-b px-2"
            data-slot="viewer-toolbar"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            {controls}
          </div>
        )}
        {format === 'markdown' || format === 'html' ? (
          <TabsContent value="read" className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden">
            <FileReadView
              name={name}
              content={content}
              format={format}
              readingRef={reading}
              onHtmlTextReader={registerHtmlReader}
            />
          </TabsContent>
        ) : null}
        {format === 'csv' || dataset ? (
          <TabsContent value="data" className="m-0 min-h-0 min-w-0 flex-1 overflow-auto p-3">
            <div ref={reading}>
              {format === 'csv' ? (
                <ClioCsvView content={content} title={name} />
              ) : dataset ? (
                <>
                  <ClioDataTable
                    columns={dataset.columns}
                    label={dataset.label}
                    rows={dataset.rows}
                    showLabel={false}
                    showToolbar={false}
                  />
                  {dataset.rows.length < dataset.totalRows ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Showing {dataset.rows.length.toLocaleString()} of{' '}
                      {dataset.totalRows.toLocaleString()} records. Source retains the complete
                      file.
                    </p>
                  ) : null}
                </>
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
  name,
  content,
  format,
  readingRef,
  onHtmlTextReader,
}: {
  name: string;
  content: string;
  format: 'markdown' | 'html';
  readingRef?: Ref<HTMLDivElement>;
  onHtmlTextReader?: HtmlPreviewTextReaderChange;
}) {
  if (format === 'html')
    return <HtmlPreview name={name} content={content} onTextReader={onHtmlTextReader} />;
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
