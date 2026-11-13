import { PLUGIN_CHANGE_INJECTION_SOURCE, type MessageBlock } from '@clio/core/v3';
import { MessageSquareIcon, SyringeIcon, TerminalIcon } from 'lucide-react';
import { useContext, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { ActivityBody, ActivityDisclosure, ActivityInfoButton, ActivityRow } from './activity-row';
import { CopyAction } from './tool-compact-row';
import { humanizeProtocolValue } from './presentation-labels';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { injectionPresentation, summonServerLabel } from './injection-presentation';
import { BoundedResult } from './bounded-result';
import { GroundedMessageResponse } from './grounded-message-response';
import { ToolTerminalResult } from './tool-terminal-result';
import { ToolDetailsContent } from './tool-details-content';
import { PluginChangeInjection } from './conversation-plugin-change';
import { SummarizationInjection } from './conversation-summarization';
import { useQuestionAnswer } from './question-answer-context';
import { PresentationNavigation } from './presentation-navigation';
import { PresentationLink } from './presentation-link';
import { agentMessageName } from './agent-message-presentation';
import { useLiveStore } from '@/store/live-store';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';
import { t, ph } from '@lingui/core/macro';

type InjectionBlock = Extract<MessageBlock, { type: 'injection' }>;

// Context the harness writes as markdown reads as prose; its exact text stays in ⓘ.
const MARKDOWN_SOURCES = new Set(['memory', 'session_facts']);
// The row body's text size, headings included, so a "## Memory" title doesn't outsize its row.
const ROW_MARKDOWN =
  'text-ui leading-[1.55] [&_h1]:text-ui [&_h2]:text-ui [&_h3]:text-ui [&_h4]:text-ui [&_h1]:my-1.5 [&_h2]:my-1.5 [&_h3]:my-1.5 [&_h4]:my-1.5 [&_p]:my-1.5 [&_li]:my-0.5';

/**
 * Backslashes are literal (Windows paths), not markdown escapes. Session facts are
 * one fact per line, so each line stays its own paragraph.
 */
function rowMarkdown(source: string, text: string): string {
  const literal = text.replace(/\\/gu, '\\\\');
  return source === 'session_facts'
    ? literal.replace(/\n(?!\n|\s*[-*+] |\s*\d+\. )/gu, '\n\n')
    : literal;
}

const INJECTION_LABELS: Record<string, string> = {
  goal_judgment: t`Goal judgment`,
  loop_wake: t`Loop wake`,
  scheduled_wake: t`Scheduled wake`,
  task_completion: t`Background task completion`,
  earlier_turns: t`Recovered conversation context`,
  todos: t`Todo list reminder`,
  plan_mode: t`Plan mode`,
  plan: t`Session plan`,
  plan_stale: t`Plan not updated lately`,
  plan_person_edit: t`Plan edited by you`,
  explore_nudge: t`Explore suggestion`,
  session_facts: t`Session facts`,
  child_report: t`Report instructions`,
  compaction_failed: t`Compaction failed`,
  compaction_skipped: t`Compaction skipped`,
  question_answer: t`Answer to a question`,
  plan_mode_short: t`Plan mode`,
  plan_truncated: t`Session plan (shortened)`,
  hook_defer: t`You chose to continue`,
  answer_hook: t`Hook answer`,
  mcp_elicitation: t`Question from a tool server`,
  replan: t`Replanning suggestion`,
  memory: t`Memory`,
  task_results: t`Results from background tasks`,
  task_result: t`Task result`,
  attention: t`Notice from a background task`,
  peer: t`Received message from an agent`,
  plugin_change: t`Plugins changed`,
  summon_server: t`Loaded tools you pointed this message at`,
  path_hint: t`Path suggestion`,
  circuit_breaker: t`Repeated-failure warning`,
  result_spilled: t`Large result saved to a file`,
  hook: t({ message: 'Hook', context: 'noun' }),
  summarization: t`Summarization`,
  variant_drafting: t`Drafting alternatives`,
  variant_advice: t`Advice for this draft`,
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
      ? sender
        ? t`Received message from ${sender}`
        : t`Received message from an agent`
      : (presentation?.label ??
        INJECTION_LABELS[block.source] ??
        humanizeProtocolValue(block.source)));
  const Icon = presentation
    ? presentation.terminal
      ? TerminalIcon
      : MessageSquareIcon
    : SyringeIcon;

  // The same row as a tool call or a thought: chevron, icon, name, then the fixed
  // right columns. An update has no duration or outcome; those columns stay empty.
  return (
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <section
        className="min-w-0 max-w-full"
        data-slot="harness-injection"
        data-source={block.source}
      >
        <ActivityRow
          open={expanded}
          onOpenChange={setExpanded}
          disclosure={
            <ActivityDisclosure
              open={expanded}
              label={block.source === 'peer' ? label : t`Injection ${label}`}
              onClick={() => setExpanded(!expanded)}
            />
          }
          icon={<Icon aria-hidden="true" />}
          name={
            <span className="block truncate" title={label}>
              {label}
            </span>
          }
          actions={<CopyAction value={presentation?.text ?? block.text} label={t`Copy ${label}`} />}
          elapsed={null}
          status={null}
          info={
            <ActivityInfoButton
              label={t`Technical details for ${label}`}
              hint={t`View the exact text added to the agent's context`}
              onClick={() => setDetailsOpen(true)}
            />
          }
        />
        {expanded ? (
          <ActivityBody label={label} framed={false} className="space-y-2">
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
                  <GroundedMessageResponse mode="static" className={ROW_MARKDOWN}>
                    {presentation.text}
                  </GroundedMessageResponse>
                ) : !presentation && MARKDOWN_SOURCES.has(block.source) ? (
                  <GroundedMessageResponse mode="static" className={ROW_MARKDOWN}>
                    {rowMarkdown(block.source, block.text)}
                  </GroundedMessageResponse>
                ) : presentation?.format === 'text' ? (
                  <div className="whitespace-pre-wrap text-ui leading-[1.55] [overflow-wrap:anywhere]">
                    {presentation.text}
                  </div>
                ) : (
                  <pre className="min-w-0 max-w-full whitespace-pre-wrap font-mono !text-label !leading-[1.55] [overflow-wrap:anywhere]">
                    {presentation?.text ??
                      (['task_result', 'peer', 'attention', 'question_answer'].includes(
                        block.source,
                      )
                        ? t`Recorded content is available in the information panel.`
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
                      ? t`Show ${ph({ label: task.label })} in Work`
                      : t`Show the script in Work`,
                }}
              />
            ))}
          </ActivityBody>
        ) : null}
        <ToolDetailsContent
          description={t`The exact text added to the agent's context.`}
          inline={false}
          title={t`${label}: Technical details`}
        >
          <pre className="min-h-0 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-label leading-[1.55] [overflow-wrap:anywhere]">
            {block.text}
          </pre>
        </ToolDetailsContent>
      </section>
    </Dialog>
  );
}
