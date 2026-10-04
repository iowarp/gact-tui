import type { MessageBlock } from '@clio/core/v3';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { useMemo } from 'react';
import { GroundedMessageResponse } from './grounded-message-response';
import { SentReferenceMessage } from './sent-reference-message';
import { ClioStreamingText } from './streaming-text';

/** Bind selectable text to the exact source revision, without duplicating it in the DOM. */
export function TranscriptTextBlock({
  block,
  messageId,
  compactReferences,
}: {
  block: Extract<MessageBlock, { type: 'text' }>;
  messageId?: string;
  compactReferences?: boolean;
}) {
  const revision = useMemo(
    () => (block.streaming ? undefined : bytesToHex(sha256(new TextEncoder().encode(block.text)))),
    [block.text, block.streaming],
  );
  return (
    <div
      className="min-w-0 max-w-full group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3"
      data-field="text"
      data-message-id={messageId}
      data-part-id={block.id}
      data-content-revision={revision}
      data-slot="message-text"
    >
      {block.streaming ? (
        <ClioStreamingText className="leading-7" active text={block.text} />
      ) : compactReferences ? (
        <SentReferenceMessage text={block.text} />
      ) : (
        <GroundedMessageResponse>{block.text}</GroundedMessageResponse>
      )}
    </div>
  );
}
