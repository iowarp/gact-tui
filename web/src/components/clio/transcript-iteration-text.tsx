import type { ConversationIteration } from './conversation-turn-model';
import { GroundedMessageResponse } from './grounded-message-response';
import { TranscriptReasoning } from './transcript-reasoning';
import { TranscriptReasoningRow } from './transcript-reasoning-row';

/** Render recorded reasoning in place without an additional disclosure. */
export function IterationReasoningText({ iteration }: { iteration: ConversationIteration }) {
  return iteration.thinking.map((thinking) => (
    <div
      key={thinking.id}
      data-slot="transcript-reasoning-text"
      className="text-sm text-muted-foreground"
    >
      <TranscriptReasoning text={thinking.text} source={thinking.source}>
        <GroundedMessageResponse>{thinking.text}</GroundedMessageResponse>
      </TranscriptReasoning>
    </div>
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
  if ((!showReasoning || !iteration.thinking.length) && !iteration.nextThoughts.length) return null;
  return (
    <div className="min-w-0 space-y-2" data-slot="transcript-text-entry">
      {(showReasoning ? iteration.thinking : []).map((thinking) => (
        <TranscriptReasoningRow
          key={thinking.id}
          id={thinking.id}
          text={thinking.text}
          streaming={thinking.streaming}
          source={thinking.source}
        />
      ))}
      {iteration.nextThoughts.map((thought, index) => (
        <TranscriptReasoning
          key={`${iteration.id}:response:${index}`}
          text={thought}
          source={iteration.nextThoughtSources?.[index]}
        >
          <GroundedMessageResponse>{thought}</GroundedMessageResponse>
        </TranscriptReasoning>
      ))}
    </div>
  );
}
