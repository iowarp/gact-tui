import type { ToolInvocation } from './domain.js';

/** The calls made from inside `parentId` (a run_code script's tool calls), oldest first. */
export function childToolInvocations(
  tools: Readonly<Record<string, ToolInvocation>>,
  parentId: string,
): ToolInvocation[] {
  return Object.values(tools)
    .filter((tool) => tool.parent_call_id === parentId)
    .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''));
}

/** Whether a call is shown under its parent rather than as its own row. */
export function isNestedToolInvocation(
  tool: ToolInvocation,
  tools: Readonly<Record<string, ToolInvocation>>,
): boolean {
  return Boolean(tool.parent_call_id && tools[tool.parent_call_id]);
}
