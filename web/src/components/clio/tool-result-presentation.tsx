import { useState } from 'react';
import {
  BotIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  FileIcon,
  InfoIcon,
  SearchIcon,
  ServerIcon,
  SquareIcon,
  SquareMinusIcon,
  SquareCheckIcon,
} from 'lucide-react';
import { bundledLanguages, type BundledLanguage } from 'shiki';
import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { Terminal, TerminalCommand, TerminalContent } from '@/components/ai-elements/terminal';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { GroundedMessageResponse } from './grounded-message-response';
import { BoundedResult } from './bounded-result';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';
import { useRepository } from '@/hooks/use-repository';
import { PresentationLink } from './presentation-link';
import { Image } from '@/components/ai-elements/image';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { ResultDialogContent } from './result-dialog-content';
import { ClioStatus, clioStatusLabel, type ClioStatusValue } from './status';
import { formatDuration } from '@/lib/format';
import { languageForPath } from '@/lib/code-language';
import { cn } from '@/lib/utils';

const CLIO_STATUSES = new Set<ClioStatusValue>([
  'queued',
  'running',
  'waiting_permission',
  'waiting_user',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
  'unknown',
  'pending',
  'succeeded',
  'denied',
  'healthy',
  'degraded',
  'unavailable',
]);

function itemStatus(value?: string): ClioStatusValue | undefined {
  return value && CLIO_STATUSES.has(value as ClioStatusValue)
    ? (value as ClioStatusValue)
    : undefined;
}

