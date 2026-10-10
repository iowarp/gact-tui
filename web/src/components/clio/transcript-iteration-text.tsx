import type { ConversationIteration } from './conversation-turn-model';
import { GroundedMessageResponse } from './grounded-message-response';
import { TranscriptReasoning } from './transcript-reasoning';
import { TranscriptReasoningPassage } from './transcript-reasoning-passage';

/** Keep the complete recorded reasoning distinct from public progress text. */
export function IterationReasoningText({ iteration }: { iteration: ConversationIteration }) {
  return iteration.thinking.map((thinking) => (
    <TranscriptReasoningPassage
      key={thinking.id}
      text={thinking.text}
      source={thinking.source}
      streaming={thinking.streaming}
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
  if ((!showReasoning || !iteration.thinking.length) && !iteration.nextThoughts.length) return null;
  return (
    <div className="min-w-0 space-y-2" data-slot="transcript-text-entry">
      {showReasoning ? <IterationReasoningText iteration={iteration} /> : null}
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
