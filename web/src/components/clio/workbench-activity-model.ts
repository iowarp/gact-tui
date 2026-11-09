import type {
  Artifact,
  AsyncProcess,
  PendingInteraction,
  Run,
  SessionDiff,
  SessionWork,
  SubagentRun,
  Task,
  ToolInvocation,
} from '@clio/core/v3';
import { openHumanQuestions } from '@/lib/inline-question';
import { artifactDisplayName } from '@/lib/dashboard-presentation';
import { formatCompactBytes } from '@/lib/format';
import type { EvidenceSource } from './observability-evidence-sources';
import { isSettledTaskActivity, taskActivity } from './task-activity';
import { taskProgressLabel } from './task-progress-label';
import { TOOL_OPERATIONS } from './tool-operation-contract';
import { formatToolDuration, getToolActivityTitle, getToolStatus } from './tool-presentation';
import { fileName } from './workbench-shared';

/** What one Activity row is about; it picks the icon and what a click opens. */
export type ActivityKind =
  | 'tool'
  | 'search'
  | 'file'
  | 'diff'
  | 'subagent'
  | 'process'
  | 'task'
  | 'question'
  | 'approval'
  | 'work'
  | 'artifact'
  | 'source'
  | 'turn';

/** The kinds the filter menu offers, each a set of row kinds. */
export type ActivityFilter =
  | 'tools'
  | 'files'
  | 'subagents'
  | 'tasks'
  | 'questions'
  | 'approvals'
  | 'work'
  | 'outputs';

export const ACTIVITY_FILTERS: readonly { id: ActivityFilter; label: string }[] = [
  { id: 'tools', label: 'Tool calls' },
  { id: 'files', label: 'Files' },
  { id: 'subagents', label: 'Subagents' },
  { id: 'tasks', label: 'Tasks and processes' },
  { id: 'questions', label: 'Questions' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'work', label: 'Work items' },
  { id: 'outputs', label: 'Outputs and sources' },
];

export type ActivityGroup = 'now' | 'turn' | 'earlier';

export const ACTIVITY_GROUPS: readonly { id: ActivityGroup; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'turn', label: 'This turn' },
  { id: 'earlier', label: 'Earlier' },
];

export type WorkSlot = 'plan' | 'todos' | 'goal' | 'loop' | 'schedule';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  filter: ActivityFilter;
  group: ActivityGroup;
  /** One line: "ndp_fetch", "Edited align_grids.sh", "Turn 3". */
  name: string;
  /** The short trailing column: "62%", "40ms", "+24 −3", "4 steps". */
  trailing: string;
  /** The state in words, for the accessible name and the hover name. */
  status: string;
  running: boolean;
  failed: boolean;
  at?: string;
  tool?: ToolInvocation;
  process?: AsyncProcess;
  subagent?: SubagentRun;
  task?: Task;
  interaction?: PendingInteraction;
  diff?: SessionDiff;
  artifact?: Artifact;
  source?: EvidenceSource;
  /** A file a tool read or wrote: the row opens the file itself. */
  path?: string;
  run?: Run;
  steps?: readonly ToolInvocation[];
  work?: WorkSlot;
}

export interface ActivityInput {
  tools: readonly ToolInvocation[];
  processes: readonly AsyncProcess[];
  subagents: readonly SubagentRun[];
  runs: readonly Run[];
  tasks: readonly Task[];
  interactions: readonly PendingInteraction[];
  diffs: readonly SessionDiff[];
  artifacts: readonly Artifact[];
  sources?: readonly EvidenceSource[];
  work?: SessionWork;
}

const RUNNING_STATES = new Set([
  'queued',
  'running',
  'recovering',
  'stopping',
  'waiting_permission',
  'waiting_user',
  'pause_requested',
  'cancellation_requested',
  'pending',
  'starting',
  'streaming',
]);
const FAILED_STATES = new Set(['failed', 'error', 'interrupted', 'recovery_required']);
/** Delegation tools whose task or child agent already has its own row. */
const DELEGATION_TOOLS = new Set([
  'spawn_agent_task',
  'spawn_agents_parallel',
  'run_flow',
  'run_workflow',
]);
const FILE_VERBS: Record<string, string> = {
  fs_read_file: 'Read',
  fs_write_file: 'Wrote',
  fs_edit_file: 'Edited',
};

function stateWord(state: string): string {
  if (state === 'completed' || state === 'succeeded') return 'done';
  if (state === 'task_state_uncertain') return 'needs inspection';
  return state.replaceAll('_', ' ');
}

