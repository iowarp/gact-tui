import type { SummonBlock } from '@/lib/sent-inline-references';
import { cn } from '@/lib/utils';
import { BotIcon, WrenchIcon } from 'lucide-react';

/**
 * A subagent or MCP server the person named with `@`, shown where they typed it.
 * It names what handles the message, so it reads as a chip, not a link to open.
 */
export function SummonChip({ block, className }: { block: SummonBlock; className?: string }) {
  const kind = block.target_kind === 'server' ? 'tools' : 'agent';
  return (
    <span
      aria-label={`Summoned ${kind} ${block.target}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 text-sm font-medium text-primary',
        className,
      )}
      data-slot="summon-chip"
    >
      {block.target_kind === 'server' ? (
        <WrenchIcon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <BotIcon aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      <span className="truncate">@{block.target}</span>
    </span>
  );
}
