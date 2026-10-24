import { PLUGIN_CHANGE_INJECTION_SOURCE, type MessageBlock } from '@clio/core/v3';
import { ChevronRightIcon, MessageSquareIcon, SyringeIcon, TerminalIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { humanizeProtocolValue } from './presentation-labels';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { injectionPresentation } from './injection-presentation';
import { BoundedResult } from './bounded-result';
import { GroundedMessageResponse } from './grounded-message-response';
import { ToolTerminalResult } from './tool-terminal-result';
import { ToolDetailsContent } from './tool-details-content';
import { PluginChangeInjection } from './conversation-plugin-change';

type InjectionBlock = Extract<MessageBlock, { type: 'injection' }>;

const INJECTION_LABELS: Record<string, string> = {
  goal_judgment: 'Goal judgment',
  loop_wake: 'Loop wake',
  scheduled_wake: 'Scheduled wake',
  task_completion: 'Background task completion',
  earlier_turns: 'Recovered conversation context',
  todos: 'Todo list reminder',
  plan_mode: 'Plan reminder',
  replan: 'Replanning suggestion',
  memory: 'Memory',
  task_results: 'Results from background tasks',
  task_result: 'Task result',
  peer: 'Agent message',
  plugin_change: 'Plugins changed',
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
  return block.source === PLUGIN_CHANGE_INJECTION_SOURCE ? (
    <PluginChangeInjection block={block} />
  ) : (
    <RecordedInjection block={block} compact={compact} />
  );
}

function RecordedInjection({ block, compact }: { block: InjectionBlock; compact: boolean }) {
  const [expanded, setExpanded] = useTranscriptDisclosure(`injection:${block.id}`);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const presentation = useMemo(
    () => injectionPresentation(block.source, block.text),
    [block.source, block.text],
  );
  const label =
    presentation?.label ?? INJECTION_LABELS[block.source] ?? humanizeProtocolValue(block.source);
  const Icon = presentation
    ? presentation.terminal
      ? TerminalIcon
      : MessageSquareIcon
    : SyringeIcon;
  const triggerLabel =
    block.source === 'summarization'
      ? block.trigger === 'manual'
        ? 'Requested'
        : 'Automatic'
      : '';
  return (
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <section
        className="min-w-0 max-w-full"
        data-slot="harness-injection"
        data-source={block.source}
      >
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            aria-label={`Injection ${label}${triggerLabel ? ` ${triggerLabel}` : ''}`}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            type="button"
            className={cn(
              'h-auto min-h-7 min-w-0 flex-1 shrink justify-start gap-2 rounded-sm px-1 py-1 text-left text-muted-foreground',
              compact ? 'pr-7 text-xs' : 'text-sm font-medium',
            )}
          >
            <Icon
              aria-hidden="true"
              className={compact ? 'size-3.5 shrink-0' : 'size-4 shrink-0'}
            />
            {!presentation ? <span className="shrink-0 text-xs font-normal">Injection</span> : null}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {triggerLabel ? (
              <span className="shrink-0 text-xs font-normal">{triggerLabel}</span>
            ) : null}
            <ChevronRightIcon
              aria-hidden="true"
              className={cn('size-3 shrink-0 transition-transform', expanded && 'rotate-90')}
            />
          </Button>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-5 shrink-0"
              aria-label={`Technical details for ${label}`}
              title="View original recorded content"
            >
              <InfoIcon className="size-4" />
            </Button>
          </DialogTrigger>
        </div>
        {expanded ? (
          <div className="mt-2 min-w-0 space-y-2 pl-1">
            {presentation?.attribution ? (
              <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {presentation.attribution}
              </p>
            ) : null}
            {presentation?.terminal ? (
              <ToolTerminalResult
                block={presentation.terminal}
                saved={[]}
                lines={8}
                running={false}
              />
            ) : (
              <BoundedResult lines={8} title={label}>
                {presentation?.format === 'markdown' ? (
                  <GroundedMessageResponse mode="static">
                    {presentation.text}
                  </GroundedMessageResponse>
                ) : (
                  <pre className="min-w-0 max-w-full whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                    {presentation?.text ??
                      (['task_result', 'peer', 'attention', 'question_answer'].includes(
                        block.source,
                      )
                        ? 'Recorded content is available in the information panel.'
                        : block.text)}
                  </pre>
                )}
              </BoundedResult>
            )}
            {presentation?.notice ? (
              <p className="text-sm text-muted-foreground">{presentation.notice}</p>
            ) : null}
          </div>
        ) : null}
        <ToolDetailsContent inline={false} title={`${label}: Technical details`}>
          <pre className="min-h-0 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-sm leading-6 [overflow-wrap:anywhere]">
            {block.text}
          </pre>
        </ToolDetailsContent>
      </section>
    </Dialog>
  );
}
