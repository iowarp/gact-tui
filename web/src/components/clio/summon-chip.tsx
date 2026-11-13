import type { SummonBlock } from '@/lib/sent-inline-references';
import { cn } from '@/lib/utils';
import { BotIcon, WorkflowIcon, WrenchIcon } from 'lucide-react';
import { t } from '@lingui/core/macro';

/** "Summoned workflow survey": the chip's accessible name for each kind of target. */
function summonedLabel(kind: string, target: string): string {
  if (kind === 'server') return t`Summoned tools ${target}`;
  if (kind === 'workflow') return t`Summoned workflow ${target}`;
  if (kind === 'flow') return t`Summoned flow ${target}`;
  return t`Summoned agent ${target}`;
}

/**
 * A subagent, workflow, flow or MCP server the person named with `@`, shown where
 * they typed it. It names what handles the message, so it reads as a chip, not a
 * link to open.
 */
export function SummonChip({ block, className }: { block: SummonBlock; className?: string }) {
  return (
    <span
      aria-label={summonedLabel(block.target_kind, block.target)}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 text-sm font-medium text-primary',
        className,
      )}
      data-slot="summon-chip"
    >
      {block.target_kind === 'server' ? (
        <WrenchIcon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : block.target_kind === 'workflow' || block.target_kind === 'flow' ? (
        <WorkflowIcon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <BotIcon aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      <span className="truncate">@{block.target}</span>
    </span>
  );
}
