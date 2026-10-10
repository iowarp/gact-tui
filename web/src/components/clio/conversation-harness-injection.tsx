import type { MessageBlock } from '@clio/core/v3';
import { SyringeIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { humanizeProtocolValue } from './presentation-labels';
import { useTranscriptDisclosure } from './transcript-disclosure-context';

type InjectionBlock = Extract<MessageBlock, { type: 'injection' }>;

const INJECTION_LABELS: Record<string, string> = {
  earlier_turns: 'Recovered conversation context',
  todos: 'Todo list',
  plan_mode: 'Plan reminder',
  replan: 'Replanning suggestion',
  memory_search: 'Memory search results',
  task_results: 'Results from background tasks',
  path_hint: 'Path suggestion',
  circuit_breaker: 'Repeated-failure warning',
  result_spilled: 'Large result saved to a file',
  hook: 'Hook',
  summarization: 'Summarization',
  variant_drafting: 'Drafting alternatives',
  variant_advice: 'Advice for this draft',
};

/** Show a recorded harness addition, retaining the exact text the agent received. */
export function HarnessInjection({
  block,
  compact = false,
}: {
  block: InjectionBlock;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useTranscriptDisclosure(`injection:${block.id}`);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const label = INJECTION_LABELS[block.source] ?? humanizeProtocolValue(block.source);
  return (
    <section className="min-w-0 max-w-full" data-slot="harness-injection">
      <div
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground',
          compact ? 'text-xs' : 'text-sm font-medium',
        )}
      >
        <SyringeIcon
          aria-hidden="true"
          className={compact ? 'size-3.5 shrink-0' : 'size-4 shrink-0'}
        />
        <span title={compact ? `${vocab.product} gave the agent` : undefined}>
          {compact ? label : `${vocab.product} gave the agent: ${label}`}
        </span>
        <button
          aria-expanded={expanded}
          className="text-xs font-medium text-primary underline-offset-2 hover:text-primary/80 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => setExpanded(!expanded)}
          type="button"
        >
          {expanded ? 'Hide' : 'Show what it got'}
        </button>
        <button
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => setDetailsOpen(true)}
          type="button"
        >
          Open exact details
        </button>
      </div>
      {expanded ? (
        <pre className="mt-2 min-w-0 max-w-full whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs leading-5">
          {block.text}
        </pre>
      ) : null}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="flex max-h-[88dvh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              The recorded content {vocab.agent} gave the agent.
            </DialogDescription>
          </DialogHeader>
          <pre className="min-h-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-5">
            {block.text}
          </pre>
        </DialogContent>
      </Dialog>
    </section>
  );
}
