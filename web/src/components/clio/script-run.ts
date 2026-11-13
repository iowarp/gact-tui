import type { ToolPresentationBlock } from '@clio/core/v3';

/** A file the script viewed, which rode its result to the model (`attached-N`). */
export const attached = (block: ToolPresentationBlock) => block.id.startsWith('attached-');

/** A run_code call's own blocks: its source, what it returned or printed, what it showed the model. */
export function isScriptBody(blocks: readonly ToolPresentationBlock[]): boolean {
  return (
    blocks.some((block) => block.type === 'code') &&
    blocks.every(
      (block) =>
        (!block.severity || (block.severity === 'error' && block.type === 'text')) &&
        !block.content_ref &&
        (block.type === 'code' ||
          block.type === 'text' ||
          (block.type === 'workspace_file' && attached(block))),
    )
  );
}
