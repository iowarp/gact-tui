import type { ConversationIteration } from './conversation-turn-model';
import { AGENT_PROSE_CLASS } from './agent-prose';
import { GroundedMessageResponse } from './grounded-message-response';
import { TranscriptReasoning } from './transcript-reasoning';
import { TranscriptReasoningPassage } from './transcript-reasoning-passage';
import { cn } from '@/lib/utils';

/** Keep the complete recorded reasoning distinct from public progress text. */
export function IterationReasoningText({ iteration }: { iteration: ConversationIteration }) {
  return iteration.thinking.map((thinking) => (
    <TranscriptReasoningPassage
      key={thinking.id}
      id={`${iteration.id}:${thinking.id}`}
      text={thinking.text}
      source={thinking.source}
      streaming={thinking.streaming}
      startedAt={thinking.startedAt}
      durationMs={thinking.durationMs}
    />
  ));
}

/** Keep the recorded reasoning and public update together, before their tools. */
export function TranscriptIterationText({
  iteration,
  showReasoning = true,
}: {
  iteration: ConversationIteration;
  showReasoning?: boolean;
}) {
  const reasoning = showReasoning && iteration.thinking.length > 0;
  if (!reasoning && !iteration.nextThoughts.length) return null;
  return (
    <>
      {/* Thought rows are a run of activity rows: they butt against the next run. */}
      {reasoning ? (
        <div className="min-w-0" data-row-run="" data-slot="transcript-thought-run">
          <IterationReasoningText iteration={iteration} />
        </div>
      ) : null}
      {iteration.nextThoughts.length ? (
        <div className="min-w-0 space-y-1" data-slot="transcript-text-entry">
          {iteration.nextThoughts.map((thought, index) => (
            <TranscriptReasoning
              key={`${iteration.id}:response:${index}`}
              text={thought}
              source={iteration.nextThoughtSources?.[index]}
            >
              <GroundedMessageResponse className={cn(AGENT_PROSE_CLASS, 'mt-1.5 mb-1')}>
                {thought}
              </GroundedMessageResponse>
            </TranscriptReasoning>
          ))}
        </div>
      ) : null}
    </>
  );
}
