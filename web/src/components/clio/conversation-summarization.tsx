import type { CompactionTrigger, MessageBlock, PendingCompaction } from '@clio/core/v3';
import { AlertTriangleIcon, SyringeIcon } from 'lucide-react';
import { useReducedMotionConfig } from 'motion/react';
import { useState } from 'react';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { vocab } from '@/lib/brand-vocabulary';
import { GroundedMessageResponse } from './grounded-message-response';
import { humanizeProtocolValue } from './presentation-labels';

type SummarizationBlock = Extract<MessageBlock, { type: 'injection' }>;

const SUMMARIZING_LABEL = 'Summarizing context';

/** Says who started a compaction: the service on its threshold, or the user. */
export function CompactionTriggerBadge({ trigger }: { trigger: CompactionTrigger }) {
  return <Badge variant="secondary">{trigger === 'auto' ? 'Automatic' : 'Requested'}</Badge>;
}

const toggleClassName =
  'text-xs font-medium text-primary underline-offset-2 hover:text-primary/80 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * The record of a compaction: the summary that replaced the earlier context,
 * shown like every other injection (a syringe: CLIO gave the agent this) with a
 * three-line preview of exactly what the agent received.
 */
export function SummarizationInjection({
  block,
  label,
}: {
  block: SummarizationBlock;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="min-w-0 max-w-full"
      data-slot="harness-injection"
      data-source="summarization"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-muted-foreground">
        <SyringeIcon aria-hidden="true" className="size-4 shrink-0" />
        <span>
          {vocab.product} gave the agent: {label}
        </span>
        {block.trigger ? <CompactionTriggerBadge trigger={block.trigger} /> : null}
        <button
          aria-expanded={expanded}
          className={toggleClassName}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      </div>
      {expanded ? (
        <div className="mt-2 min-w-0 max-w-full break-words">
          <GroundedMessageResponse>{block.text}</GroundedMessageResponse>
        </div>
      ) : (
        <p className="mt-1 line-clamp-3 min-w-0 max-w-full whitespace-pre-wrap break-words text-sm leading-5 text-muted-foreground">
          {block.text}
        </p>
      )}
    </section>
  );
}

/**
 * A compaction in progress, in the place its summary will appear: a shimmering
 * "Summarizing context" (static under reduced motion) with who started it. A
 * failed compaction shows its typed error here instead.
 */
export function ClioCompactionProgress({ compaction }: { compaction: PendingCompaction }) {
  const reducedMotion = useReducedMotionConfig();
  if (compaction.status === 'failed') {
    return (
      <Alert data-slot="compaction-failed" variant="destructive">
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle className="flex flex-wrap items-center gap-2">
          Context could not be summarized
          <CompactionTriggerBadge trigger={compaction.trigger} />
        </AlertTitle>
        <AlertDescription>
          {compaction.error?.message || 'The service did not report why.'}
          {compaction.error?.code ? (
            <span className="mt-1 block text-xs">
              {humanizeProtocolValue(compaction.error.code)}
            </span>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <section
      aria-live="polite"
      className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-muted-foreground"
      data-slot="compaction-progress"
      role="status"
    >
      <SyringeIcon aria-hidden="true" className="size-4 shrink-0" />
      {reducedMotion ? (
        <span>{SUMMARIZING_LABEL}</span>
      ) : (
        <Shimmer as="span" className="font-medium" duration={1.5}>
          {SUMMARIZING_LABEL}
        </Shimmer>
      )}
      <CompactionTriggerBadge trigger={compaction.trigger} />
    </section>
  );
}
