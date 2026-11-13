import type { ToolPresentationBlock } from '@clio/core/v3';
import type { BundledLanguage } from 'shiki';
import { bundledLanguages } from 'shiki/langs';
import { useMemo, useState } from 'react';
import { FileIcon } from 'lucide-react';
import { CodeBlock, HANGING_SOURCE_WRAP } from '@/components/ai-elements/code-block';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { parsePrintedValue } from './python-literal';
import { workspaceImages } from './image-reach';
import { WorkspaceImageStrip } from './workspace-image-thumbnail';
import { fileName } from './resource-media-types';
import { attached } from './script-run';
import { DetailsSection, NumberedCode } from './tool-technical-details';

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
    `… ${earlier} earlier line${earlier === 1 ? '' : 's'}`,
    ...lines.slice(-TRACE_LINES),
  ].join('\n');
}

export function ScriptRunBody({
  blocks,
  failure,
  stopped = false,
}: {
  blocks: readonly ToolPresentationBlock[];
  /** Why the run failed, usually its traceback, or how it was stopped. */
  failure?: string;
  stopped?: boolean;
}) {
  const script = blocks.find((block) => block.type === 'code');
  const shown = blocks.filter(attached);
  const declared = blocks.filter((block) => block.severity === 'error');
  const results = blocks.filter(
    (block) =>
      block !== script && !attached(block) && !declared.includes(block) && block.text?.trim(),
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
        {script?.text ? <ScriptSource block={script} /> : null}
        {results.map((block) =>
          block.id === 'silent' ? (
            <p key={block.id} className="text-muted-foreground">
              {block.text}
            </p>
          ) : (
            <ScriptResult key={block.id} block={block} shownPaths={shownPaths} />
          ),
        )}
        {errors.map((text) => (
          <DetailsSection key={text} title={stopped ? 'Stopped' : 'Error'} copy={text}>
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
      title="Shown to the model"
      aside={`${blocks.length} file${blocks.length === 1 ? '' : 's'}`}
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
                      {block.pages.length === 1 ? 'Page' : 'Pages'} {block.pages.join(', ')}
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

function ScriptSource({ block }: { block: ToolPresentationBlock }) {
  const code = (block.text ?? '').replace(/\r?\n$/u, '');
  const lines = code.split('\n');
  const [all, setAll] = useState(false);
  const shown = all ? code : lines.slice(0, PREVIEW_LINES).join('\n');
  const hidden = all ? 0 : lines.length - PREVIEW_LINES;
  const language =
    block.language && block.language in bundledLanguages
      ? (block.language as BundledLanguage)
      : ('python' as BundledLanguage);
  const name = LANGUAGE_NAMES[language] ?? language;
  return (
    <DetailsSection
      title="Script"
      aside={`${name}, ${lines.length} line${lines.length === 1 ? '' : 's'}`}
      copy={code}
    >
      <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background">
        <CodeBlock
          code={shown}
          language={language}
          showLineNumbers
          className={cn(
            'rounded-none border-0 [&_:is(pre,code)]:text-label [&_:is(pre,code)]:leading-[1.65] [&_pre]:py-1.5',
            HANGING_SOURCE_WRAP,
          )}
        />
        {hidden > 0 ? (
          <div className="flex h-[30px] items-center gap-2.5 border-t border-border pr-1.5 pl-2.5 text-label whitespace-nowrap text-muted-foreground">
            <span className="truncate">{hidden} more lines</span>
            <Button
              variant="ghost"
              className="ml-auto h-6 px-2 text-meta"
              onClick={() => setAll(true)}
            >
              Show all
            </Button>
          </div>
        ) : null}
      </div>
    </DetailsSection>
  );
}

function ScriptResult({
  block,
  shownPaths,
}: {
  block: ToolPresentationBlock;
  shownPaths: ReadonlySet<string | undefined>;
}) {
  const text = block.text ?? '';
  const title =
    block.id === 'value' ? 'Returned' : block.id === 'output' ? 'Printed' : block.label || 'Result';
  const reading = useMemo(() => {
    const parsed = parsePrintedValue(text);
    if (!parsed) return { kind: 'text' as const, text: text.replace(/^\n+|\s+$/gu, '') };
    const images = workspaceImages(parsed.value);
    if (images) return { kind: 'images' as const, images };
    return { kind: 'data' as const, text: JSON.stringify(parsed.value, null, 2) };
  }, [text]);
  // Images the model was shown appear once, below; the script itself only got their descriptions.
  if (reading.kind === 'images' && reading.images.every((image) => shownPaths.has(image.path)))
    return (
      <DetailsSection title={title} copy={text}>
        <p className="text-muted-foreground">
          {reading.images.length === 1
            ? `The description of ${fileName(reading.images[0]!.path)}`
            : `Descriptions of ${reading.images.length} images: ${reading.images.map((image) => fileName(image.path)).join(', ')}`}
        </p>
      </DetailsSection>
    );
  if (reading.kind === 'images')
    return (
      <DetailsSection
        title={title}
        aside={`${reading.images.length} image${reading.images.length === 1 ? '' : 's'}`}
      >
        <WorkspaceImageStrip images={reading.images} />
      </DetailsSection>
    );
  return (
    <DetailsSection title={title} copy={text}>
      <NumberedCode text={reading.text} json={reading.kind === 'data'} limit={PREVIEW_LINES} />
    </DetailsSection>
  );
}
