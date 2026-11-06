import type { MessageBlock } from '@clio/core/v3';
import { referenceMention } from './composer-reference-domain';

export type ContextReferenceBlock = Extract<MessageBlock, { type: 'context_reference' }>;

export type InlineReferenceSegment =
  | { kind: 'text'; text: string }
  | { kind: 'reference'; block: ContextReferenceBlock };

function blockMention(block: ContextReferenceBlock): string {
  return referenceMention({ kind: block.ref_kind, id: block.ref_id, label: block.label });
}

/**
 * Split sent text at the `@mention` of each referenced block, the way the composer
 * wrote them in. The longest mention wins where one is a prefix of another
 * (`@run.h5` and `@run.h5::/entry`). Text without a mention returns one segment.
 */
export function inlineReferenceSegments(
  text: string,
  blocks: readonly ContextReferenceBlock[],
): InlineReferenceSegment[] {
  const mentions = blocks
    .map((block) => ({ block, mention: blockMention(block) }))
    .filter(({ mention }) => mention.length > 1)
    .sort((left, right) => right.mention.length - left.mention.length);
  const segments: InlineReferenceSegment[] = [];
  let start = 0;
  let at = text.indexOf('@');
  while (at >= 0 && mentions.length) {
    const match = mentions.find(({ mention }) => text.startsWith(mention, at));
    if (match) {
      if (at > start) segments.push({ kind: 'text', text: text.slice(start, at) });
      segments.push({ kind: 'reference', block: match.block });
      start = at + match.mention.length;
    }
    at = text.indexOf('@', match ? start : at + 1);
  }
  if (start < text.length) segments.push({ kind: 'text', text: text.slice(start) });
  return segments;
}

/** The ids of the reference blocks a message's text already shows inline. */
export function inlinedReferenceIds(
  texts: readonly string[],
  blocks: readonly ContextReferenceBlock[],
): Set<string> {
  return new Set(
    texts.flatMap((text) =>
      inlineReferenceSegments(text, blocks).flatMap((segment) =>
        segment.kind === 'reference' ? [segment.block.id] : [],
      ),
    ),
  );
}
