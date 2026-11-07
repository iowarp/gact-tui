import type { ToolPresentationBlock } from '@clio/core/v3';

/** A wait's per-child report blocks (``wait-task-N``). */
export function childReports(blocks: readonly ToolPresentationBlock[]): ToolPresentationBlock[] {
  return blocks.filter((block) => block.id.startsWith('wait-task-'));
}
