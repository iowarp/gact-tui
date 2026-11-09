import type { MessageBlock, WorkspaceReference } from '@clio/core/v3';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { useMemo } from 'react';
import { GroundedMessageResponse } from './grounded-message-response';
import { SentReferenceMessage } from './sent-reference-message';
import { AGENT_PROSE_CLASS } from './agent-prose';
import { ClioStreamingText } from './streaming-text';
import { cn } from '@/lib/utils';
import { bindTranscriptText } from '@/lib/transcript-content-selection';
import type { InlineReferenceBlock } from '@/lib/sent-inline-references';

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
    () => (block.streaming ? undefined : bytesToHex(sha256(new TextEncoder().encode(block.text)))),
    [block.text, block.streaming],
  );
  return (
    <div
      className={cn(
        'min-w-0 max-w-full group-[.is-assistant]:mt-1.5 group-[.is-assistant]:mb-1',
        AGENT_PROSE_CLASS,
        // A prompt is the reader's own words: a sans bubble, not agent prose.
        'group-[.is-user]:rounded-xl group-[.is-user]:bg-secondary group-[.is-user]:px-3.5 group-[.is-user]:py-[9px] group-[.is-user]:font-sans group-[.is-user]:text-[13.5px] group-[.is-user]:leading-normal',
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
