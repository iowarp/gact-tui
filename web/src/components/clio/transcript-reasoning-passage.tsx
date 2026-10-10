import { GroundedMessageResponse } from './grounded-message-response';
import { TranscriptReasoning, type ThoughtSource } from './transcript-reasoning';

/** Show the complete provider-released text once, distinct from public updates. */
export function TranscriptReasoningPassage({
  text,
  streaming = false,
  source,
}: {
  text: string;
  streaming?: boolean;
  source?: ThoughtSource;
}) {
  return (
    <aside
      aria-label="Reasoning"
      aria-busy={streaming || undefined}
      data-slot="transcript-reasoning"
      className="my-2 min-w-0 rounded-md bg-muted/35 px-3 py-2 text-sm text-muted-foreground"
    >
      <p className="mb-1 text-xs font-medium">Reasoning</p>
      <div data-slot="transcript-reasoning-text">
        <TranscriptReasoning text={text} source={source}>
          <GroundedMessageResponse className="leading-6" isAnimating={streaming}>
            {text}
          </GroundedMessageResponse>
        </TranscriptReasoning>
      </div>
    </aside>
  );
}
