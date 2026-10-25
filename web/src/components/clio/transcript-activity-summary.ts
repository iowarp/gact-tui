import type { ToolInvocation } from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';
import { getToolStatus } from './tool-presentation';

/** Keep entry disclosures about actions; numeric outcomes belong in the message footer. */
export function transcriptActivitySummary(iterations: readonly ConversationIteration[]): {
  label: string;
  running: boolean;
  /** Failed calls in the group, marked on the collapsed row by an icon (the label stays verbs). */
  failed: number;
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
    return { label: activeWait.presentation.summary, running: true, failed: 0 };
  const thinking = iterations.some((item) =>
    item.thinking.some((thought) => thought.streaming && thought.text.trim().length > 0),
  );
  const activeOperation = iterations.some(
    (item) =>
      item.tools.some((tool) => ['pending', 'running'].includes(tool.state)) ||
      item.tasks.some((task) => ['queued', 'running'].includes(task.state)),
  );
  if (thinking && !activeOperation) return { label: 'Thinking', running: true, failed: 0 };
  const toolLabel = (tool: ToolInvocation) => {
    const active = ['pending', 'running'].includes(tool.state);
    if (tool.name === 'ask_user')
      return tool.state === 'running' ? 'asking questions' : 'asked questions';
    const category = activityCategory(tool);
    if (category === 'remember') return active ? 'updating memory' : 'updated memory';
    if (category === 'forget') return active ? 'forgetting' : 'forgot from memory';
    if (category === 'recall') return active ? 'checking memory' : 'checked memory';
    if (category === 'search') return active ? 'running searches' : 'searched';
    if (category === 'read') return active ? 'reading files' : 'read files';
    if (category === 'edit') {
      if (active) return 'editing files';
      // A refused or failed write changed nothing; do not say it edited.
      return tool.state === 'succeeded' ? 'edited files' : 'tried to edit files';
    }
    if (category === 'command') return active ? 'running commands' : 'ran commands';
    return active ? 'using tools' : 'used tools';
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
    failed: iterations
      .flatMap((item) => item.tools)
      .filter((tool) => getToolStatus(tool) === 'failed').length,
  };
}

function injectionLabel(source: string): string {
  if (['task_completion', 'task_result', 'task_results', 'memory_search'].includes(source))
    return 'received results';
  if (source === 'memory') return 'received memory';
  if (source === 'goal_judgment') return 'received goal judgment';
  if (source === 'loop_wake') return 'received loop wake';
  if (source === 'scheduled_wake') return 'received scheduled wake';
  if (source === 'summarization' || source === 'earlier_turns') return 'received context';
  if (['plan_mode', 'todos', 'path_hint', 'replan', 'circuit_breaker', 'tool_use'].includes(source))
    return 'received reminder';
  return 'received injection';
}

function activityCategory(
  tool: ToolInvocation,
): 'search' | 'read' | 'edit' | 'command' | 'remember' | 'forget' | 'recall' | 'other' {
  if (tool.name === 'create_memory' && memoryAction(tool.output) === 'already_remembered')
    return 'recall';
  if (['create_memory', 'update_memory'].includes(tool.name)) return 'remember';
  if (tool.name === 'forget_memory') return 'forget';
  if (['memory_search', 'memory_read'].includes(tool.name)) return 'recall';
  if (['shell_bash', 'shell_run', 'exec_command'].includes(tool.name)) return 'command';
  if (['fs_read_file', 'fs_read_text_file', 'workspace_resource_read'].includes(tool.name))
    return 'read';
  if (['fs_write_file', 'fs_edit_file', 'apply_patch'].includes(tool.name)) return 'edit';
  if (['web_search', 'search', 'workspace_resource_search', 'fs_search'].includes(tool.name))
    return 'search';
  return 'other';
}

/** The memory notice's action in a write's result (`already_remembered`: nothing changed). */
function memoryAction(output: unknown): string {
  const record = (value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  const top = record(output);
  const result = record(top?.structuredContent) ?? record(top?.result) ?? top;
  const action = record(result?.memory)?.action;
  return typeof action === 'string' ? action : '';
}
