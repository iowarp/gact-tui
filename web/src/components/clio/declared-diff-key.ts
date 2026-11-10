import type { ToolInvocation } from '@clio/core/v3';

/**
 * One change, however it was reported: the file's name and the diff's hunks. A reported
 * change names the absolute path and keeps its ``---``/``+++`` lines; the call that made it
 * names the file as written, so neither the folders nor the file lines tell them apart.
 */
export function diffKey(path: string, diff: string): string {
  const name = path.split(/[\\/]/u).filter(Boolean).at(-1) ?? '';
  const hunks = diff
    .split('\n')
    .filter((line) => !/^(---|\+\+\+) /u.test(line))
    .join('\n')
    .trim();
  return `${name}\u0000${hunks}`;
}

/** Identify a declared diff already represented by its tool result. */
export function toolOutputDiffKey(tool: ToolInvocation | undefined): string | undefined {
  const blocks = tool?.presentation?.blocks ?? [];
  const block = blocks.find((candidate) => candidate.type === 'diff');
  if (!block?.text) return undefined;
  const subject = blocks.find((candidate) => candidate.id === tool?.presentation?.subject);
  return diffKey(block.path || subject?.uri || subject?.label || block.label || '', block.text);
}

/**
 * The call already shows this reported change: the same change, or one the service reported
 * for that call (its id names the call; its hunks may carry more context than the call's own).
 */
export function toolShowsDiff(
  tool: ToolInvocation | undefined,
  block: { id: string; path: string; unified_diff: string },
): boolean {
  const key = toolOutputDiffKey(tool);
  if (!tool || !key) return false;
  return key === diffKey(block.path, block.unified_diff) || block.id.includes(`_${tool.id}_`);
}