function PresentationItem({ block }: { block: ToolPresentationBlock }) {
  const Icon = block.target === 'session' ? BotIcon : ServerIcon;
  const status = itemStatus(block.status);
  const details = [block.detail, ...(block.items ?? [])].filter(Boolean);
  if (block.result_kind === 'message') {
    return <ExpandableDetail label={block.label || 'Message sent'} text={block.text ?? ''} />;
  }
  if (block.target === 'session') {
    const observed = block.result_kind === 'snapshot';
    const statusText = status ? clioStatusLabel(status).toLowerCase() : 'unknown';
    const outcome = observed
      ? `was ${statusText} when checked`
      : status === 'completed' || status === 'succeeded'
        ? `completed${block.duration_ms === undefined ? '' : block.duration_ms <= 0 ? ', already available' : `, returned after ${formatDuration(block.duration_ms)}`}`
        : `${statusText}${block.duration_ms !== undefined ? ` after ${formatDuration(block.duration_ms)}` : ''}`;
    return (
      <div className="min-w-0 text-sm">
        <div className="flex min-w-0 items-center gap-1.5">
          <PresentationLink block={block} compact />
          <span className="text-muted-foreground">{outcome}</span>
        </div>
        {!observed && block.detail ? (
          <ExpandableDetail label="Returned" text={block.detail} />
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <PresentationLink block={block} compact />
        {block.items?.length ? (
          <div className="mt-1 flex min-w-0 flex-wrap gap-1" aria-label="Available models">
            {block.items.slice(0, 4).map((item) => (
              <span
                className="max-w-48 truncate rounded bg-background px-1.5 py-0.5 text-xs"
                key={item}
              >
                {item}
              </span>
            ))}
            {block.items.length > 4 ? (
              <span className="px-1 py-0.5 text-xs text-muted-foreground">
                {block.items.length - 4} more
              </span>
            ) : null}
          </div>
        ) : block.detail ? (
          <p className="truncate text-xs text-muted-foreground" title={block.detail}>
            {block.detail.split('\n')[0]}
          </p>
        ) : null}
      </div>
      {block.duration_ms !== undefined ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDuration(block.duration_ms)}
        </span>
      ) : null}
      {status ? <ClioStatus compact className="shrink-0" value={status} /> : null}
      {block.action_label && block.uri ? (
        <Button asChild size="sm" variant="outline" className="h-7 shrink-0">
          <a href={block.uri}>{block.action_label}</a>
        </Button>
      ) : null}
      {details.length ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              aria-label={`Details for ${block.label || 'result'}`}
              className="size-7 shrink-0"
              size="icon-sm"
              variant="ghost"
            >
              <InfoIcon aria-hidden="true" className="size-3.5" />
            </Button>
          </DialogTrigger>
          <ResultDialogContent
            title={block.label || 'Result details'}
            description="Recorded details for this result."
          >
            {block.detail ? <p className="whitespace-pre-wrap text-sm">{block.detail}</p> : null}
            {block.items?.length ? (
              <ul className="grid gap-1 text-sm" aria-label="Available models">
                {block.items.map((item) => (
                  <li className="rounded-md border bg-muted/30 px-2 py-1" key={item}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </ResultDialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function SchedulePresentationItem({ block }: { block: ToolPresentationBlock }) {
  return (
    <li className="flex min-w-0 items-start gap-2 py-1.5">
      <CalendarClockIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <PresentationLink block={block} />
        {block.items?.length ? (
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {block.items.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function ExpandableDetail({ text, label }: { text: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 240;
  return (
    <div className="min-w-0 pr-2 text-sm leading-5 text-foreground/90">
      <p
        className={cn(
          'whitespace-pre-wrap [overflow-wrap:anywhere]',
          long && !expanded && 'line-clamp-2',
        )}
      >
        <span className="font-medium text-foreground">{label} </span>
        {text}
      </p>
      {long ? (
        <button
          className="font-medium text-primary underline-offset-2 hover:text-primary/80 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

function BlockBody({
  block,
  text,
  full = false,
  complete = true,
}: {
  block: ToolPresentationBlock;
  text: string;
  full?: boolean;
  complete?: boolean;
}) {
  switch (block.type) {
    case 'media': {
      if (!complete) return <p>Open the complete media result to preview it.</p>;
      const mime = block.media_type ?? '';
      if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(text) || text.length % 4 !== 0)
        return <p>Media data is invalid.</p>;
      if (/^image\/(png|jpeg|webp|gif|avif)$/u.test(mime))
        return (
          <Image
            base64={text}
            mediaType={mime}
            alt={block.label || 'Tool image result'}
            className={full ? 'max-h-[65dvh] object-contain' : 'max-h-32 object-contain'}
          />
        );
      if (/^audio\/(mpeg|wav|x-wav|ogg|mp4|webm)$/u.test(mime))
        return (
          <audio
            controls
            preload="none"
            aria-label={block.label || 'Tool audio result'}
            src={`data:${mime};base64,${text}`}
          />
        );
      return <p>Preview unavailable for {mime || 'this media type'}.</p>;
    }
    case 'markdown':
      return (
        <GroundedMessageResponse
          className="min-w-0 max-w-full px-2 py-1 leading-5 [overflow-wrap:anywhere]"
          controls={{ table: false }}
        >
          {text}
        </GroundedMessageResponse>
      );
    case 'code':
    case 'diff':
      return (
        <CodeBlock
          code={text}
          language={
            block.type === 'diff'
              ? 'diff'
              : block.language && block.language in bundledLanguages
                ? (block.language as BundledLanguage)
                : ('text' as BundledLanguage)
          }
        />
      );
    case 'terminal':
      return (
        <Terminal output={text} autoScroll={false}>
          <TerminalContent className="max-h-none overflow-visible p-3" />
        </Terminal>
      );
    case 'check': {
      const iconFor = (state: ToolPresentationBlock['state']) =>
        state === 'completed'
          ? SquareCheckIcon
          : state === 'in_progress'
            ? SquareMinusIcon
            : SquareIcon;
      const labelFor = (state: ToolPresentationBlock['state']) =>
        state === 'completed' ? 'Completed' : state === 'in_progress' ? 'In progress' : 'Pending';
      const Icon = iconFor(block.state);
      const status = labelFor(block.state);
      const PreviousIcon = block.previous_state ? iconFor(block.previous_state) : undefined;
      const previousStatus = block.previous_state ? labelFor(block.previous_state) : undefined;
      const accessibleStatus =
        block.change === 'status_changed' && previousStatus
          ? `Changed from ${previousStatus} to ${status}`
          : block.change === 'added'
            ? `Added as ${status}`
            : block.change === 'removed'
              ? `Removed from task list, was ${status}`
              : status;
      return (
        <div className="flex items-start gap-2 py-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="img"
                  aria-label={accessibleStatus}
                  tabIndex={0}
                  className={cn(
                    'mt-1 inline-flex h-4 shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    block.change === 'status_changed' ? 'w-auto gap-0.5' : 'w-4',
                  )}
                >
                  {PreviousIcon && block.change === 'status_changed' ? (
                    <>
                      <PreviousIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                      <ArrowRightIcon aria-hidden="true" className="size-3 text-muted-foreground" />
                    </>
                  ) : null}
                  <Icon
                    aria-hidden="true"
                    className={`size-4 ${block.state === 'completed' ? 'text-success' : block.state === 'in_progress' ? 'text-warning' : 'text-muted-foreground'}`}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>{accessibleStatus}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className={block.change === 'removed' ? 'text-muted-foreground line-through' : ''}>
            {text}
          </span>
          {block.change === 'added' || block.change === 'removed' ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {block.change === 'added' ? 'Added' : 'Removed'}
            </span>
          ) : null}
        </div>
      );
    }
    default:
      return (
        <p className="whitespace-pre-wrap px-2 py-1 leading-5 [overflow-wrap:anywhere]">{text}</p>
      );
  }
}

function PagedBlock({
  block,
  lines,
  groupedBlocks = [block],
}: {
  block: ToolPresentationBlock;
  lines: number;
  groupedBlocks?: ToolPresentationBlock[];
}) {
  const repository = useRepository();
  const [contents, setContents] = useState(() =>
    Object.fromEntries(
      groupedBlocks.map((item) => [
        item.id,
        {
          text: item.text ?? '',
          cursor: item.content_ref?.cursor ?? null,
        },
      ]),
    ),
  );
  const load = async (signal: AbortSignal) => {
    for (const item of groupedBlocks) {
      const ref = item.content_ref;
      if (!ref) continue;
      let next = contents[item.id].cursor;
      while (next !== null && !signal.aborted) {
        const page = await repository.toolPresentationContent(
          ref.session_id,
          ref.call_id,
          ref.block_id,
          next,
          signal,
        );
        if (signal.aborted) return;
        if (page.cursor !== next || (page.next_cursor !== null && page.next_cursor <= next))
          throw new Error('Invalid result content cursor');
        setContents((current) => ({
          ...current,
          [item.id]: {
            text: current[item.id].text + page.text,
            cursor: page.next_cursor,
          },
        }));
        next = page.next_cursor;
      }
    }
  };
  return (
    <BoundedResult
      title={block.label || 'Complete result'}
      lines={lines}
      hasMore={Object.values(contents).some((item) => item.cursor !== null)}
      loadMore={load}
      separateViewer={block.type === 'media'}
      fullContent={
        block.type === 'media' ? (
          <BlockBody
            block={block}
            text={contents[block.id].text}
            full
            complete={contents[block.id].cursor === null}
          />
        ) : undefined
      }
    >
      {groupedBlocks.map((item) => (
        <BlockBody
          key={item.id}
          block={item}
          text={contents[item.id].text}
          complete={item.type !== 'media' || contents[item.id].cursor === null}
        />
      ))}
    </BoundedResult>
  );
}

function ResourceSearchResults({
  block,
  resource,
  lines,
}: {
  block: ToolPresentationBlock;
  resource: ToolPresentationBlock;
  lines: number;
}) {
  const matches = (block.text ?? '')
    .split('\n')
    .map((text) => {
      const match = /^(\d+):\s*(.*)$/u.exec(text);
      return match ? { line: match[1], text: match[2] } : undefined;
    })
    .filter((match): match is { line: string; text: string } => Boolean(match));
  const title = `Matches in ${resource.label || 'workspace resource'}`;
  return (
    <div
      className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
      data-slot="tool-result-panel"
    >
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5 text-xs font-medium text-muted-foreground">
        <SearchIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span>{title}</span>
      </div>
      {matches.length ? (
        <BoundedResult lines={Math.min(lines, 3)} unit="items" title={title}>
          <ul className="divide-y">
            {matches.map((match) => (
              <li className="grid min-w-0 grid-cols-[auto_1fr] gap-2 px-2 py-1.5" key={match.line}>
                <PresentationLink
                  block={{
                    ...resource,
                    id: `${resource.id}-line-${match.line}`,
                    label: `Line ${match.line}`,
                  }}
                  compact
                />
                <code className="min-w-0 whitespace-pre-wrap break-words text-xs leading-5">
                  {match.text}
                </code>
              </li>
            ))}
          </ul>
        </BoundedResult>
      ) : (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">
          {block.text || 'No matching passages'}
        </p>
      )}
    </div>
  );
}

function titleCase(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value) return fallback;
  return `${value[0].toUpperCase()}${value.slice(1).replaceAll('_', ' ')}`;
}

function ResourceFacts({ blocks }: { blocks: ToolPresentationBlock[] }) {
  const identity = blocks.find((block) => block.id === 'identity' || block.type === 'text');
  const values = (identity?.text ?? '').split('\n');
  const labels = ['Format', 'Size', 'Revision', 'Upload', 'Conversion'];
  const facts = labels.map((label, index) => ({
    label,
    value: (values[index] || 'Unavailable').replace(new RegExp(`^${label}\\s+`, 'iu'), ''),
  }));
  return (
    <div
      className="min-w-0 overflow-hidden rounded-md border bg-border"
      data-slot="tool-result-panel"
    >
      <dl className="grid grid-cols-2 gap-px sm:grid-cols-5">
        {facts.map((fact) => (
          <div className="min-w-0 bg-muted/90 px-2 py-1.5" key={fact.label}>
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="break-words text-sm font-medium" title={fact.value}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ResourceStructureResult({
  blocks,
  tool,
}: {
  blocks: ToolPresentationBlock[];
  tool: ToolInvocation;
}) {
  const outline = blocks.find((block) => block.id === 'outline');
  if (outline?.text) {
    const counts = outline.text.split('\n').map((line) => {
      const [label, value] = line.split(':', 2);
      return { label, value: Number(value?.trim() || 0) };
    });
    return (
      <div
        className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
        data-slot="tool-result-panel"
      >
        <p className="border-b px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Document structure
        </p>
        <dl className="grid grid-cols-4 divide-x">
          {counts.map(({ label, value }) => (
            <div className="px-2 py-1.5 text-center" key={label}>
              <dd className="text-sm font-semibold tabular-nums">{value}</dd>
              <dt className="text-xs text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  const node = blocks.find((block) => block.id === 'node');
  if (!node?.text) return null;
  const input = asRecord(tool.input);
  const collection = typeof input?.collection === 'string' ? input.collection : 'node';
  const index = typeof input?.index === 'number' ? input.index : undefined;
  const singular = collection.endsWith('s') ? collection.slice(0, -1) : collection;
  const path = index === undefined ? undefined : `#/${collection}/${index}`;
  return (
    <div
      className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
      data-slot="tool-result-panel"
    >
      <div className="flex min-w-0 items-center justify-between gap-2 border-b px-2 py-1.5">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {titleCase(singular, 'Structure')} node
        </p>
        <code className="shrink-0 text-xs text-muted-foreground">
          {collection}
          {index === undefined ? '' : `[${index}]`}
        </code>
      </div>
      <p className="px-2 py-1.5 text-sm font-medium [overflow-wrap:anywhere]">{node.text}</p>
      {path ? (
        <p className="border-t px-2 py-1 text-xs text-muted-foreground">Path {path}</p>
      ) : null}
    </div>
  );
}

function ResourceConversionResult({ blocks }: { blocks: ToolPresentationBlock[] }) {
  const status = blocks.find((block) => block.id === 'processing' || block.type === 'text');
  if (!status?.text) return null;
  return (
    <div
      className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-muted/40 px-2 py-1.5"
      data-slot="tool-result-panel"
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Conversion status</p>
        <p className="truncate text-sm font-medium">{status.text}</p>
      </div>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Render only the declared presentation contract. Raw results stay technical. */
export function ToolResultPresentation({
  tool,
  subjectId,
  summaryInHeader = false,
}: {
  tool: ToolInvocation;
  subjectId?: string;
  summaryInHeader?: boolean;
}) {
  const lines = useTranscriptPreviewLines();
  const subject = tool.presentation?.blocks.find((block) => block.id === subjectId);
  const resourceDocument =
    tool.name === 'workspace_resource_read' && subject?.target === 'resource';
  const subjectPath =
    subject?.target === 'file'
      ? subject.uri || subject.label || ''
      : subject?.target === 'resource'
        ? subject.label || subject.uri || ''
        : '';
  const blocks = (tool.presentation?.blocks ?? [])
    .filter(
      (block) =>
        block.id !== subjectId &&
        (!['text', 'markdown'].includes(block.type) || block.text?.trim() || block.content_ref),
    )
    .map((block) => {
      if (resourceDocument && block.type === 'text')
        return { ...block, type: 'code' as const, language: languageForPath(subjectPath) };
      return block.type === 'code' && !block.language && subjectPath
        ? { ...block, language: languageForPath(subjectPath) }
        : block;
    });
  const summary = summaryInHeader ? '' : (tool.presentation?.summary?.trim() ?? '');
  // An explicitly declared file subject owns one document preview, including
  // metadata. Do not give each constituent block another preview-line budget.
  const document =
    (subject?.target === 'file' || resourceDocument) &&
    blocks.length > 0 &&
    blocks.every((block) => ['text', 'markdown', 'code', 'diff'].includes(block.type));
  if (document) {
    const budget = blocks.some((block) => block.type === 'diff') ? lines * 2 : lines;
    return (
      <div className="ml-7 flex min-w-0 flex-col gap-0.5" data-slot="tool-human-result">
        {summary ? (
          <p className="whitespace-pre-wrap pr-2 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {summary}
          </p>
        ) : null}
        <div
          className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
          data-slot="tool-result-panel"
        >
          {blocks.some((block) => block.content_ref) ? (
            <PagedBlock block={blocks[0]} groupedBlocks={blocks} lines={budget} />
          ) : (
            <BoundedResult lines={budget} title={subject.label || 'File contents'}>
              {blocks.map((block) => (
                <BlockBody key={block.id} block={block} text={block.text ?? ''} />
              ))}
            </BoundedResult>
          )}
        </div>
      </div>
    );
  }
  if (tool.name === 'workspace_resource_wait') {
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
        <ResourceConversionResult blocks={blocks} />
      </div>
    );
  }
  if (tool.name === 'workspace_resource_inspect') {
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
        <ResourceFacts blocks={blocks} />
      </div>
    );
  }
  if (tool.name === 'workspace_resource_structure') {
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
        <ResourceStructureResult blocks={blocks} tool={tool} />
      </div>
    );
  }
  const resourceListBlocks =
    tool.name === 'workspace_resource_list'
      ? blocks.filter((block) => block.type === 'link' && block.target === 'resource')
      : [];
  if (resourceListBlocks.length) {
    return (
      <div className="ml-7 flex min-w-0 flex-col gap-0.5" data-slot="tool-human-result">
        {summary ? (
          <p className="whitespace-pre-wrap pr-2 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {summary}
          </p>
        ) : null}
        <div
          className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
          data-slot="tool-result-panel"
        >
          <BoundedResult lines={3} unit="items" title="Workspace resources">
            <ul aria-label="Workspace resources" className="divide-y">
              {resourceListBlocks.map((resource) => (
                <li className="flex min-w-0 items-center gap-2 px-2 py-1.5" key={resource.id}>
                  <FileIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                  <PresentationLink block={resource} />
                </li>
              ))}
            </ul>
          </BoundedResult>
        </div>
      </div>
    );
  }
  const resourceSearchBlock =
    tool.name === 'workspace_resource_search' && subject?.target === 'resource'
      ? blocks.find((block) => block.type === 'text')
      : undefined;
  if (resourceSearchBlock && subject) {
    return (
      <div className="ml-7 flex min-w-0 flex-col gap-0.5" data-slot="tool-human-result">
        {summary ? (
          <p className="whitespace-pre-wrap pr-2 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {summary}
          </p>
        ) : null}
        <ResourceSearchResults block={resourceSearchBlock} resource={subject} lines={lines} />
      </div>
    );
  }
  return (
    <div className="ml-7 flex min-w-0 flex-col gap-0.5" data-slot="tool-human-result">
      {tool.progress_message && tool.state === 'running' ? (
        <Shimmer>{tool.progress_message}</Shimmer>
      ) : null}
      {summary ? (
        <p className="whitespace-pre-wrap pr-2 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {summary}
        </p>
      ) : null}
      {blocks.map((block, index) => {
        const collectedChildOutput =
          (tool.name === 'get_agent_task_output' || tool.presentation?.action === 'Collect') &&
          block.type === 'markdown';
        const budget = collectedChildOutput
          ? Math.min(lines, 2)
          : block.type === 'diff'
            ? lines * 2
            : lines;
        const running = block.type === 'terminal' && tool.state === 'running';
        if (block.type === 'link') {
          return <PresentationLink key={block.id} block={block} />;
        }
        if (block.type === 'item') {
          if (block.target === 'work') {
            if (blocks[index - 1]?.type === 'item' && blocks[index - 1]?.target === 'work')
              return null;
            const schedules: ToolPresentationBlock[] = [];
            for (
              let i = index;
              i < blocks.length && blocks[i].type === 'item' && blocks[i].target === 'work';
              i++
            )
              schedules.push(blocks[i]);
            return (
              <BoundedResult key={block.id} lines={3} unit="items" title="Schedules">
                <ul aria-label="Schedules" className="border-l pl-3">
                  {schedules.map((schedule) => (
                    <SchedulePresentationItem key={schedule.id} block={schedule} />
                  ))}
                </ul>
              </BoundedResult>
            );
          }
          return <PresentationItem key={block.id} block={block} />;
        }
        if (block.type === 'check') {
          if (blocks[index - 1]?.type === 'check') return null;
          const checks: ToolPresentationBlock[] = [];
          for (let i = index; i < blocks.length && blocks[i].type === 'check'; i++)
            checks.push(blocks[i]);
          return (
            <BoundedResult
              key={block.id}
              lines={3}
              unit="items"
              title={
                checks.some((check) => check.change && check.change !== 'unchanged')
                  ? 'Task changes'
                  : 'Task list'
              }
            >
              <ul className="list-none">
                {checks.map((check) => (
                  <li key={check.id}>
                    {check.content_ref ? (
                      <PagedBlock block={check} lines={lines} />
                    ) : (
                      <BlockBody block={check} text={check.text ?? ''} />
                    )}
                  </li>
                ))}
              </ul>
            </BoundedResult>
          );
        }
        if (block.type === 'terminal')
          return (
            <Terminal
              key={`${block.id}:${running}`}
              output={block.text ?? ''}
              autoScroll={false}
              isStreaming={running}
            >
              {block.command ? <TerminalCommand command={block.command} /> : null}
              {block.content_ref && !running ? (
                <PagedBlock block={block} lines={budget} />
              ) : (
                <BoundedResult lines={budget} running={running} title="Terminal output">
                  <TerminalContent className="max-h-none overflow-visible bg-zinc-950 p-3 text-zinc-100" />
                </BoundedResult>
              )}
              {!running && (block.timed_out || block.exit_code !== undefined) ? (
                <p className="border-t border-zinc-800 px-3 py-2 text-sm text-zinc-400">
                  {block.timed_out
                    ? 'Process timed out.'
                    : `Process exited with code ${block.exit_code}.`}
                </p>
              ) : null}
            </Terminal>
          );
        const boxed =
          block.severity === 'error' ||
          block.severity === 'warning' ||
          ['code', 'diff', 'media'].includes(block.type);
        if (!boxed) {
          if (block.content_ref && !running)
            return <PagedBlock key={block.id} block={block} lines={budget} />;
          if (collectedChildOutput)
            return (
              <BoundedResult key={block.id} lines={budget} title="Collected child output">
                <BlockBody block={block} text={block.text ?? ''} />
              </BoundedResult>
            );
          return (
            <div key={block.id} className="min-w-0">
              {block.label ? (
                <p className="text-xs font-medium text-muted-foreground">{block.label}</p>
              ) : null}
              <BlockBody block={block} text={block.text ?? ''} />
            </div>
          );
        }
        return (
          <div
            key={`${block.id}:${running ? 'running' : 'complete'}`}
            className={cn(
              'min-w-0 overflow-hidden rounded-md border',
              block.severity === 'error'
                ? 'border-destructive/40 bg-destructive/5'
                : block.severity === 'warning'
                  ? 'border-warning/40 bg-warning/5'
                  : 'bg-muted/40',
            )}
            data-slot="tool-result-panel"
          >
            {block.label ? (
              <p
                className={cn(
                  'flex items-center gap-1 break-words px-2 pt-1 text-xs font-medium',
                  block.severity === 'error' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {block.severity === 'error' ? (
                  <CircleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
                ) : null}
                {block.label}
              </p>
            ) : null}
            {block.content_ref && !running ? (
              <PagedBlock block={block} lines={budget} />
            ) : (
              <BoundedResult
                lines={budget}
                running={running}
                separateViewer={block.type === 'media'}
                fullContent={
                  block.type === 'media' ? (
                    <BlockBody block={block} text={block.text ?? ''} full />
                  ) : undefined
                }
              >
                <BlockBody block={block} text={block.text ?? ''} />
              </BoundedResult>
            )}
          </div>
        );
      })}
    </div>
  );
}