function inputPath(tool: ToolInvocation): string | undefined {
  const input = tool.input;
  if (!input || typeof input !== 'object') return undefined;
  const path = (input as Record<string, unknown>).path;
  return typeof path === 'string' && path ? path : undefined;
}

function toolVerb(name: string): string | undefined {
  return FILE_VERBS[name] ?? FILE_VERBS[name.split(/[.:/]/u).pop() ?? ''];
}

function percent(done: unknown, total: unknown): string | undefined {
  return typeof done === 'number' && typeof total === 'number' && total > 0
    ? `${Math.min(100, Math.round((done / total) * 100))}%`
    : undefined;
}

/** A duration that fits the trailing column: 40ms, 2.4s, 3m, 2h. */
export function compactDuration(milliseconds: number): string {
  const elapsed = Math.max(0, milliseconds);
  if (elapsed < 1000) return `${Math.round(elapsed)}ms`;
  if (elapsed < 10_000) return `${(elapsed / 1000).toFixed(1).replace(/\.0$/u, '')}s`;
  if (elapsed < 60_000) return `${Math.round(elapsed / 1000)}s`;
  if (elapsed < 3_600_000) return `${Math.round(elapsed / 60_000)}m`;
  return `${Math.round(elapsed / 3_600_000)}h`;
}

/** A trailing value must fit its column; longer words stay in the hover name. */
function short(value: string | undefined, max = 9): string | undefined {
  return value && value.length <= max ? value : undefined;
}

function toolRow(tool: ToolInvocation, group: ActivityGroup): ActivityItem {
  const status = getToolStatus(tool);
  const running = RUNNING_STATES.has(status);
  const failed = FAILED_STATES.has(status) || status === 'cancelled';
  const path = inputPath(tool);
  const verb = toolVerb(tool.name);
  const isSearch = TOOL_OPERATIONS[tool.name]?.family === 'search';
  const duration = tool.duration_ms !== undefined ? formatToolDuration(tool.duration_ms) : '';
  const brief = tool.duration_ms !== undefined ? compactDuration(tool.duration_ms) : '';
  const trailing = running
    ? (percent(tool.progress, tool.progress_total) ?? 'running')
    : failed
      ? stateWord(status)
      : brief || stateWord(status);
  const statusWords = running ? 'running' : stateWord(status);
  return {
    id: `tool:${tool.id}`,
    kind: verb && path ? 'file' : isSearch ? 'search' : 'tool',
    filter: verb && path ? 'files' : 'tools',
    group: running ? 'now' : group,
    name: verb && path ? `${verb} ${fileName(path)}` : getToolActivityTitle(tool) || tool.name,
    trailing,
    status: duration && !running ? `${statusWords}, ${duration}` : statusWords,
    running,
    failed,
    at: tool.started_at ?? tool.completed_at,
    tool,
    path: verb && path ? path : undefined,
  };
}

/** One tool call as its own row, wherever it is listed. */
export function toolActivityItem(tool: ToolInvocation): ActivityItem {
  return toolRow(tool, 'turn');
}

function diffRow(diff: SessionDiff, group: ActivityGroup): ActivityItem {
  const added = diff.lines_added ?? 0;
  const removed = diff.lines_removed ?? 0;
  const reverted = diff.status === 'reverted';
  const name = `${diff.created ? 'Created' : 'Edited'} ${fileName(diff.path)}`;
  return {
    id: `diff:${diff.id}`,
    kind: 'diff',
    filter: 'files',
    group,
    name,
    trailing: reverted ? 'reverted' : `+${added} \u2212${removed}`,
    status: `${reverted ? 'reverted' : 'applied'}, ${added} ${added === 1 ? 'line' : 'lines'} added, ${removed} removed`,
    running: false,
    failed: false,
    at: diff.recorded_at,
    diff,
    path: diff.path,
  };
}

