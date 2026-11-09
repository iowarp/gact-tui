import { bindTranscriptText } from '@/lib/transcript-content-selection';
import type { ReactNode } from 'react';
import { contentRevision } from '@/lib/content-revision';

export interface ThoughtSource {
  messageId: string;
  sessionId: string;
  partId: string;
  field: 'text' | 'thought';
  callId?: string;
}

/** Retain the stored identity when an iteration lifts reasoning out of its tool card. */
export function TranscriptReasoning({
  text,
  source,
  sourceStart = 0,
  children,
}: {
  text: string;
  source?: ThoughtSource;
  /** UTF-16 offset of a visible body whose title is displayed separately. */
  sourceStart?: number;
  children: ReactNode;
}) {
  const revision = contentRevision(text);
  return (
    <div
      data-message-id={source?.messageId}
      data-session-id={source?.sessionId}
      data-part-id={source?.partId}
      data-field={source?.field}
      data-content-revision={source ? revision : undefined}
      ref={(element) =>
        bindTranscriptText(
          element,
          source ? { ...source, source: text, revision, sourceStart } : undefined,
        )
      }
    >
      {children}
    </div>
  );
}
