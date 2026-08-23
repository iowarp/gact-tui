import type { ToolInvocation } from '@clio/core/v3';
import { getToolSummary } from './tool-presentation';

/** Groups repeated completed work while preserving every authoritative activity elsewhere. */
export function groupToolsForWork(
  tools: readonly ToolInvocation[],
): Array<{ key: string; tool: ToolInvocation; count: number }> {
  const groups = new Map<string, { key: string; tool: ToolInvocation; count: number }>();
  for (const tool of tools) {
    const active = tool.state === 'pending' || tool.state === 'running';
    const key = active
      ? tool.id
      : [tool.name, tool.title, tool.state, getToolSummary(tool)].join('\u0000');
    const current = groups.get(key);
    if (current) current.count += 1;
    else groups.set(key, { key, tool, count: 1 });
  }
  return [...groups.values()];
}
