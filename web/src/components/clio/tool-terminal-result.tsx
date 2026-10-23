import type { ToolPresentationBlock } from '@clio/core/v3';
import {
  Terminal,
  TerminalCommand,
  TerminalContent,
  TerminalHeader,
} from '@/components/ai-elements/terminal';
import { BoundedResult } from './bounded-result';
import { PagedBlock } from './tool-result-primitives';
import { SavedTerminalOutput } from './tool-result-saved-output';

/** A Run result has one command section and one output section, including saved excerpts. */
export function ToolTerminalResult({
  block,
  saved,
  lines,
  running,
}: {
  block: ToolPresentationBlock;
  saved: readonly ToolPresentationBlock[];
  lines: number;
  running: boolean;
}) {
  const excerpts = running ? [] : saved.filter((item) => item.text || item.content_ref);
  const outputBlocks = [block, ...excerpts];
  const renderOutput = (item: ToolPresentationBlock, text: string) => (
    <div className="min-w-0">
      {item.id !== block.id && item.detail ? (
        <p className="border-t border-terminal-border px-3 pt-2 text-xs text-terminal-muted">
          {item.detail}
        </p>
      ) : null}
      <TerminalContent
        output={text}
        className="max-h-none overflow-visible bg-terminal px-3 py-2 text-terminal-foreground [&>pre]:p-0"
      />
    </div>
  );
  return (
    <Terminal output={block.text ?? ''} autoScroll={false} isStreaming={running}>
      {block.command ? (
        <section aria-label="Input command" data-slot="run-command">
          <TerminalHeader className="border-b-0 px-3 py-1.5 text-xs text-terminal-muted">
            Command
          </TerminalHeader>
          <BoundedResult lines={Math.min(lines, 3)} title="Command">
            <TerminalCommand command={block.command} className="border-b-0 px-3" />
          </BoundedResult>
          {block.detail ? (
            <p className="px-3 pb-2 text-xs text-terminal-muted">{block.detail}</p>
          ) : null}
        </section>
      ) : null}
      <section
        aria-label="Command output"
        className={block.command ? 'border-t border-terminal-border' : ''}
        data-slot="run-output"
      >
        <TerminalHeader className="border-b-0 px-3 py-1.5 text-xs text-terminal-muted">
          Output
        </TerminalHeader>
        {outputBlocks.some((item) => item.content_ref) && !running ? (
          <PagedBlock
            block={block}
            groupedBlocks={outputBlocks}
            lines={lines}
            renderBlock={renderOutput}
          />
        ) : (
          <BoundedResult lines={lines} running={running} title="Output">
            {!running && !outputBlocks.some((item) => item.text) ? (
              <p className="px-3 py-2 text-xs text-terminal-muted">
                No stdout or stderr was recorded.
              </p>
            ) : null}
            {outputBlocks.map((item) => (
              <div key={item.id}>{renderOutput(item, item.text ?? '')}</div>
            ))}
          </BoundedResult>
        )}
        {running ? null : saved.map((item) => <SavedTerminalOutput key={item.id} block={item} />)}
        {!running && (block.timed_out || block.exit_code !== undefined) ? (
          <p className="border-t border-terminal-border px-3 py-2 text-xs text-terminal-muted">
            {block.timed_out
              ? 'Process timed out.'
              : `Process exited with code ${block.exit_code}.`}
          </p>
        ) : null}
      </section>
    </Terminal>
  );
}
