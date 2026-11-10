import { PLUGIN_CHANGE_INJECTION_SOURCE, type MessageBlock } from '@clio/core/v3';
import { ChevronRightIcon, MessageSquareIcon, SyringeIcon, TerminalIcon } from 'lucide-react';
import { useContext, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { humanizeProtocolValue } from './presentation-labels';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { injectionPresentation, summonServerLabel } from './injection-presentation';
import { BoundedResult } from './bounded-result';
import { GroundedMessageResponse } from './grounded-message-response';
import { ToolTerminalResult } from './tool-terminal-result';
import { ToolDetailsContent } from './tool-details-content';
import { PluginChangeInjection } from './conversation-plugin-change';
import { SummarizationInjection } from './conversation-summarization';
import { StateView } from './primitives/state-view';
import { useQuestionAnswer } from './question-answer-context';
import { PresentationNavigation } from './presentation-navigation';
import { PresentationLink } from './presentation-link';
import { agentMessageName } from './agent-message-presentation';
import { useLiveStore } from '@/store/live-store';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';

type InjectionBlock = Extract<MessageBlock, { type: 'injection' }>;

const INJECTION_LABELS: Record<string, string> = {
  goal_judgment: 'Goal judgment',
  loop_wake: 'Loop wake',
  scheduled_wake: 'Scheduled wake',
  task_completion: 'Background task completion',
  earlier_turns: 'Recovered conversation context',
  todos: 'Todo list reminder',
  plan_mode: 'Plan mode',
  plan: 'Session plan',
  plan_stale: 'Plan not updated lately',
  plan_person_edit: 'Plan edited by you',
  explore_nudge: 'Explore suggestion',
  session_facts: 'Session facts',
  child_report: 'Report instructions',
  compaction_failed: 'Compaction failed',
  compaction_skipped: 'Compaction skipped',
  question_answer: 'Answer to a question',
  plan_mode_short: 'Plan mode',
  plan_truncated: 'Session plan (shortened)',
  hook_defer: 'You chose to continue',
  answer_hook: 'Hook answer',
  mcp_elicitation: 'Question from a tool server',
  replan: 'Replanning suggestion',
  memory: 'Memory',
  task_results: 'Results from background tasks',
  task_result: 'Task result',
  attention: 'Notice from a background task',
  peer: 'Received message from an agent',
  plugin_change: 'Plugins changed',
  summon_server: 'Loaded tools you pointed this message at',
  path_hint: 'Path suggestion',
  circuit_breaker: 'Repeated-failure warning',
  result_spilled: 'Large result saved to a file',
  hook: 'Hook',
  summarization: 'Summarization',
  variant_drafting: 'Drafting alternatives',
  variant_advice: 'Advice for this draft',
};

/**
 * Show a recorded harness addition, retaining the exact text the agent
 * received. Every source reads as one quiet line, so `compact` (Activity)
 * needs no separate treatment.
 */
export function HarnessInjection({ block }: { block: InjectionBlock; compact?: boolean }) {
  return block.source === PLUGIN_CHANGE_INJECTION_SOURCE ? (
    <PluginChangeInjection block={block} />
  ) : block.source === 'summarization' ? (
    <SummarizationInjection block={block} />
  ) : (
    <RecordedInjection block={block} />
  );
}

function RecordedInjection({ block }: { block: InjectionBlock }) {
  const questionContext = useQuestionAnswer();
  const navigation = useContext(PresentationNavigation);
  const previewLines = useTranscriptPreviewLines();
  const [expanded, setExpanded] = useTranscriptDisclosure(`injection:${block.id}`);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const presentation = useMemo(
    () => injectionPresentation(block.source, block.text, questionContext?.interactions),
    [block.source, block.text, questionContext?.interactions],
  );
  const sessionTitle = useLiveStore((state) =>
    presentation?.senderSessionId
      ? state.entities.sessions[presentation.senderSessionId]?.title
      : undefined,
  );
  const sender = agentMessageName(
    presentation?.senderSessionId,
    navigation?.subagents,
    sessionTitle,
  );
  const label =
    summonServerLabel(block) ??
    (presentation?.senderSessionId
      ? `Received message from ${sender || 'an agent'}`
      : (presentation?.label ??
        INJECTION_LABELS[block.source] ??
        humanizeProtocolValue(block.source)));
  const Icon = presentation
    ? presentation.terminal
      ? TerminalIcon
      : MessageSquareIcon
    : SyringeIcon;

  return (
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <section
        className="min-w-0 max-w-full"
        data-slot="harness-injection"
        data-source={block.source}
      >
        <StateView
          kind="marker"
          size="row"
          icon={Icon}
          title={
            <button
              aria-expanded={expanded}
              aria-label={block.source === 'peer' ? label : `Injection ${label}`}
              className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              onClick={() => setExpanded(!expanded)}
              title={label}
              type="button"
            >
              <span className="min-w-0 truncate">{label}</span>
              <ChevronRightIcon
                aria-hidden="true"
                className={cn(
                  'size-3 shrink-0 motion-safe:transition-transform',
                  expanded && 'rotate-90',
                )}
              />
            </button>
          }
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-auto size-6 shrink-0 text-faint hover:text-foreground"
              aria-label={`Technical details for ${label}`}
              title="View original recorded content"
            >
              <InfoIcon aria-hidden="true" className="size-3.5" />
            </Button>
          </DialogTrigger>
        </StateView>
        {expanded ? (
          <div className="mt-1 mb-2 ml-[11px] min-w-0 space-y-2 border-l border-border pl-[19px]">
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
              <BoundedResult lines={block.source === 'peer' ? previewLines : 8} title={label}>
                {presentation?.format === 'markdown' ? (
                  <GroundedMessageResponse mode="static">
                    {presentation.text}
                  </GroundedMessageResponse>
                ) : presentation?.format === 'text' ? (
                  <div className="whitespace-pre-wrap text-[13px] leading-[1.55] [overflow-wrap:anywhere]">
                    {presentation.text}
                  </div>
                ) : (
                  <pre className="min-w-0 max-w-full whitespace-pre-wrap font-mono !text-[11.5px] !leading-[1.55] [overflow-wrap:anywhere]">
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
            {presentation?.tasks?.map((task) => (
              <PresentationLink
                key={task.handle}
                block={{
                  id: `task-${task.handle}`,
                  type: 'link',
                  target: 'task',
                  uri: task.handle,
                  label:
                    presentation.tasks!.length > 1
                      ? `Show ${task.label} in Work`
                      : 'Show the script in Work',
                }}
              />
            ))}
          </div>
        ) : null}
        <ToolDetailsContent
          description="The exact text added to the agent's context."
          inline={false}
          title={`${label}: Technical details`}
        >
          <pre className="min-h-0 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-[11.5px] leading-[1.55] [overflow-wrap:anywhere]">
            {block.text}
          </pre>
        </ToolDetailsContent>
      </section>
    </Dialog>
  );
}
