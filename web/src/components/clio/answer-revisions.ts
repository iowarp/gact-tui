import type { MessageBlock } from '@clio/core/v3';

type TextBlock = Extract<MessageBlock, { type: 'text' }>;

export const ANSWER_HOOK_SOURCE = 'answer_hook';

/**
 * The answer parts a hook revised, by id, each with the `revised` notice that
 * replaces it in the transcript. The original stays readable behind that notice.
 */
export function answerRevisions(blocks: readonly MessageBlock[]): Map<string, TextBlock> {
  const revised = new Set(
    blocks.flatMap((block) =>
      block.type === 'notice' &&
      block.source === ANSWER_HOOK_SOURCE &&
      block.code === 'revised' &&
      block.metadata?.revises
        ? [block.metadata.revises]
        : [],
    ),
  );
  return new Map(
    blocks.flatMap((block) =>
      block.type === 'text' && revised.has(block.id) ? [[block.id, block] as const] : [],
    ),
  );
}
