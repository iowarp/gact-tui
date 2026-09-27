import type { ToolPresentationBlock } from '@clio/core/v3';

/**
 * A command whose output was too large to show in full has it saved to a file
 * in the workspace. The server declares that as a file `link` block placed
 * directly after the command's `terminal` block, carrying the plain label
 * ("Full output saved (20,000 lines, 391 KB)"), the last lines, their caption,
 * and the open action. Those blocks belong inside the terminal card.
 */
function isSavedOutput(block: ToolPresentationBlock | undefined): boolean {
  return block?.type === 'link' && block.target === 'file';
}

/** The saved-output blocks that directly follow the terminal block at `index`. */
export function savedOutputsAfter(
  blocks: readonly ToolPresentationBlock[],
  index: number,
): ToolPresentationBlock[] {
  const saved: ToolPresentationBlock[] = [];
  for (let i = index + 1; i < blocks.length && isSavedOutput(blocks[i]); i++) saved.push(blocks[i]);
  return saved;
}

/** Whether the block at `index` is rendered inside a preceding terminal card. */
export function belongsToTerminal(blocks: readonly ToolPresentationBlock[], index: number) {
  if (!isSavedOutput(blocks[index])) return false;
  let i = index - 1;
  while (i >= 0 && isSavedOutput(blocks[i])) i--;
  return i >= 0 && blocks[i].type === 'terminal';
}
