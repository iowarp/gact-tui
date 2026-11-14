import type { ToolPresentationBlock } from '@clio/core/v3';
import { CheckIcon, FolderIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Terminal,
  TerminalCommand,
  TerminalContent,
  TerminalHeader,
} from '@/components/ai-elements/terminal';
import { BoundedResult } from './bounded-result';
import { PagedBlock } from './tool-result-primitives';
import { SavedTerminalOutput } from './tool-result-saved-output';
import { terminalWorkingFolder } from './tool-terminal-folder';
import { t, ph } from '@lingui/core/macro';

/** Output without blank lines before or after it (the full text stays in Copy and details). */
const trimBlankLines = (text: string) => text.replace(/^(?:[ \t]*\r?\n)+/u, '').trimEnd();

/** Where the command ran: a folder button; hovering names the folder, clicking copies it. */
function WorkingFolderButton({ folder }: { folder: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t`Ran in ${folder}. Copy the folder path`}
            className="size-6 text-terminal-muted hover:text-terminal-foreground"
            data-slot="run-working-folder"
            onClick={() => {
              void navigator.clipboard?.writeText(folder).then(() => setCopied(true));
            }}
            size="icon-xs"
            variant="ghost"
          >
            {copied ? <CheckIcon aria-hidden="true" /> : <FolderIcon aria-hidden="true" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm text-xs">
          <span className="[overflow-wrap:anywhere]">
            {copied ? t`Copied: ${folder}` : t`Running in: ${folder}`}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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
  const folder = terminalWorkingFolder(block);
  const outputBlocks = [block, ...excerpts];
  const renderOutput = (item: ToolPresentationBlock, text: string) => (
    <div className="min-w-0">
      {item.id !== block.id && item.detail ? (
        <p className="border-t border-terminal-border px-3 pt-2 text-xs text-terminal-muted">
          {item.detail}
        </p>
      ) : null}
      <TerminalContent
        output={trimBlankLines(text)}
        className="max-h-none overflow-visible bg-terminal px-3 pb-2.5 pt-0 text-terminal-foreground [&>pre]:p-0"
      />
    </div>
  );
  return (
    <Terminal
      output={block.text ?? ''}
      autoScroll={false}
      isStreaming={running}
      // The spec's command block sits on the conversation's own surface in either theme.
      className="[--terminal-accent:var(--accent-foreground)] [--terminal-border:var(--border)] [--terminal-foreground:var(--foreground)] [--terminal-muted:var(--muted-foreground)] [--terminal:var(--background)]"
    >
      {block.command ? (
        <section aria-label={t`Input command`} data-slot="run-command">
          <TerminalHeader className="min-h-8 border-b-0 px-3 pb-1 pt-1.5 text-xs text-terminal-muted">
            <span>{t`Command`}</span>
            {folder ? <WorkingFolderButton folder={folder} /> : null}
          </TerminalHeader>
          <BoundedResult lines={Math.min(lines, 3)} title={t`Command`}>
            <TerminalCommand
              command={block.command}
              className="border-b-0 bg-transparent px-3 pb-2.5 pt-0"
            />
          </BoundedResult>
          {block.detail && !folder ? (
            <p className="px-3 pb-2.5 text-xs text-terminal-muted">{block.detail}</p>
          ) : null}
        </section>
      ) : null}
      <section
        aria-label={t`Command output`}
        className={block.command ? 'border-t border-terminal-border' : ''}
        data-slot="run-output"
      >
        <TerminalHeader className="min-h-8 border-b-0 px-3 pb-1 pt-1.5 text-xs text-terminal-muted">
          {t`Output`}
        </TerminalHeader>
        {outputBlocks.some((item) => item.content_ref) && !running ? (
          <PagedBlock
            block={block}
            groupedBlocks={outputBlocks}
            lines={lines}
            renderBlock={renderOutput}
          />
        ) : (
          <BoundedResult lines={lines} running={running} title={t`Output`}>
            {!running && !outputBlocks.some((item) => item.text) ? (
              <p className="px-3 pb-2.5 text-xs text-terminal-muted">
                {t`No stdout or stderr was recorded.`}
              </p>
            ) : null}
            {outputBlocks.map((item) => (
              <div key={item.id}>{renderOutput(item, item.text ?? '')}</div>
            ))}
          </BoundedResult>
        )}
        {running ? null : saved.map((item) => <SavedTerminalOutput key={item.id} block={item} />)}
        {!running && (block.timed_out || block.exit_code !== undefined) ? (
          <p className="border-t border-terminal-border px-3 py-2.5 text-xs text-terminal-muted">
            {block.timed_out
              ? t`Process timed out.`
              : t`Process exited with code ${ph({ exit_code: String(block.exit_code) })}.`}
          </p>
        ) : null}
      </section>
    </Terminal>
  );
}
