import type { ToolPresentationBlock } from '@clio/core/v3';
import type { BundledLanguage } from 'shiki';
import { bundledLanguages } from 'shiki/langs';
import { useMemo, useState } from 'react';
import { FileIcon, ImageIcon } from 'lucide-react';
import { plural, ph, t } from '@lingui/core/macro';
import { CodeBlock, HANGING_SOURCE_WRAP } from '@/components/ai-elements/code-block';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { formatBytes } from '@/lib/format';
import { formatNumber } from '@/lib/locale-format';
import { cn } from '@/lib/utils';
import { parsePrintedValue } from './python-literal';
import { workspaceImages } from './image-reach';
import { WorkspaceImageStrip } from './workspace-image-thumbnail';
import { fileName } from './resource-media-types';
import { attached, backgroundTaskLink, type PrintedLine, printedLines } from './script-run';
import { PresentationLink } from './presentation-link';
import {
  DetailsSection,
  LONG_BLOCK_BOUND,
  MoreLines,
  NumberedCode,
  WrappedCodeLine,
} from './tool-technical-details';
import { type CompleteBlockText, useCompleteBlockText } from './use-complete-block-text';

/** Lines of a script or its output shown before "N more lines". */
const PREVIEW_LINES = 14;
/** Lines of a traceback shown; Python puts the error last. */
const TRACE_LINES = 30;

const LANGUAGE_NAMES: Record<string, string> = {
  python: 'Python',
  py: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  bash: 'Shell',
  sh: 'Shell',
};

/**
 * An opened script: its source, highlighted, then what came back. A printed or
 * returned Python value reads as data, and image descriptors as the images.
 */
/** A traceback's last lines, where its error is; the full text stays in Copy. */
function traceTail(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= TRACE_LINES) return text;
  const earlier = lines.length - TRACE_LINES;
  return [
    plural(earlier, { one: '… # earlier line', other: '… # earlier lines' }),
    ...lines.slice(-TRACE_LINES),
  ].join('\n');
}

