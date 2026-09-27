import { useContext } from 'react';
import { FileTextIcon } from 'lucide-react';
import type { ToolPresentationBlock } from '@clio/core/v3';
import { TerminalContent } from '@/components/ai-elements/terminal';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BoundedResult } from './bounded-result';
import { PresentationNavigation } from './presentation-navigation';

/**
 * One saved stream inside a terminal card: what was kept, how it ends, and a
 * way to open all of it (grouping lives in `tool-result-saved-output-blocks`).
 */
export function SavedTerminalOutput({
  block,
  lines,
}: {
  block: ToolPresentationBlock;
  lines: number;
}) {
  const navigation = useContext(PresentationNavigation);
  const uri = block.uri ?? '';
  const onOpenFile = navigation?.onOpenFile;
  const canOpen = Boolean(uri && onOpenFile);
  const action = block.action_label ? (
    <Button
      className="shrink-0 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-60"
      disabled={!canOpen}
      onClick={canOpen ? () => onOpenFile?.(uri) : undefined}
      size="sm"
      title={canOpen ? uri : undefined}
      variant="ghost"
    >
      <FileTextIcon data-icon="inline-start" />
      {block.action_label}
    </Button>
  ) : null;
  return (
    <section
      aria-label={block.label}
      className="border-t border-zinc-800 pt-2"
      data-slot="terminal-saved-output"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3">
        <p className="min-w-0 text-sm text-zinc-300">{block.label}</p>
        {action && !canOpen ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>{action}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm text-sm">
                Open this session in its workspace to view the saved file.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          action
        )}
      </div>
      {block.text ? (
        <div className="mt-1 min-w-0">
          {block.detail ? <p className="px-3 text-xs text-zinc-500">{block.detail}</p> : null}
          <BoundedResult lines={lines} title={block.detail || block.label || 'Saved output'}>
            <TerminalContent className="max-h-none overflow-visible bg-zinc-950 p-3 text-zinc-100">
              <pre className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {block.text}
              </pre>
            </TerminalContent>
          </BoundedResult>
        </div>
      ) : null}
    </section>
  );
}
