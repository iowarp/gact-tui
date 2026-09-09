import { useState } from 'react';
import {
  BotIcon,
  InfoIcon,
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
import { ClioStatus, type ClioStatusValue } from './status';
import { formatDuration } from '@/lib/format';

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
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <PresentationLink block={block} compact />
        {block.items?.length ? (
          <div className="mt-1 flex min-w-0 flex-wrap gap-1" aria-label="Available models">
            {block.items.slice(0, 4).map((item) => (
              <span className="max-w-48 truncate rounded bg-background px-1.5 py-0.5 text-xs" key={item}>
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
      {status ? <ClioStatus className="shrink-0 px-1.5 py-0.5 text-xs" value={status} /> : null}
      {block.duration_ms !== undefined ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDuration(block.duration_ms)}
        </span>
      ) : null}
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
      const Icon =
        block.state === 'completed'
          ? SquareCheckIcon
          : block.state === 'in_progress'
            ? SquareMinusIcon
            : SquareIcon;
      const status =
        block.state === 'completed'
          ? 'Completed'
          : block.state === 'in_progress'
            ? 'In progress'
            : 'Pending';
      return (
        <div className="flex items-start gap-2 py-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="img"
                  aria-label={status}
                  tabIndex={0}
                  className="mt-1 inline-flex size-4 shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon
                    aria-hidden="true"
                    className={`size-4 ${block.state === 'completed' ? 'text-success' : block.state === 'in_progress' ? 'text-warning' : 'text-muted-foreground'}`}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>{status}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span>{text}</span>
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

/** Render only the declared presentation contract. Raw results stay technical. */
export function ToolResultPresentation({
  tool,
  subjectId,
}: {
  tool: ToolInvocation;
  subjectId?: string;
}) {
  const lines = useTranscriptPreviewLines();
  const blocks = (tool.presentation?.blocks ?? []).filter(
    (block) =>
      block.id !== subjectId &&
      (!['text', 'markdown'].includes(block.type) || block.text?.trim() || block.content_ref),
  );
  const subject = tool.presentation?.blocks.find((block) => block.id === subjectId);
  // An explicitly declared file subject owns one document preview, including
  // metadata. Do not give each constituent block another preview-line budget.
  const document =
    subject?.target === 'file' &&
    blocks.length > 0 &&
    blocks.every((block) => ['text', 'markdown', 'code', 'diff'].includes(block.type));
  if (document) {
    const budget = blocks.some((block) => block.type === 'diff') ? lines * 2 : lines;
    return (
      <div className="ml-7 min-w-0" data-slot="tool-human-result">
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
  return (
    <div className="ml-7 flex min-w-0 flex-col gap-1" data-slot="tool-human-result">
      {tool.progress_message && tool.state === 'running' ? (
        <Shimmer>{tool.progress_message}</Shimmer>
      ) : null}
      {blocks.map((block, index) => {
        const budget = block.type === 'diff' ? lines * 2 : lines;
        const running = block.type === 'terminal' && tool.state === 'running';
        if (block.type === 'link') {
          return <PresentationLink key={block.id} block={block} />;
        }
        if (block.type === 'item') {
          return <PresentationItem key={block.id} block={block} />;
        }
        if (block.type === 'check') {
          if (blocks[index - 1]?.type === 'check') return null;
          const checks: ToolPresentationBlock[] = [];
          for (let i = index; i < blocks.length && blocks[i].type === 'check'; i++)
            checks.push(blocks[i]);
          return (
            <BoundedResult key={block.id} lines={3} unit="items" title="Task list">
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
        return (
          <div
            key={`${block.id}:${running ? 'running' : 'complete'}`}
            className="min-w-0 overflow-hidden rounded-md border bg-muted/40"
            data-slot="tool-result-panel"
          >
            {block.label ? (
              <p className="break-words px-2 pt-1 text-xs text-muted-foreground">{block.label}</p>
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
