import type { ConversationIteration } from './conversation-turn-model';
import { GroundedMessageResponse } from './grounded-message-response';
import { TranscriptReasoning } from './transcript-reasoning';
import { TranscriptReasoningRow } from './transcript-reasoning-row';

/** Keep the recorded reasoning and public update together, before their tools. */
export function TranscriptIterationText({ iteration }: { iteration: ConversationIteration }) {
  if (!iteration.thinking.length && !iteration.nextThoughts.length) return null;
  return (
    <div className="min-w-0 space-y-2" data-slot="transcript-text-entry">
      {iteration.thinking.map((thinking) => (
        <TranscriptReasoningRow
          key={thinking.id}
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
