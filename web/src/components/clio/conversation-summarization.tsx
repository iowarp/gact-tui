import type { CompactionTrigger, MessageBlock, PendingCompaction } from '@clio/core/v3';
import { MessagesSquareIcon, PackageIcon, ScrollTextIcon, TriangleAlertIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { transcriptMessagePreviews } from '@/lib/transcript-message-preview';
import { ActivityBody, ActivityDisclosure, ActivityNest, ActivityRow } from './activity-row';
import { GroundedMessageResponse } from './grounded-message-response';
import { humanizeProtocolValue } from './presentation-labels';
import { GoalNotice } from './goal-notice';
import { StateView } from './primitives/state-view';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { TranscriptDivider } from './transcript-divider';
import { TranscriptMessagePreview } from './transcript-message-preview';
import { useTranscriptMessages } from './transcript-messages-context';

type SummarizationBlock = Extract<MessageBlock, { type: 'injection' }>;
type NoticeBlock = Extract<MessageBlock, { type: 'notice' }>;

/** Who started a compaction, as the hover name of its line. */
function compactionTriggerHint(trigger: CompactionTrigger | undefined) {
  return trigger === 'auto' ? 'Started automatically' : trigger ? 'Requested' : undefined;
}

/**
 * The record of a compaction, where it happened: a divider across the
 * transcript, "Compacted here, 61 messages summarized", with a chevron that
 * always shows it opens. Open, it reads as what the agent works from now: its
 * system prompt, the summary (open) and the turns it kept verbatim. Parts the
 * record does not carry say so instead of opening. Who started it is its hover
 * name.
 */
export function SummarizationInjection({
  block,
}: {
  block: SummarizationBlock;
  /** Retained for callers; the line names the compaction itself. */
  label?: string;
}) {
  const [expanded, setExpanded] = useTranscriptDisclosure(`summary:${block.id}`);
  const compacted = stringList(block.metadata?.compacted_message_ids);
  const line = compacted.length
    ? `Compacted here, ${countLabel(compacted.length)} summarized`
    : 'Compacted here, earlier messages summarized';
  return (
    <section
      className="my-px min-w-0 max-w-full"
      data-slot="harness-injection"
      data-source="summarization"
    >
      <TranscriptDivider
        data-slot="compaction-divider"
        icon={PackageIcon}
        onOpenChange={setExpanded}
        open={expanded}
        title={compactionTriggerHint(block.trigger)}
      >
        {line}
      </TranscriptDivider>
      {expanded ? <CompactionRecord block={block} /> : null}
    </section>
  );
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function countLabel(count: number) {
  return `${count} ${count === 1 ? 'message' : 'messages'}`;
}

function CompactionRecord({ block }: { block: SummarizationBlock }) {
  const systemPrompt =
    typeof block.metadata?.system_prompt === 'string' ? block.metadata.system_prompt : '';
  const keptSent = Array.isArray(block.metadata?.kept_message_ids);
  const keptIds = stringList(block.metadata?.kept_message_ids);
  return (
    <ActivityNest label="What the agent kept">
      <CompactionSection
        id={`${block.id}:system`}
        icon={<ScrollTextIcon aria-hidden="true" />}
        name="System prompt"
        absent="Not recorded"
        absentTitle="The agent had not recorded its system prompt when this compaction ran"
      >
        {systemPrompt ? (
          <pre className="max-h-80 overflow-auto p-3 font-mono text-[12px] leading-5 whitespace-pre-wrap">
            {systemPrompt}
          </pre>
        ) : null}
      </CompactionSection>
      <CompactionSection
        id={`${block.id}:summary`}
        icon={<PackageIcon aria-hidden="true" />}
        initiallyOpen
        name="Summary"
        framed={false}
      >
        <div className="min-w-0 break-words text-sm" data-slot="compaction-summary">
          <GroundedMessageResponse>{block.text}</GroundedMessageResponse>
        </div>
      </CompactionSection>
      <CompactionSection
        id={`${block.id}:kept`}
        icon={<MessagesSquareIcon aria-hidden="true" />}
        name="Recent turns kept verbatim"
        meta={keptIds.length ? countLabel(keptIds.length) : undefined}
        absent={keptSent ? 'None' : 'Not recorded'}
        absentTitle={
          keptSent
            ? 'The summary replaced every earlier message'
            : 'This agent does not record which turns it kept'
        }
      >
        {keptIds.length ? <KeptTurns ids={keptIds} /> : null}
      </CompactionSection>
    </ActivityNest>
  );
}

function CompactionSection({
  id,
  icon,
  name,
  meta,
  absent,
  absentTitle,
  initiallyOpen = false,
  framed = true,
  children,
}: {
  id: string;
  icon: ReactNode;
  name: string;
  meta?: string;
  /** What the row says when the record does not carry this part. */
  absent?: string;
  absentTitle?: string;
  initiallyOpen?: boolean;
  framed?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useTranscriptDisclosure(`compaction:${id}`, initiallyOpen);
  const available = Boolean(children);
  return (
    <>
      <ActivityRow
        data-slot="compaction-section"
        disclosure={
          <ActivityDisclosure
            disabled={!available}
            label={`${open ? 'Collapse' : 'Expand'} ${name}`}
            open={available && open}
            onClick={() => setOpen(!open)}
          />
        }
        icon={icon}
        name={name}
        onOpenChange={available ? setOpen : undefined}
        open={available && open}
        outcome={available ? meta : absent}
        outcomeTitle={available ? undefined : absentTitle}
        outcomeTone="muted"
      />
      {available && open ? (
        <ActivityBody framed={framed} label={name}>
          {children}
        </ActivityBody>
      ) : null}
    </>
  );
}

function KeptTurns({ ids }: { ids: readonly string[] }) {
  const messages = useTranscriptMessages();
  const previews = useMemo(() => transcriptMessagePreviews(messages), [messages]);
  return (
    <ul className="divide-y divide-border">
      {ids.map((id) => {
        const preview = previews.get(id);
        return (
          <li className="px-3 py-2" key={id}>
            {preview ? (
              <TranscriptMessagePreview marked={false} preview={preview} />
            ) : (
              <span className="text-xs text-muted-foreground">Not in this view</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A compaction that produced no summary: one error line. Why, its typed code
 * and who started it are the line's hover name and its accessible text.
 */
function CompactionFailure({
  code,
  message,
  trigger,
}: {
  code?: string;
  message: string;
  trigger?: CompactionTrigger;
}) {
  const facts = [
    message || 'The service did not report why.',
    code ? humanizeProtocolValue(code) : undefined,
    compactionTriggerHint(trigger),
  ].filter(Boolean);
  return (
    <div
      className="my-px w-fit min-w-0 max-w-full"
      data-slot="compaction-failed"
      title={facts.join(' ? ')}
    >
      <StateView
        kind="error"
        size="row"
        title={
          <>
            Earlier messages weren’t summarized
            <span className="sr-only">: {facts.join('. ')}</span>
          </>
        }
      />
    </div>
  );
}

/**
 * A service notice from the transcript. A failed compaction's notice is its
 * durable record and looks exactly like the live failure row it replaces.
 */
export function TranscriptNotice({ block }: { block: NoticeBlock }) {
  if (block.source === 'goal') return <GoalNotice block={block} />;
  if (block.source === 'compaction_failed') {
    return <CompactionFailure code={block.code} message={block.text} trigger={block.trigger} />;
  }
  const source = humanizeProtocolValue(block.source);
  return (
    <div className="my-px min-w-0 max-w-full" data-slot="transcript-notice" title={block.text}>
      <StateView
        kind="marker"
        size="row"
        icon={TriangleAlertIcon}
        title={block.text ? `${source}: ${block.text}` : source}
        detail={block.code ? humanizeProtocolValue(block.code) : undefined}
      />
    </div>
  );
}

/**
 * A compaction in progress, in the place its summary will appear: a spinner
 * and "Summarizing earlier messages…", with who started it as its hover name.
 * A failure not yet (or never) recorded in the transcript shows its error
 * line here instead.
 */
export function ClioCompactionProgress({ compaction }: { compaction: PendingCompaction }) {
  if (compaction.status === 'failed') {
    return (
      <CompactionFailure
        code={compaction.error?.code}
        message={compaction.error?.message ?? ''}
        trigger={compaction.trigger}
      />
    );
  }
  return (
    <div
      className="my-px w-fit min-w-0 max-w-full"
      data-slot="compaction-progress"
      title={compactionTriggerHint(compaction.trigger)}
    >
      <StateView kind="loading" size="row" title="Summarizing earlier messages…" />
    </div>
  );
}
