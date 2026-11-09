import type { CompactionTrigger, MessageBlock, PendingCompaction } from '@clio/core/v3';
import { ChevronRightIcon, PackageIcon, TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GroundedMessageResponse } from './grounded-message-response';
import { humanizeProtocolValue } from './presentation-labels';
import { GoalNotice } from './goal-notice';
import { StateView } from './primitives/state-view';
import { useTranscriptDisclosure } from './transcript-disclosure-context';

type SummarizationBlock = Extract<MessageBlock, { type: 'injection' }>;
type NoticeBlock = Extract<MessageBlock, { type: 'notice' }>;

/** Who started a compaction, as the hover name of its line. */
function compactionTriggerHint(trigger: CompactionTrigger | undefined) {
  return trigger === 'auto' ? 'Started automatically' : trigger ? 'Requested' : undefined;
}

/**
 * The record of a compaction, where it happened: one quiet 28px line,
 * "Compacted here, earlier messages summarized". Pressing it discloses the
 * summary exactly as the agent received it; who started it is its hover name.
 */
export function SummarizationInjection({
  block,
}: {
  block: SummarizationBlock;
  /** Retained for callers; the line names the compaction itself. */
  label?: string;
}) {
  const [expanded, setExpanded] = useTranscriptDisclosure(`summary:${block.id}`);
  return (
    <section
      className="min-w-0 max-w-full"
      data-slot="harness-injection"
      data-source="summarization"
    >
      <StateView
        className="w-fit max-w-full"
        kind="marker"
        size="row"
        icon={PackageIcon}
        title={
          <button
            aria-expanded={expanded}
            className="group/compaction inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={() => setExpanded(!expanded)}
            title={compactionTriggerHint(block.trigger)}
            type="button"
          >
            <span className="min-w-0 truncate">Compacted here, earlier messages summarized</span>
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                'size-3 shrink-0 motion-safe:transition-[transform,opacity]',
                expanded
                  ? 'rotate-90'
                  : 'opacity-0 group-hover/compaction:opacity-100 group-focus-visible/compaction:opacity-100',
              )}
            />
          </button>
        }
      />
      {expanded ? (
        <div className="mt-1 mb-2 ml-[11px] min-w-0 max-w-full border-l border-border pl-[19px] break-words text-sm">
          <GroundedMessageResponse>{block.text}</GroundedMessageResponse>
        </div>
      ) : null}
    </section>
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
      className="w-fit min-w-0 max-w-full"
      data-slot="compaction-failed"
      title={facts.join(' ? ')}
    >
      <StateView
        kind="error"
        size="row"
        title={
          <>
            Earlier messages weren?t summarized
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
    <div className="min-w-0 max-w-full" data-slot="transcript-notice" title={block.text}>
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
 * and "Summarizing earlier messages?", with who started it as its hover name.
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
      className="w-fit min-w-0 max-w-full"
      data-slot="compaction-progress"
      title={compactionTriggerHint(compaction.trigger)}
    >
      <StateView kind="loading" size="row" title="Summarizing earlier messages?" />
    </div>
  );
}
