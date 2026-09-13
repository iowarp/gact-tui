import type { ToolInvocation } from '@clio/core/v3';

/** Identify a declared diff already represented by its tool result. */
export function toolOutputDiffKey(tool: ToolInvocation | undefined): string | undefined {
  const block = tool?.presentation?.blocks.find((candidate) => candidate.type === 'diff');
  return block?.text ? `${block.label ?? ''}\u0000${block.text}` : undefined;
}
