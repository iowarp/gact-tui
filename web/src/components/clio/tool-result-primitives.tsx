import { useState } from 'react';
import {
  BotIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  InfoIcon,
  ServerIcon,
  SquareIcon,
  SquareMinusIcon,
  SquareCheckIcon,
} from 'lucide-react';
import { bundledLanguages, type BundledLanguage } from 'shiki';
import type { ToolPresentationBlock } from '@clio/core/v3';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { Terminal, TerminalContent } from '@/components/ai-elements/terminal';
import { GroundedMessageResponse } from './grounded-message-response';
import { BoundedResult } from './bounded-result';
import { useRepository } from '@/hooks/use-repository';
import { PresentationLink } from './presentation-link';
import { Image } from '@/components/ai-elements/image';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { ResultDialogContent } from './result-dialog-content';
import { ClioStatus, clioStatusLabel, type ClioStatusValue } from './status';
import { formatDuration } from '@/lib/format';
import { providerDisplayName } from '@/lib/provider-presentation';
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

export function PresentationItem({ block }: { block: ToolPresentationBlock }) {
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

export function ProviderRefreshResults({ blocks }: { blocks: ToolPresentationBlock[] }) {
  const refreshed = blocks.filter((block) =>
    ['completed', 'succeeded', 'healthy'].includes(block.status ?? ''),
  ).length;
  const failed = blocks.length - refreshed;
  return (
    <div className="min-w-0" data-slot="provider-refresh-results">
      <p className="pb-1 text-sm text-muted-foreground">
        {blocks.length} providers · {refreshed} refreshed · {failed} failed
      </p>
      <ul aria-label="Provider refresh results" className="divide-y border-y">
        {blocks.map((block) => (
          <li key={block.id}>
            <ProviderRefreshItem block={block} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProviderRefreshItem({ block }: { block: ToolPresentationBlock }) {
  const providerName = providerDisplayName(undefined, block.label);
  const status = itemStatus(block.status);
  const detailLines = (block.detail ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const sourceLine = detailLines.find((line) => /^Source:/iu.test(line));
  const diagnosticLines = detailLines.filter((line) => line !== sourceLine);
  const modelCount = block.items?.length ?? 0;
  const outcome = modelCount
    ? `${modelCount} ${modelCount === 1 ? 'model' : 'models'}`
    : status
      ? clioStatusLabel(status)
      : 'No result';
  return (
    <Collapsible className="group/provider">
      <CollapsibleTrigger asChild>
        <button
          aria-label={`Details for ${providerName}`}
          className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
          type="button"
        >
          <ChevronRightIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/provider:rotate-90"
          />
          <ServerIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{providerName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{outcome}</span>
          {status ? <ClioStatus compact className="shrink-0" value={status} /> : null}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-7 flex min-w-0 flex-col gap-2 border-l px-3 pt-1 pb-2">
          {block.items?.length ? (
            <div aria-label={`Models from ${providerName}`} className="flex flex-wrap gap-1">
              {block.items.map((item) => (
                <Badge className="max-w-full font-normal" key={item} variant="secondary">
                  <span className="truncate">{item}</span>
                </Badge>
              ))}
            </div>
          ) : null}
          {sourceLine ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Source </span>
              {sourceLine.replace(/^Source:\s*/iu, '').replaceAll('_', ' ')}
            </p>
          ) : null}
          {diagnosticLines.map((line) => {
            const diagnostic = /^(\w+Error):\s*(.*)$/u.exec(line);
            return (
              <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]" key={line}>
                {diagnostic ? (
                  <>
                    <span className="font-medium text-foreground">{diagnostic[1]} </span>
                    {diagnostic[2]}
                  </>
                ) : (
                  line
                )}
              </p>
            );
          })}
          {block.action_label && block.uri ? (
            <Button asChild className="h-7 self-start px-2" size="sm" variant="ghost">
              <a href={block.uri}>Configure provider</a>
            </Button>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SchedulePresentationItem({ block }: { block: ToolPresentationBlock }) {
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

export function ExpandableDetail({ text, label }: { text: string; label: string }) {
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

/**
 * A checklist item's state icon. Defined at module scope (not selected into a
 * local variable during render) so the icon is a stable element, never a
 * component "created during render".
 */
export function CheckStateIcon({
  className,
  state,
}: {
  className: string;
  state: ToolPresentationBlock['state'];
}) {
  if (state === 'completed') return <SquareCheckIcon aria-hidden="true" className={className} />;
  if (state === 'in_progress')
    return <SquareMinusIcon aria-hidden="true" className={className} />;
  return <SquareIcon aria-hidden="true" className={className} />;
}

export function BlockBody({
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
          // tool-presentation-body scopes the compact heading/pre/code rules
          // in index.css; BoundedResult also carries this class on its own
          // wrapper, but a markdown block rendered outside BoundedResult (the
          // unboxed generic block path) needs it applied here directly.
          className="tool-presentation-body min-w-0 max-w-full px-2 py-1 leading-5 [overflow-wrap:anywhere]"
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
      const labelFor = (state: ToolPresentationBlock['state']) =>
        state === 'completed' ? 'Completed' : state === 'in_progress' ? 'In progress' : 'Pending';
      const status = labelFor(block.state);
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
                  {block.previous_state && block.change === 'status_changed' ? (
                    <>
                      <CheckStateIcon
                        className="size-4 text-muted-foreground"
                        state={block.previous_state}
                      />
                      <ArrowRightIcon aria-hidden="true" className="size-3 text-muted-foreground" />
                    </>
                  ) : null}
                  <CheckStateIcon
                    className={`size-4 ${block.state === 'completed' ? 'text-success' : block.state === 'in_progress' ? 'text-warning' : 'text-muted-foreground'}`}
                    state={block.state}
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

export function PagedBlock({
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
