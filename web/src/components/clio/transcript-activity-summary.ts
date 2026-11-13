import type { PendingInteraction, ToolInvocation } from '@clio/core/v3';
import { toolWaitsForYou } from './agent-answer-domain';
import type { ConversationIteration } from './conversation-turn-model';
import { TOOL_OPERATIONS } from './tool-operation-contract';
import { getToolStatus, isToolStopped } from './tool-presentation';
import { plural, t } from '@lingui/core/macro';
import { formatLocale } from '@/lib/locale-format';

/** A list of lowercase activity phrases begins the row, so its first letter is a capital. */
function sentenceStart(text: string): string {
  return text.charAt(0).toLocaleUpperCase(formatLocale()) + text.slice(1);
}

/** Keep entry disclosures about actions; numeric outcomes belong in the message footer. */
export function transcriptActivitySummary(
  iterations: readonly ConversationIteration[],
  interactions?: readonly PendingInteraction[],
): {
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
  if (thinking && !activeOperation) return { label: t`Thinking`, running: true, failed: 0 };
  const toolLabel = (tool: ToolInvocation) => {
    // A call paused on an approval or question waits for the person, even an async
    // ask_user that already returned its task handle.
    if (toolWaitsForYou(tool, interactions)) return t`waiting for you`;
    const active = ['pending', 'running'].includes(tool.state);
    if (tool.name === 'ask_user' && getToolStatus(tool) !== 'failed')
      return tool.state === 'running' ? t`asking questions` : t`asked questions`;
    const category = activityCategory(tool);
    if (category === 'remember') return active ? t`updating memory` : t`updated memory`;
    if (category === 'forget') return active ? t`forgetting` : t`forgot from memory`;
    if (category === 'recall') return active ? t`checking memory` : t`checked memory`;
    if (category === 'search') return active ? t`running searches` : t`searched`;
    if (category === 'read') return active ? t`reading files` : t`read files`;
    if (category === 'edit') {
      if (active) return t`editing files`;
      // A refused or failed write changed nothing; do not say it edited.
      return tool.state === 'succeeded' ? t`edited files` : t`tried to edit files`;
    }
    if (category === 'command') return active ? t`running commands` : t`ran commands`;
    return active ? t`using tools` : t`used tools`;
  };
  const actions = [
    ...new Set(
      iterations.flatMap((item) =>
        item.activity.flatMap((entry) => {
          if (entry.kind === 'tool') return [toolLabel(entry.tool)];
          if (entry.kind === 'subagent') return [running ? t`using tools` : t`used tools`];
          if (entry.kind === 'injection') return [injectionLabel(entry.block.source)];
          return [];
        }),
      ),
    ),
  ];
  // The phrases are lowercase list items; the list starts the row like a sentence.
  const label = sentenceStart(actions.join(', ') || t`activity`);
  const interruptionOnTool = iterations.some((item) => item.tools.some(isToolStopped));
  return {
    label:
      !interruptionOnTool && iterations.some((item) => item.interrupted)
        ? t`${label} (Interrupted)`
        : label,
    running,
    failed: iterations
      .flatMap((item) => item.tools)
      .filter((tool) => getToolStatus(tool) === 'failed').length,
  };
}

/**
 * A finished run of calls, counted for its collapsed row: "Called 3 tools,
 * edited 2 files, delegated 1 task, thought 2 times". Edits count distinct files;
 * delegates count the agents they started.
 */
export function transcriptRunSummary(
  iterations: readonly ConversationIteration[],
  subagentIdsOf: (tool: ToolInvocation) => readonly string[] = () => [],
): { label: string; failed: number; interrupted: number; denied: number } {
  const files = new Set<string>();
  const startedBy = new Set<string>();
  let edits = 0;
  let tools = 0;
  let delegated = 0;
  let questions = 0;
  let tasks = 0;
  let updates = 0;
  const activity = iterations.flatMap((item) => item.activity);
  for (const entry of activity) {
    if (entry.kind === 'tool') {
      const tool = entry.tool;
      if (TOOL_OPERATIONS[tool.name]?.family === 'assignment') {
        const ids = subagentIdsOf(tool);
        ids.forEach((id) => startedBy.add(id));
        delegated += Math.max(1, ids.length);
      } else if (tool.name === 'ask_user' && getToolStatus(tool) !== 'failed') {
        // A rejected call asked nothing; it counts as a call (and is marked failed).
        questions += 1;
      } else if (activityCategory(tool) === 'edit' && tool.state === 'succeeded') {
        const path = editedPath(tool.input);
        if (path) files.add(path);
        else edits += 1;
      } else {
        tools += 1;
      }
    }
  }
  for (const entry of activity) {
    if (entry.kind === 'subagent') {
      if (entry.block.stage !== 'delegate.started') updates += 1;
      else if (!startedBy.has(entry.block.subagent_id)) delegated += 1;
    } else if (entry.kind === 'task') {
      tasks += 1;
    } else if (entry.kind !== 'tool' && entry.kind !== 'diff') {
      updates += 1;
    }
  }
  const edited = files.size + edits;
  // Each thought and harness update is a row in the opened run, so the folded row counts it too.
  const thoughts = iterations.reduce((sum, item) => sum + item.thinking.length, 0);
  const received = plural(updates, { one: 'received # update', other: 'received # updates' });
  const parts = [
    tools ? plural(tools, { one: 'called # tool', other: 'called # tools' }) : '',
    edited ? plural(edited, { one: 'edited # file', other: 'edited # files' }) : '',
    delegated ? plural(delegated, { one: 'delegated # task', other: 'delegated # tasks' }) : '',
    tasks ? plural(tasks, { one: 'ran # task', other: 'ran # tasks' }) : '',
    questions ? plural(questions, { one: 'asked # question', other: 'asked # questions' }) : '',
    thoughts ? plural(thoughts, { 1: 'thought once', other: 'thought # times' }) : '',
    updates ? received : '',
  ].filter(Boolean);
  if (!parts.length) parts.push(received);
  const description = parts.join(', ');
  const all = iterations.flatMap((item) => item.tools);
  return {
    label: sentenceStart(description),
    failed: all.filter((tool) => getToolStatus(tool) === 'failed').length,
    interrupted: all.filter(isToolStopped).length,
    denied: all.filter((tool) => getToolStatus(tool) === 'denied').length,
  };
}

function editedPath(input: unknown): string | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const path = record.path ?? record.file_path;
  return typeof path === 'string' && path ? path : undefined;
}

function injectionLabel(source: string): string {
  if (source === 'question_answer') return t`received your answer`;
  if (['task_completion', 'task_result', 'task_results', 'memory_search'].includes(source))
    return t`received results`;
  if (source === 'memory') return t`received memory`;
  if (source === 'attention') return t`received a task notice`;
  if (source === 'goal_judgment') return t`received goal judgment`;
  if (source === 'loop_wake') return t`received loop wake`;
  if (source === 'scheduled_wake') return t`received scheduled wake`;
  if (source === 'summarization' || source === 'earlier_turns') return t`received context`;
  if (['plan_mode', 'todos', 'path_hint', 'replan', 'circuit_breaker', 'tool_use'].includes(source))
    return t`received reminder`;
  return t`received injection`;
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
