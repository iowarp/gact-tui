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
import { vocab } from '@/lib/brand-vocabulary';
import { artifactDisplayName } from '@/lib/dashboard-presentation';
import { formatCompactBytes } from '@/lib/format';
import type { EvidenceSource } from './observability-evidence-sources';
import { isSettledTaskActivity, taskActivity } from './task-activity';
import { taskProgressLabel } from './task-progress-label';
import { TOOL_OPERATIONS } from './tool-operation-contract';
import {
  formatToolDuration,
  getToolActionLabel,
  getToolActivityTitle,
  getToolStatus,
  getToolSubject,
} from './tool-presentation';
import { fileName } from './workbench-shared';
import { plural, ph, t } from '@lingui/core/macro';

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
  { id: 'tools', label: t`Tool calls` },
  { id: 'files', label: t`Files` },
  { id: 'subagents', label: t`Subagents` },
  { id: 'tasks', label: t`Tasks and processes` },
  { id: 'questions', label: t`Questions` },
  { id: 'approvals', label: t`Approvals` },
  { id: 'work', label: t`Work items` },
  { id: 'outputs', label: t`Outputs and sources` },
];

export type ActivityGroup = 'now' | 'turn' | 'earlier';

export const ACTIVITY_GROUPS: readonly { id: ActivityGroup; label: string }[] = [
  { id: 'now', label: t`Now` },
  { id: 'turn', label: t`This turn` },
  { id: 'earlier', label: t`Earlier` },
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
/** A file tool's row name, with the file it touched. */
const FILE_VERBS: Record<string, (file: string) => string> = {
  fs_read_file: (file) => t`Read ${file}`,
  fs_write_file: (file) => t`Wrote ${file}`,
  fs_edit_file: (file) => t`Edited ${file}`,
};

/** A state as the trailing column and status line say it. */
const STATE_WORDS: Record<string, string> = {
  completed: t`done`,
  succeeded: t`done`,
  task_state_uncertain: t`needs inspection`,
  running: t`running`,
  paused: t`paused`,
  queued: t`queued`,
  failed: t`failed`,
  error: t`error`,
  denied: t`denied`,
  cancelled: t`cancelled`,
  interrupted: t`interrupted`,
  pending: t`pending`,
};

function stateWord(state: string): string {
  return STATE_WORDS[state] ?? state.replaceAll('_', ' ');
}

function inputPath(tool: ToolInvocation): string | undefined {
  const input = tool.input;
  if (!input || typeof input !== 'object') return undefined;
  const path = (input as Record<string, unknown>).path;
  return typeof path === 'string' && path ? path : undefined;
}

function toolVerb(name: string): ((file: string) => string) | undefined {
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

/** Subject words that only restate the call's category; a row says nothing more with them. */
export function isGenericActivitySubject(label: string): boolean {
  // The agent backend names every child after itself ("CLIO") whatever the brand.
  return (
    /^(?:task|tasks|subagent|subagents|session|agent|child agent|all|general|clio)$/iu.test(
      label.trim(),
    ) || label.trim().toLowerCase() === vocab.agent.toLowerCase()
  );
}

function inputText(tool: ToolInvocation, key: string): string | undefined {
  const input = tool.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const kwargs = record.kwargs;
  const value =
    record[key] ??
    (kwargs && typeof kwargs === 'object' ? (kwargs as Record<string, unknown>)[key] : undefined);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/u.test(text) ? `${text[0]!.toLocaleLowerCase()}${text.slice(1)}` : text;
}

const ABSOLUTE_PATH = String.raw`(?<![\w.])(?:[A-Za-z]:[\\/]|\\\\|/)[^\s"'),;]+`;

/** A brief without the machine paths a delegated task spells out for its child. */
function withoutAbsolutePaths(text: string): string {
  return text
    .replace(new RegExp(String.raw`\s+(?:located\s+)?(?:at|in|under)\s+${ABSOLUTE_PATH}`, 'gu'), '')
    .replace(
      new RegExp(ABSOLUTE_PATH, 'gu'),
      (path) => path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path,
    )
    .replace(/[\s,:]+$/u, '');
}

/** "python count.py" from `cd "C:\…\scratch" && python count.py`: the step that does the work. */
function commandBrief(command: string): string {
  const steps = command
    .split(/\s*(?:&&|\|\||;|\n)\s*/u)
    .map((step) => step.trim())
    .filter((step) => step && !/^(?:cd|pushd|set|export)\b/iu.test(step));
  const step = steps.at(-1) ?? command.trim();
  return step
    .split(/\s+/u)
    .slice(0, 3)
    .map((word) => {
      const bare = word.replace(/^["']|["']$/gu, '');
      return /[\\/]/u.test(bare) ? (bare.split(/[\\/]/u).filter(Boolean).at(-1) ?? bare) : bare;
    })
    .join(' ');
}

function waitName(tool: ToolInvocation): string {
  const input = tool.input as Record<string, unknown> | undefined;
  const tasks = input && typeof input === 'object' ? input.tasks : undefined;
  if (tasks === 'all') return t`Wait for all tasks`;
  if (Array.isArray(tasks) && tasks.length > 1)
    return plural(tasks.length, { one: 'Wait for # task', other: 'Wait for # tasks' });
  return t`Wait for a task`;
}

/**
 * One humane line for a tool call: "Read soil_sites.csv", "Run python count.py",
 * "Delegate count the rows…". Never a category word in brackets ("(Task)") or a
 * full path; those stay in the call's details.
 */
export function toolActivityName(tool: ToolInvocation): string {
  const path = inputPath(tool);
  const verb = toolVerb(tool.name);
  if (verb && path) return verb(fileName(path));
  const family = TOOL_OPERATIONS[tool.name]?.family;
  if (family === 'wait') return waitName(tool);
  if (tool.name === 'spawn_agent_task') {
    const what = inputText(tool, 'name') ?? inputText(tool, 'task')?.split(/(?<=\.)\s|\n/u)[0];
    if (what && !isGenericActivitySubject(what))
      return t`Delegate ${ph({ task: lowerFirst(withoutAbsolutePaths(what)) })}`;
  }
  const action = getToolActionLabel(tool).trim() || tool.name;
  const command =
    inputText(tool, 'command') ??
    tool.presentation?.blocks.find((block) => block.type === 'terminal' && block.command)?.command;
  if (command && !getToolSubject(tool))
    return t`${action} ${ph({ command: commandBrief(command) })}`;
  const title = getToolActivityTitle(tool);
  const subject = /\((.+)\)$/u.exec(title)?.[1]?.trim();
  if (!subject || isGenericActivitySubject(subject)) return action;
  return t`${action} ${subject}`;
}

/** How long a finished call took, from its reported duration or its timestamps. */
export function toolDurationMs(tool: ToolInvocation): number | undefined {
  if (tool.duration_ms !== undefined) return tool.duration_ms;
  const started = tool.started_at ? Date.parse(tool.started_at) : NaN;
  const completed = tool.completed_at ? Date.parse(tool.completed_at) : NaN;
  return Number.isFinite(started) && Number.isFinite(completed) && completed >= started
    ? completed - started
    : undefined;
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
    ? (percent(tool.progress, tool.progress_total) ?? t`running`)
    : failed
      ? stateWord(status)
      : brief || stateWord(status);
  const statusWords = running ? t`running` : stateWord(status);
  return {
    id: `tool:${tool.id}`,
    kind: verb && path ? 'file' : isSearch ? 'search' : 'tool',
    filter: verb && path ? 'files' : 'tools',
    group: running ? 'now' : group,
    name: toolActivityName(tool),
    trailing,
    status: duration && !running ? t`${statusWords}, ${duration}` : statusWords,
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
  const file = fileName(diff.path);
  const name = diff.created ? t`Created ${file}` : t`Edited ${file}`;
  const lines = plural(added, { one: '# line added', other: '# lines added' });
  return {
    id: `diff:${diff.id}`,
    kind: 'diff',
    filter: 'files',
    group,
    name,
    trailing: reverted ? t`reverted` : `+${added} \u2212${removed}`,
    status: reverted
      ? t`reverted, ${lines}, ${removed} removed`
      : t`applied, ${lines}, ${removed} removed`,
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
      : (progress ?? (isAgent ? t`subagent` : running ? t`running` : stateWord(state)));
    return {
      id: process ? `process:${process.id}` : `subagent:${subagent!.id}`,
      kind: isAgent ? 'subagent' : 'process',
      filter: isAgent ? 'subagents' : 'tasks',
      group: settled ? groupAt(at) : 'now',
      name: process?.title || subagent?.title || t`Task`,
      trailing,
      status: settled ? stateWord(state) : running ? t`running` : stateWord(state),
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
          name: interaction.title || interaction.prompt || t`Question`,
          trailing: t`needs you`,
          status: t`needs your answer`,
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
        name: interaction.title || interaction.source.tool_name || t`Approval`,
        trailing: pending ? t`approve` : stateWord(interaction.status),
        status: pending ? t`waiting for approval` : stateWord(interaction.status),
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
      t`Plan`,
      short(work.plan.status) ?? t`plan`,
      t`plan ${ph({ status: work.plan.status })}`,
      true,
    );
  if (work.todos.length) {
    const done = work.todos.filter((todo) => todo.status === 'completed').length;
    row(
      'todos',
      'todos',
      t`Todos`,
      `${done}/${work.todos.length}`,
      t`${done} of ${ph({ total: work.todos.length })} done`,
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
      kind === 'goal'
        ? t`Goal: ${ph({ title: record.title })}`
        : t`Loop: ${ph({ title: record.title })}`,
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
      t`Scheduled: ${ph({ question: schedule.question })}`,
      schedule.enabled ? t`scheduled` : t`paused`,
      schedule.enabled ? t`scheduled` : t`paused`,
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
      name: t`Turn ${ph({ number: index + 1 })}`,
      trailing: plural(steps.length, { one: '# step', other: '# steps' }),
      status: plural(steps.length, {
        one: `# step, ${ph({ state: stateWord(run.state) })}`,
        other: `# steps, ${ph({ state: stateWord(run.state) })}`,
      }),
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
      trailing: running ? t`running` : stateWord(task.state),
      status: running ? t`running` : stateWord(task.state),
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
      trailing: artifact.size !== undefined ? formatCompactBytes(artifact.size) : t`output`,
      status: t`produced`,
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
      trailing: short(source.relation?.replaceAll('_', ' ')) ?? t`source`,
      status: source.relation
        ? t`source, ${ph({ relation: source.relation.replaceAll('_', ' ') })}`
        : t`source`,
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
