import type { ToolInvocation } from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';
import { getToolStatus } from './tool-presentation';

/** Count recorded invocations once; result blocks are not additional calls. */
export function transcriptActivitySummary(iterations: readonly ConversationIteration[]): {
  label: string;
  detail: string;
  running: boolean;
  failed: boolean;
} {
  const tools = [
    ...new Map(iterations.flatMap((item) => item.tools).map((tool) => [tool.id, tool])).values(),
  ];
  const running = iterations.some((item) => item.streaming);
  const completed = tools.filter((tool) => getToolStatus(tool) === 'succeeded').length;
  const failed = tools.some((tool) =>
    ['failed', 'denied', 'cancelled', 'degraded'].includes(getToolStatus(tool)),
  );
  const count = tools.length;
  const outcomes = ['failed', 'denied', 'cancelled', 'degraded']
    .map((status) => {
      const amount = tools.filter((tool) => getToolStatus(tool) === status).length;
      return amount ? `${amount} ${status === 'degraded' ? 'partial' : status}` : undefined;
    })
    .filter(Boolean);
  const label = count
    ? [
        `${count} ${count === 1 ? 'tool' : 'tools'}${completed === count ? ' completed' : ` · ${completed} completed`}`,
        ...outcomes,
      ].join(' · ')
    : running
      ? 'Thinking'
      : 'Activity';
  const counts = new Map<string, number>();
  for (const tool of tools) {
    const category = activityCategory(tool);
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const detail = [...counts]
    .map(([category, amount]) => {
      if (category === 'search') return `ran ${amount} ${amount === 1 ? 'search' : 'searches'}`;
      if (category === 'read') return `${amount} ${amount === 1 ? 'read' : 'reads'}`;
      return `ran ${amount} ${amount === 1 ? 'command' : 'commands'}`;
    })
    .join(', ');
  const interrupted = iterations.some((item) => item.interrupted);
  return {
    label: interrupted ? `${label} · Interrupted` : label,
    detail,
    running,
    failed: failed || interrupted,
  };
}

function activityCategory(tool: ToolInvocation): 'search' | 'read' | 'command' | undefined {
  if (['shell_bash', 'shell_run', 'exec_command'].includes(tool.name)) return 'command';
  if (['fs_read_file', 'fs_read_text_file', 'workspace_resource_read'].includes(tool.name))
    return 'read';
  if (['web_search', 'search', 'workspace_resource_search', 'fs_search'].includes(tool.name))
    return 'search';
  return undefined;
}