function taskRows(input: ActivityInput, groupAt: (at?: string) => ActivityGroup): ActivityItem[] {
  return taskActivity(input.processes, input.subagents).map((entry) => {
    const { process, subagent } = entry;
    const settled = isSettledTaskActivity(entry);
    const state = process ? (process.effective_status ?? process.live_state) : subagent!.state;
    const at = process?.updated_at ?? process?.created_at;
    const isAgent = Boolean(subagent) || process?.kind === 'agent';
    const running = !settled && RUNNING_STATES.has(state);
    const progress = process
      ? (percent(process.progress?.completed, process.progress?.total) ??
        short(taskProgressLabel(process.progress, process.task_kind, process.error_reason)))
      : undefined;
    const trailing = settled
      ? stateWord(state)
      : (progress ?? (isAgent ? 'subagent' : running ? 'running' : stateWord(state)));
    return {
      id: process ? `process:${process.id}` : `subagent:${subagent!.id}`,
      kind: isAgent ? 'subagent' : 'process',
      filter: isAgent ? 'subagents' : 'tasks',
      group: settled ? groupAt(at) : 'now',
      name: process?.title || subagent?.title || 'Task',
      trailing,
      status: settled ? stateWord(state) : running ? 'running' : stateWord(state),
      running,
      failed: FAILED_STATES.has(state),
      at,
      process,
      subagent,
    };
  });
}

function interactionRows(interactions: readonly PendingInteraction[]): ActivityItem[] {
  const open = new Set(openHumanQuestions(interactions).map((row) => row.id));
  return interactions.flatMap((interaction): ActivityItem[] => {
    if (open.has(interaction.id))
      return [
        {
          id: `question:${interaction.id}`,
          kind: 'question',
          filter: 'questions',
          group: 'now',
          name: interaction.title || interaction.prompt || 'Question',
          trailing: 'needs you',
          status: 'needs your answer',
          running: false,
          failed: false,
          at: interaction.created_at,
          interaction,
        },
      ];
    if (interaction.kind !== 'permission') return [];
    const pending = interaction.status === 'pending';
    return [
      {
        id: `approval:${interaction.id}`,
        kind: 'approval',
        filter: 'approvals',
        group: pending ? 'now' : 'earlier',
        name: interaction.title || interaction.source.tool_name || 'Approval',
        trailing: pending ? 'approve' : stateWord(interaction.status),
        status: pending ? 'waiting for approval' : stateWord(interaction.status),
        running: false,
        failed: false,
        at: interaction.created_at,
        interaction,
      },
    ];
  });
}

function workRows(work: SessionWork | undefined): ActivityItem[] {
  if (!work) return [];
  const rows: ActivityItem[] = [];
  const row = (
    slot: WorkSlot,
    id: string,
    name: string,
    trailing: string,
    status: string,
    active: boolean,
    at?: string,
  ) =>
    rows.push({
      id: `work:${id}`,
      kind: 'work',
      filter: 'work',
      group: active ? 'now' : 'earlier',
      name,
      trailing,
      status,
      running: false,
      failed: false,
      at,
      work: slot,
    });
  if (work.plan)
    row(
      'plan',
      'plan',
      'Plan',
      short(work.plan.status) ?? 'plan',
      `plan ${work.plan.status}`,
      true,
    );
  if (work.todos.length) {
    const done = work.todos.filter((todo) => todo.status === 'completed').length;
    row(
      'todos',
      'todos',
      'Todos',
      `${done}/${work.todos.length}`,
      `${done} of ${work.todos.length} done`,
      done < work.todos.length,
    );
  }
  for (const kind of ['goal', 'loop'] as const) {
    const record = work[kind];
    if (!record) continue;
    const phase = record.state === 'active' && record.phase ? record.phase : record.state;
    row(
      kind,
      `${kind}:${record.id}`,
      `${kind === 'goal' ? 'Goal' : 'Loop'}: ${record.title}`,
      short(stateWord(phase)) ?? stateWord(record.state),
      stateWord(phase),
      record.state === 'active' || record.state === 'paused',
      record.created_at,
    );
  }
  for (const schedule of work.schedules)
    row(
      'schedule',
      `schedule:${schedule.id}`,
      `Scheduled: ${schedule.question}`,
      schedule.enabled ? 'scheduled' : 'paused',
      schedule.enabled ? 'scheduled' : 'paused',
      schedule.enabled,
    );
  return rows;
}

const newestFirst = (left: ActivityItem, right: ActivityItem) =>
  (right.at ?? '').localeCompare(left.at ?? '');

/**
 * Everything the session did, as Activity rows: what runs now, what this turn
 * did, and earlier turns folded to one row each. Pure; the list memoizes it.
 */
