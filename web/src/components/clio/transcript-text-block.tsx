import type { MessageBlock, WorkspaceReference } from '@clio/core/v3';
import { useMemo } from 'react';
import { GroundedMessageResponse } from './grounded-message-response';
import { SentReferenceMessage } from './sent-reference-message';
import { AGENT_PROSE_CLASS } from './agent-prose';
import { ClioStreamingText } from './streaming-text';
import { cn } from '@/lib/utils';
import { bindTranscriptText } from '@/lib/transcript-content-selection';
import type { InlineReferenceBlock } from '@/lib/sent-inline-references';
import { contentRevision } from '@/lib/content-revision';

/** Bind selectable text to the exact source revision, without duplicating it in the DOM. */
export function TranscriptTextBlock({
  block,
  messageId,
  compactReferences,
  inlineReferences,
  onOpenReference,
}: {
  block: Extract<MessageBlock, { type: 'text' }>;
  messageId?: string;
  compactReferences?: boolean;
  inlineReferences?: readonly InlineReferenceBlock[];
  onOpenReference?: (reference: WorkspaceReference) => void;
}) {
  const revision = useMemo(
    () => (block.streaming ? undefined : contentRevision(block.text)),
    [block.text, block.streaming],
  );
  return (
    <div
      className={cn(
        'min-w-0 max-w-full wrap-break-word group-[.is-assistant]:mt-1.5 group-[.is-assistant]:mb-1',
        AGENT_PROSE_CLASS,
        // A prompt is the reader's own words: a sans bubble, not agent prose.
        'group-[.is-user]:rounded-[12px] group-[.is-user]:bg-secondary group-[.is-user]:px-3.5 group-[.is-user]:py-[9px] group-[.is-user]:font-sans group-[.is-user]:text-[0.84375rem] group-[.is-user]:leading-normal group-[.is-user]:wrap-anywhere',
      )}
      data-field="text"
      data-message-id={messageId}
      data-part-id={block.id}
      data-content-revision={revision}
      data-slot="message-text"
      ref={(element) =>
        bindTranscriptText(
          element,
          revision
            ? {
                source: block.text,
                partId: block.id,
                revision,
                field: 'text',
              }
            : undefined,
        )
      }
    >
      {block.streaming ? (
        <ClioStreamingText active text={block.text} />
      ) : compactReferences ? (
        <SentReferenceMessage
          inlineReferences={inlineReferences}
          onOpenReference={onOpenReference}
          text={block.text}
        />
      ) : (
        <GroundedMessageResponse>{block.text}</GroundedMessageResponse>
      )}
    </div>
  );
}
