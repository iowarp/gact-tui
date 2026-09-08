import { useState } from 'react';
import { SquareIcon, SquareMinusIcon, SquareCheckIcon } from 'lucide-react';
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
      return <GroundedMessageResponse>{text}</GroundedMessageResponse>;
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
          <Icon
            aria-hidden="true"
            className={`mt-1 size-4 shrink-0 ${block.state === 'completed' ? 'text-success' : block.state === 'in_progress' ? 'text-warning' : 'text-muted-foreground'}`}
          />
          <span>
            <span className="sr-only">{status}: </span>
            {text}
          </span>
        </div>
      );
    }
    default:
      return <p className="whitespace-pre-wrap break-words">{text}</p>;
  }
}

function PagedBlock({ block, lines }: { block: ToolPresentationBlock; lines: number }) {
  const repository = useRepository();
  const [text, setText] = useState(block.text ?? '');
  const [cursor, setCursor] = useState<number | null>(block.content_ref!.cursor);
  const load = async (signal: AbortSignal) => {
    const ref = block.content_ref!;
    let next = cursor;
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
      setText((current) => current + page.text);
      setCursor(page.next_cursor);
      next = page.next_cursor;
    }
  };
  return (
    <BoundedResult
      title={block.label || 'Complete result'}
      lines={lines}
      hasMore={cursor !== null}
      loadMore={load}
      separateViewer={block.type === 'media'}
      fullContent={
        block.type === 'media' ? (
          <BlockBody block={block} text={text} full complete={cursor === null} />
        ) : undefined
      }
    >
      <BlockBody block={block} text={text} complete={block.type !== 'media' || cursor === null} />
    </BoundedResult>
  );
}

/** Render only the declared presentation contract. Raw results stay technical. */
export function ToolResultPresentation({ tool }: { tool: ToolInvocation }) {
  const lines = useTranscriptPreviewLines();
  const blocks = tool.presentation?.blocks ?? [];
  return (
    <div className="ml-7 flex min-w-0 flex-col gap-2" data-slot="tool-human-result">
      {tool.progress_message && tool.state === 'running' ? (
        <Shimmer>{tool.progress_message}</Shimmer>
      ) : null}
      {blocks.map((block, index) => {
        const budget = block.type === 'diff' ? lines * 2 : lines;
        const running = block.type === 'terminal' && tool.state === 'running';
        if (block.type === 'link') {
          return <PresentationLink key={block.id} block={block} />;
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
          <div key={`${block.id}:${running ? 'running' : 'complete'}`} className="min-w-0">
            {block.label ? (
              <p className="break-words text-sm text-muted-foreground">{block.label}</p>
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