export function activityItems(input: ActivityInput): ActivityItem[] {
  const runs = [...input.runs].sort((left, right) =>
    (left.started_at ?? '').localeCompare(right.started_at ?? ''),
  );
  const current = runs.at(-1);
  const currentStart = current?.started_at;
  const groupAt = (at?: string): ActivityGroup =>
    !currentStart || !at || at >= currentStart ? 'turn' : 'earlier';
  const runIndex = new Map(runs.map((run, index) => [run.id, index]));
  const diffCalls = new Set(input.diffs.flatMap((diff) => (diff.call_id ? [diff.call_id] : [])));
  const delegated = input.processes.length > 0 || input.subagents.length > 0;
  const toolsById = new Map(input.tools.map((tool) => [tool.id, tool]));

  const items: ActivityItem[] = [];
  const earlierSteps = new Map<string, ToolInvocation[]>();
  for (const tool of input.tools) {
    if (delegated && DELEGATION_TOOLS.has(tool.name)) continue;
    if (diffCalls.has(tool.id)) continue;
    const row = toolRow(tool, 'turn');
    if (row.group === 'now') {
      items.push(row);
      continue;
    }
    const index = tool.run_id === undefined ? undefined : runIndex.get(tool.run_id);
    if (index !== undefined && index < runs.length - 1) {
      const steps = earlierSteps.get(tool.run_id!) ?? [];
      steps.push(tool);
      earlierSteps.set(tool.run_id!, steps);
      continue;
    }
    items.push(index === undefined ? { ...row, group: groupAt(row.at) } : row);
  }
  runs.slice(0, -1).forEach((run, index) => {
    const steps = earlierSteps.get(run.id) ?? [];
    if (!steps.length && !run.summary) return;
    items.push({
      id: `turn:${run.id}`,
      kind: 'turn',
      filter: 'tools',
      group: 'earlier',
      name: `Turn ${index + 1}`,
      trailing: `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`,
      status: `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}, ${stateWord(run.state)}`,
      running: false,
      failed: FAILED_STATES.has(run.state),
      at: run.started_at,
      run,
      steps,
    });
  });
  for (const diff of input.diffs) {
    const tool = diff.call_id ? toolsById.get(diff.call_id) : undefined;
    const index = tool?.run_id === undefined ? undefined : runIndex.get(tool.run_id);
    const group =
      index !== undefined
        ? index === runs.length - 1
          ? 'turn'
          : 'earlier'
        : groupAt(diff.recorded_at);
    items.push(diffRow(diff, group));
  }
  items.push(...taskRows(input, groupAt));
  for (const task of input.tasks) {
    const running = RUNNING_STATES.has(task.state);
    items.push({
      id: `task:${task.id}`,
      kind: 'task',
      filter: 'tasks',
      group: running ? 'now' : 'turn',
      name: task.title,
      trailing: running ? 'running' : stateWord(task.state),
      status: running ? 'running' : stateWord(task.state),
      running,
      failed: FAILED_STATES.has(task.state),
      task,
    });
  }
  items.push(...interactionRows(input.interactions));
  for (const artifact of input.artifacts) {
    if (artifact.session_relation === 'used') continue;
    items.push({
      id: `artifact:${artifact.id}`,
      kind: 'artifact',
      filter: 'outputs',
      group: groupAt(artifact.created_at),
      name: artifactDisplayName(artifact),
      trailing: artifact.size !== undefined ? formatCompactBytes(artifact.size) : 'output',
      status: 'produced',
      running: false,
      failed: false,
      at: artifact.created_at,
      artifact,
    });
  }
  for (const source of input.sources ?? [])
    items.push({
      id: `source:${source.id}`,
      kind: 'source',
      filter: 'outputs',
      group: 'earlier',
      name: source.label,
      trailing: short(source.relation?.replaceAll('_', ' ')) ?? 'source',
      status: source.relation ? `source, ${source.relation.replaceAll('_', ' ')}` : 'source',
      running: false,
      failed: false,
      source,
    });
  items.push(...workRows(input.work));
  return ACTIVITY_GROUPS.flatMap(({ id }) =>
    items.filter((item) => item.group === id).sort(newestFirst),
  );
}

/** The rows a search and the kind filter leave, in the same order. */
export function filterActivity(
  items: readonly ActivityItem[],
  query: string,
  hidden: ReadonlySet<ActivityFilter>,
): readonly ActivityItem[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle && !hidden.size) return items;
  return items.filter(
    (item) =>
      !hidden.has(item.filter) &&
      (!needle ||
        item.name.toLocaleLowerCase().includes(needle) ||
        item.trailing.toLocaleLowerCase().includes(needle)),
  );
}
