import { useState } from 'react';
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

function BlockBody({ block, text }: { block: ToolPresentationBlock; text: string }) {
  switch (block.type) {
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
          <TerminalContent className="max-h-none overflow-visible p-0" />
        </Terminal>
      );
    default:
      return <p className="whitespace-pre-wrap break-words">{text}</p>;
  }
}

function PagedBlock({ block, lines }: { block: ToolPresentationBlock; lines: number }) {
  const repository = useRepository();
  const [text, setText] = useState(block.text ?? '');
  const [cursor, setCursor] = useState<number | null>(block.content_ref!.cursor);
  const load = async () => {
    if (cursor === null) return;
    const ref = block.content_ref!;
    const page = await repository.toolPresentationContent(
      ref.session_id,
      ref.call_id,
      ref.block_id,
      cursor,
    );
    if (page.cursor !== cursor || (page.next_cursor !== null && page.next_cursor <= cursor))
      throw new Error('Invalid result content cursor');
    setText((current) => current + page.text);
    setCursor(page.next_cursor);
  };
  return (
    <BoundedResult lines={lines} hasMore={cursor !== null} loadMore={load}>
      <BlockBody block={block} text={text} />
    </BoundedResult>
  );
}

/** Render only the declared presentation contract. Raw results stay technical. */
export function ToolResultPresentation({ tool }: { tool: ToolInvocation }) {
  const lines = useTranscriptPreviewLines();
  return (
    <div className="ml-7 flex min-w-0 flex-col gap-2" data-slot="tool-human-result">
      {tool.progress_message && tool.state === 'running' ? (
        <Shimmer>{tool.progress_message}</Shimmer>
      ) : null}
      {tool.presentation?.blocks.map((block) => {
        const budget = block.type === 'diff' ? lines * 2 : lines;
        const running = block.type === 'terminal' && tool.state === 'running';
        if (block.type === 'link') {
          return <PresentationLink key={block.id} block={block} />;
        }
        return (
          <div key={`${block.id}:${running ? 'running' : 'complete'}`} className="min-w-0">
            {block.label ? (
              <p className="break-words text-sm text-muted-foreground">{block.label}</p>
            ) : null}
            {block.type === 'terminal' && block.command ? (
              <TerminalCommand command={block.command} />
            ) : null}
            {block.content_ref && !running ? (
              <PagedBlock block={block} lines={budget} />
            ) : (
              <BoundedResult lines={budget} running={running}>
                <BlockBody block={block} text={block.text ?? ''} />
              </BoundedResult>
            )}
            {block.type === 'terminal' && !running ? (
              <p className="text-sm text-muted-foreground">
                {block.timed_out
                  ? 'Process timed out.'
                  : block.exit_code !== undefined
                    ? `Process exited with code ${block.exit_code}.`
                    : ''}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
