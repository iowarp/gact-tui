import type { ToolInvocation } from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';

/** Keep entry disclosures about actions; numeric outcomes belong in the message footer. */
export function transcriptActivitySummary(iterations: readonly ConversationIteration[]): {
  label: string;
  running: boolean;
} {
  const running = iterations.some((item) => item.streaming);
  const activeWait = iterations
    .flatMap((item) => item.tools)
    .findLast(
      (tool) =>
        tool.name === 'wait_tasks' &&
        tool.state === 'running' &&
        tool.presentation?.summary?.startsWith('Waiting for '),
    );
  if (activeWait?.presentation?.summary)
    return { label: activeWait.presentation.summary, running: true };
  const toolLabel = (tool: ToolInvocation) => {
    if (tool.name === 'ask_user')
      return tool.state === 'running' ? 'asking questions' : 'asked questions';
    const category = activityCategory(tool);
    if (category === 'search') return running ? 'running searches' : 'searched';
    if (category === 'read') return running ? 'reading files' : 'read files';
    if (category === 'edit') return running ? 'editing files' : 'edited files';
    if (category === 'command') return running ? 'running commands' : 'ran commands';
    return running ? 'using tools' : 'used tools';
  };
  const actions = [
    ...new Set(
      iterations.flatMap((item) =>
        item.activity.flatMap((entry) => {
          if (entry.kind === 'tool') return [toolLabel(entry.tool)];
          if (entry.kind === 'subagent') return [running ? 'using tools' : 'used tools'];
          if (entry.kind === 'injection') return [injectionLabel(entry.block.source)];
          return [];
        }),
      ),
    ),
  ];
  const description = actions.join(', ') || 'activity';
  const label = description[0].toUpperCase() + description.slice(1);
  return {
    label: iterations.some((item) => item.interrupted) ? `${label} (Interrupted)` : label,
    running,
  };
}

function injectionLabel(source: string): string {
  if (['task_completion', 'task_results', 'memory_search'].includes(source))
    return 'received results';
  if (source === 'goal_judgment') return 'received goal judgment';
  if (source === 'loop_wake') return 'received loop wake';
  if (source === 'scheduled_wake') return 'received scheduled wake';
  if (source === 'summarization' || source === 'earlier_turns') return 'received context';
  if (['plan_mode', 'todos', 'path_hint', 'replan', 'circuit_breaker'].includes(source))
    return 'received reminder';
  return 'received injection';
}

function activityCategory(tool: ToolInvocation): 'search' | 'read' | 'edit' | 'command' | 'other' {
  if (['shell_bash', 'shell_run', 'exec_command'].includes(tool.name)) return 'command';
  if (['fs_read_file', 'fs_read_text_file', 'workspace_resource_read'].includes(tool.name))
    return 'read';
  if (['fs_write_file', 'fs_edit_file', 'apply_patch'].includes(tool.name)) return 'edit';
  if (['web_search', 'search', 'workspace_resource_search', 'fs_search'].includes(tool.name))
    return 'search';
  return 'other';
}