export function ScriptRunBody({
  blocks,
  failure,
  stopped = false,
  taskName,
  onOpen,
}: {
  blocks: readonly ToolPresentationBlock[];
  /** Why the run failed, usually its traceback, or how it was stopped. */
  failure?: string;
  stopped?: boolean;
  /** A background script's name, which its task carries under Work. */
  taskName?: string;
  /** Opens the whole call in a workbench tab, for a block too long to read here. */
  onOpen?: () => void;
}) {
  const script = blocks.find((block) => block.type === 'code');
  const shown = blocks.filter(attached);
  const declared = blocks.filter((block) => block.severity === 'error');
  const taskLink = blocks.find(backgroundTaskLink);
  const results = blocks.filter(
    (block) =>
      block !== script &&
      block !== taskLink &&
      // The task's sentence names its raw handle; the line below says it in words.
      !(taskLink && block.id === 'task') &&
      !attached(block) &&
      !declared.includes(block) &&
      block.text?.trim(),
  );
  const errors = [
    ...new Set(
      [failure, ...declared.map((block) => block.text)]
        .map((text) => text?.replace(/^\n+|\s+$/gu, ''))
        .filter((text): text is string => Boolean(text)),
    ),
  ];
  const shownPaths = new Set(shown.map((block) => block.path ?? block.text?.trim()));
  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid min-w-0 gap-2.5" data-slot="script-run-body">
        {script?.text ? <ScriptSource block={script} onOpen={onOpen} /> : null}
        {taskLink ? (
          <p className="min-w-0 text-muted-foreground" data-slot="script-background">
            {taskName
              ? t`Runs in the background as the task “${ph({ name: taskName })}”. Its progress and a cancel control are in Work, under Background tasks.`
              : t`Runs in the background as a task. Its progress and a cancel control are in Work, under Background tasks.`}{' '}
            <PresentationLink
              block={{ ...taskLink, label: t`Show the task in Work` }}
              className="text-label"
            />
          </p>
        ) : null}
        {results.map((block) =>
          block.id === 'silent' ? (
            <p key={block.id} className="text-muted-foreground">
              {block.text}
            </p>
          ) : (
            <ScriptResult key={block.id} block={block} shownPaths={shownPaths} onOpen={onOpen} />
          ),
        )}
        {errors.map((text) => (
          <DetailsSection key={text} title={stopped ? t`Stopped` : t`Error`} copy={text}>
            <pre
              role={stopped ? undefined : 'alert'}
              className={`min-w-0 rounded-lg border px-2.5 py-1.5 font-mono text-label whitespace-pre-wrap [overflow-wrap:anywhere] ${stopped ? 'border-border text-muted-foreground' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}
            >
              {traceTail(text)}
            </pre>
          </DetailsSection>
        ))}
        {shown.length ? <ShownToModel blocks={shown} /> : null}
      </div>
    </TooltipProvider>
  );
}

/** The images or PDFs the script viewed, attached to its result for the model's next step. */
function ShownToModel({ blocks }: { blocks: readonly ToolPresentationBlock[] }) {
  const images = blocks.flatMap((block) =>
    block.type === 'workspace_file' && block.path && block.media_type?.startsWith('image/')
      ? [{ path: block.path, mediaType: block.media_type, sha256: block.sha256, block }]
      : [],
  );
  const others = blocks.filter((block) => !images.some((image) => image.block === block));
  const detail = blocks.find((block) => block.detail?.trim())?.detail;
  return (
    <DetailsSection
      title={t`Shown to the model`}
      aside={plural(blocks.length, { one: '# file', other: '# files' })}
    >
      <div className="grid min-w-0 gap-1.5">
        {images.length ? (
          <WorkspaceImageStrip images={images} workspaceId={images[0]!.block.workspace_id} />
        ) : null}
        {others.length ? (
          <ul className="grid min-w-0 gap-0.5">
            {others.map((block) => {
              const path = block.path ?? block.text?.trim() ?? '';
              return (
                <li key={block.id} className="flex min-w-0 items-center gap-1.5" title={path}>
                  <FileIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 truncate">{fileName(path)}</span>
                  {block.pages?.length ? (
                    <span className="shrink-0 text-meta text-muted-foreground">
                      {pagesLabel(block.pages)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {detail ? <p className="text-meta text-muted-foreground">{detail}</p> : null}
      </div>
    </DetailsSection>
  );
}

function ScriptSource({ block, onOpen }: { block: ToolPresentationBlock; onOpen?: () => void }) {
  const complete = useCompleteBlockText(block);
  const code = complete.text.replace(/\r\n?/gu, '\n').replace(/\n$/u, '');
  const lines = code.split('\n');
  const [all, setAll] = useState(false);
  const shown = all ? code : lines.slice(0, PREVIEW_LINES).join('\n');
  const hidden = all ? 0 : lines.length - PREVIEW_LINES;
  const long = lines.length > PREVIEW_LINES;
  const language =
    block.language && block.language in bundledLanguages
      ? (block.language as BundledLanguage)
      : ('python' as BundledLanguage);
  const name = LANGUAGE_NAMES[language] ?? language;
  const count = lines.length;
  return (
    <DetailsSection
      title={t`Script`}
      aside={plural(count, { one: `${name}, # line`, other: `${name}, # lines` })}
      copy={code}
    >
      <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background">
        <div
          className={cn('clio-source-wrap-marks', all && long && LONG_BLOCK_BOUND)}
          tabIndex={all && long ? 0 : undefined}
        >
          <CodeBlock
            code={shown}
            language={language}
            showLineNumbers
            className={cn(
              'rounded-none border-0 [&_:is(pre,code)]:text-label [&_:is(pre,code)]:leading-[1.65] [&_pre]:py-1.5',
              HANGING_SOURCE_WRAP,
            )}
          />
        </div>
        <MoreLines
          hidden={hidden}
          onShowAll={() => setAll(true)}
          onOpen={long ? onOpen : undefined}
        />
        <RestOfBlock complete={complete} />
      </div>
    </DetailsSection>
  );
}

/** What is still on the agent when a long block arrived as a preview. */
function RestOfBlock({ complete }: { complete: CompleteBlockText }) {
  if (!complete.remaining && !complete.error) return null;
  return (
    <div className="flex h-[30px] items-center gap-2.5 border-t border-border pr-1.5 pl-2.5 text-label whitespace-nowrap text-muted-foreground">
      <span className={cn('truncate', complete.error && 'text-destructive')}>
        {complete.error
          ? t`Could not load the rest: ${ph({ error: complete.error })}`
          : complete.loading
            ? t`Loading the rest…`
            : remainingLabel(complete.remaining)}
      </span>
      {complete.loading ? null : (
        <Button variant="ghost" className="ml-auto h-6 px-2 text-meta" onClick={complete.loadAll}>
          {complete.error ? t`Retry` : t`Load the rest`}
        </Button>
      )}
    </div>
  );
}

function ScriptResult({
  block,
  shownPaths,
  onOpen,
}: {
  block: ToolPresentationBlock;
  shownPaths: ReadonlySet<string | undefined>;
  onOpen?: () => void;
}) {
  const complete = useCompleteBlockText(block);
  const text = useMemo(() => complete.text.replace(/\r\n?/gu, '\n'), [complete.text]);
  const title =
    block.id === 'value'
      ? t`Returned`
      : block.id === 'output'
        ? t`Printed`
        : block.label || t({ message: 'Result', context: 'noun' });
  const reading = useMemo(() => {
    const parsed = complete.remaining ? undefined : parsePrintedValue(text);
    if (!parsed) {
      const lines = printedLines(text);
      if (lines.some((line) => line.kind === 'image')) return { kind: 'lines' as const, lines };
      return { kind: 'text' as const, text: text.replace(/^\n+|\s+$/gu, '') };
    }
    const images = workspaceImages(parsed.value);
    if (images) return { kind: 'images' as const, images };
    return { kind: 'data' as const, text: JSON.stringify(parsed.value, null, 2) };
  }, [text, complete.remaining]);
  // Images the model was shown appear once, below; the script itself only got their descriptions.
  if (reading.kind === 'images' && reading.images.every((image) => shownPaths.has(image.path)))
    return (
      <DetailsSection title={title} copy={text}>
        <p className="text-muted-foreground">
          {reading.images.length === 1
            ? t`The description of ${ph({ file: fileName(reading.images[0]!.path) })}`
            : descriptionsLabel(reading.images.map((image) => fileName(image.path)))}
        </p>
      </DetailsSection>
    );
  if (reading.kind === 'images')
    return (
      <DetailsSection
        title={title}
        aside={plural(reading.images.length, { one: '# image', other: '# images' })}
      >
        <WorkspaceImageStrip images={reading.images} />
      </DetailsSection>
    );
  if (reading.kind === 'lines')
    return (
      <DetailsSection title={title} copy={text}>
        <PrintedOutput
          lines={reading.lines}
          shownPaths={shownPaths}
          complete={complete}
          onOpen={onOpen}
        />
      </DetailsSection>
    );
  return (
    <DetailsSection title={title} copy={text}>
      <NumberedCode
        text={reading.text}
        json={reading.kind === 'data'}
        limit={PREVIEW_LINES}
        onOpen={onOpen}
      />
      {complete.remaining || complete.error ? (
        <div className="mt-1 overflow-hidden rounded-lg border border-border">
          <RestOfBlock complete={complete} />
        </div>
      ) : null}
    </DetailsSection>
  );
}

/**
 * Printed lines with each printed image descriptor read as its image: the file, its
 * size, and whether the model was shown it below.
 */
function PrintedOutput({
  lines,
  shownPaths,
  complete,
  onOpen,
}: {
  lines: readonly PrintedLine[];
  shownPaths: ReadonlySet<string | undefined>;
  complete: CompleteBlockText;
  onOpen?: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? lines : lines.slice(0, PREVIEW_LINES);
  const hidden = lines.length - shown.length;
  const long = lines.length > PREVIEW_LINES;
  return (
    <div
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-background"
      data-slot="script-printed"
    >
      <div
        className={cn(
          'grid grid-cols-[34px_minmax(0,1fr)] py-1.5 pr-2.5 font-mono text-label leading-[1.65] text-foreground/90',
          all && long && LONG_BLOCK_BOUND,
        )}
        tabIndex={all && long ? 0 : undefined}
      >
        {shown.map((line, index) =>
          line.kind === 'text' ? (
            <WrappedCodeLine key={index} number={index + 1} indent={line.text}>
              {line.text || ' '}
            </WrappedCodeLine>
          ) : (
            <span className="contents" key={index}>
              <span aria-hidden="true" className="pr-3 text-right text-faint select-none">
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 font-sans">
                {line.images.map((image, at) => (
                  <span
                    key={`${image.path}-${at}`}
                    className="inline-flex min-w-0 items-center gap-1.5"
                    title={image.path}
                  >
                    <ImageIcon
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="truncate font-mono">{fileName(image.path)}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {descriptorNote(image.sizeBytes, shownPaths.has(image.path))}
                    </span>
                  </span>
                ))}
              </span>
            </span>
          ),
        )}
      </div>
      <MoreLines
        hidden={hidden}
        onShowAll={() => setAll(true)}
        onOpen={long ? onOpen : undefined}
      />
      <RestOfBlock complete={complete} />
    </div>
  );
}

/** What a printed image descriptor is: "image description, 36.1 KB, pixels shown to the model below". */
function descriptorNote(sizeBytes: number | undefined, shown: boolean): string {
  if (sizeBytes === undefined)
    return shown ? t`image description, pixels shown to the model below` : t`image description`;
  const size = formatBytes(sizeBytes);
  return shown
    ? t`image description, ${size}, pixels shown to the model below`
    : t`image description, ${size}`;
}

function pagesLabel(pages: readonly number[]): string {
  const list = pages.join(', ');
  return plural(pages.length, { one: `Page ${list}`, other: `Pages ${list}` });
}

function remainingLabel(remaining: number): string {
  const count = formatNumber(remaining);
  return plural(remaining, {
    one: `${count} more character on the agent`,
    other: `${count} more characters on the agent`,
  });
}

function descriptionsLabel(names: readonly string[]): string {
  const files = names.join(', ');
  return plural(names.length, {
    one: `Description of # image: ${files}`,
    other: `Descriptions of # images: ${files}`,
  });
}
