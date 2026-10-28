import type { FlowCall, FlowRun, WorkflowStep } from '@clio/core/v3';
import type { ClioStatusValue } from './status';

/**
 * How a step reads in a diagram: the class Pele draws it with and the word its
 * label carries. The word is always written, so the state never rests on color.
 */
export type FlowTone =
  | 'done'
  | 'running'
  | 'waiting'
  | 'failed'
  | 'cancelled'
  | 'proposed'
  | 'unknown';

export interface FlowState {
  value: ClioStatusValue;
  /** The chip label, e.g. "Completed". */
  label: string;
  /** The lower-case word a diagram label carries, e.g. "done". */
  word: string;
  tone: FlowTone;
}

/** A run's overall state with its text label: running, completed, or the typed outcome. */
export function flowRunStatus(run: Pick<FlowRun, 'status' | 'outcome'>): {
  value: ClioStatusValue;
  label: string;
} {
  if (run.status === 'running') return { value: 'running', label: 'Running' };
  if (run.status === 'completed') return { value: 'completed', label: 'Completed' };
  if (run.status === 'flow_stall') return { value: 'failed', label: 'Stalled' };
  if (run.status === 'task_state_uncertain')
    return { value: 'task_state_uncertain', label: 'Needs inspection' };
  if (run.status === 'cancelled') return { value: 'cancelled', label: 'Cancelled' };
  return { value: 'failed', label: `Stopped: ${run.status.replaceAll('_', ' ')}` };
}

/** Whether an empty task list is an unrecorded history rather than a live prelaunch state. */
export function flowTaskHistoryUnavailable(
  run: Pick<FlowRun, 'status' | 'outcome'>,
  taskCount: number,
): boolean {
  if (taskCount !== 0) return false;
  const status = flowRunStatus(run).value;
  return status !== 'running' && status !== 'completed' && status !== 'cancelled';
}

/**
 * A workflow step's state, always with its text label. A step the workflow
 * skipped because a step it waits on failed is reported as skipped, not as
 * cancelled by someone.
 */
export function workflowStepStatus(step: Pick<WorkflowStep, 'status'>, skipped = false): FlowState {
  switch (step.status) {
    case 'pending':
      return { value: 'queued', label: 'Waiting', word: 'waiting', tone: 'waiting' };
    case 'running':
      return { value: 'running', label: 'Running', word: 'running', tone: 'running' };
    case 'completed':
      return { value: 'completed', label: 'Completed', word: 'done', tone: 'done' };
    case 'failed':
      return { value: 'failed', label: 'Failed', word: 'failed', tone: 'failed' };
    case 'cancelled':
      return skipped
        ? { value: 'cancelled', label: 'Skipped', word: 'skipped', tone: 'cancelled' }
        : { value: 'cancelled', label: 'Cancelled', word: 'cancelled', tone: 'cancelled' };
    case 'repaired':
      return { value: 'recovering', label: 'Repaired', word: 'repaired', tone: 'done' };
    default:
      return {
        value: 'unknown',
        label: 'State not recognized',
        word: 'state unknown',
        tone: 'unknown',
      };
  }
}

/** A flow call's task state with its text label; a state this client does not know is spelled out. */
export function flowCallStatus(status: string): FlowState {
  switch (status) {
    case 'returned_after_stop':
      return {
        value: 'completed',
        label: 'Returned after flow stopped',
        word: 'returned after stop',
        tone: 'done',
      };
    case 'unknown':
      return { value: 'unknown', label: 'Not confirmed', word: 'not confirmed', tone: 'unknown' };
    case 'returned':
      return { value: 'completed', label: 'Returned', word: 'returned', tone: 'done' };
    case 'not_run':
    case 'not_accepted':
      return { value: 'cancelled', label: 'Did not run', word: 'did not run', tone: 'cancelled' };
    case 'rejected':
      return { value: 'failed', label: 'Rejected', word: 'rejected', tone: 'failed' };
    case 'output_rejected':
      return { value: 'failed', label: 'Output rejected', word: 'output rejected', tone: 'failed' };
    case 'dispatching':
    case 'accepted':
      return { value: 'running', label: 'Started', word: 'started', tone: 'running' };
    case 'pending':
    case 'queued':
      return { value: 'queued', label: 'Waiting', word: 'waiting', tone: 'waiting' };
    case 'running':
      return { value: 'running', label: 'Running', word: 'running', tone: 'running' };
    case 'completed':
      return { value: 'completed', label: 'Completed', word: 'done', tone: 'done' };
    case 'failed':
      return { value: 'failed', label: 'Failed', word: 'failed', tone: 'failed' };
    case 'cancelled':
      return { value: 'cancelled', label: 'Cancelled', word: 'cancelled', tone: 'cancelled' };
    case 'task_state_uncertain':
      return {
        value: 'task_state_uncertain',
        label: 'Needs inspection',
        word: 'needs inspection',
        tone: 'failed',
      };
    case '':
      return { value: 'unknown', label: 'Not reported', word: 'not reported', tone: 'unknown' };
    default: {
      const label = status.replaceAll('_', ' ');
      return { value: 'unknown', label, word: label, tone: 'unknown' };
    }
  }
}

const PROPOSED: FlowState = {
  value: 'waiting_user',
  label: 'Awaiting approval',
  word: 'awaiting approval',
  tone: 'proposed',
};

/** Who a call runs: the session's own agent reads as "this agent". */
export function flowTargetLabel(target: string, agentRef: string): string {
  if (!target) return 'Target not reported';
  return target === 'self' || (agentRef !== '' && target === agentRef) ? 'this agent' : target;
}

/** One step of a workflow as the transcript card, the panel and the diagram present it. */
export interface FlowStep {
  id: string;
  target: string;
  targetLabel: string;
  /** The instructions the agent wrote for this step (text or an object). */
  input: unknown;
  after: string[];
  status: FlowState;
  /** The task that runs it, once it started. */
  handle?: string;
  /** `flow` when the step runs another flow, `editor` when it may edit the workflow. */
  kind: 'agent' | 'flow' | 'editor' | 'proposal' | 'action';
  label?: string;
  /** The editor that added this step while the workflow ran. */
  addedBy?: string;
  /** The reason an editor gave for adding or proposing it. */
  note?: string;
  /** How many times it ran: more than one after a retry or an editor's repair. */
  attempts: number;
  /** A fork: the step it is a copy of, drawn beside it (`<step>~<n>`). */
  forkOf?: string;
  /** The forks of the steps this one waits on: its wait covers them too. */
  alsoWaitsOn?: string[];
}

/** The workflow's steps, in workflow order, then the proposals still waiting for approval. */
export function workflowSteps(run: FlowRun, agentRef: string): FlowStep[] {
  if (run.execution?.length) {
    const seen = new Map<string, number>();
    const totals = new Map<string, number>();
    for (const row of run.execution) totals.set(row.label, (totals.get(row.label) ?? 0) + 1);
    return run.execution.map((row): FlowStep => {
      const count = (seen.get(row.label) ?? 0) + 1;
      seen.set(row.label, count);
      const repeated = (totals.get(row.label) ?? 0) > 1;
      return {
        id: row.id,
        label: repeated ? `${row.label} ${count}` : row.label,
        target: row.target,
        targetLabel: row.target ? flowTargetLabel(row.target, agentRef) : '',
        input: undefined,
        after: row.after,
        status: flowCallStatus(row.status),
        ...(row.handle ? { handle: row.handle } : {}),
        kind: row.kind === 'flow' ? 'flow' : row.kind === 'action' ? 'action' : 'agent',
        ...(row.detail ? { note: row.detail } : {}),
        attempts: row.status === 'not_run' ? 0 : 1,
      };
    });
  }
  const view = run.view;
  if (!view) return [];
  const kinds = new Map(run.calls.map((call) => [call.invocation, call.kind]));
  const skipped = new Set(
    run.events.flatMap((event) =>
      event.event === 'step_skipped' && event.step ? [event.step] : [],
    ),
  );
  const addedBy = new Map(
    run.events.flatMap((event) =>
      event.event === 'step_added' && event.step
        ? [[event.step, typeof event.by === 'string' ? event.by : ''] as const]
        : [],
    ),
  );
  const steps = view.steps.map(
    (step): FlowStep => ({
      id: step.id,
      target: step.target,
      targetLabel: flowTargetLabel(step.target, agentRef),
      input: step.input,
      after: step.after,
      status:
        step.status === 'pending' && run.status !== 'running'
          ? flowCallStatus('not_run')
          : workflowStepStatus(step, skipped.has(step.id)),
      ...(step.handle ? { handle: step.handle } : {}),
      kind: view.editors.includes(step.target)
        ? 'editor'
        : (step.invocation && kinds.get(step.invocation) === 'flow') ||
            step.invocation?.includes(':flow:')
          ? 'flow'
          : 'agent',
      ...(addedBy.has(step.id) ? { addedBy: addedBy.get(step.id) || 'an editor' } : {}),
      ...(step.description ? { note: step.description } : {}),
      attempts: stepAttempts(run, step),
      ...forkFields(step as Record<string, unknown>),
    }),
  );
  const known = withForks(steps, view, run, agentRef);
  for (const proposal of view.awaiting_approval) {
    if (known.has(proposal.id)) continue;
    steps.push({
      id: proposal.id,
      target: proposal.target,
      targetLabel: flowTargetLabel(proposal.target, agentRef),
      input: proposal.input,
      after: proposal.after,
      status: PROPOSED,
      kind: 'proposal',
      addedBy: proposal.by || 'an editor',
      ...(proposal.reason ? { note: proposal.reason } : {}),
      attempts: 0,
    });
  }
  return steps;
}

/** A fork row's own fields: the step it copies and the note it diverges on. */
function forkFields(step: Record<string, unknown>): Pick<FlowStep, 'forkOf' | 'note'> {
  const forkOf = typeof step['fork_of'] === 'string' ? step['fork_of'] : '';
  if (!forkOf) return {};
  const note = typeof step['note'] === 'string' ? step['note'] : '';
  return { forkOf, ...(note ? { note } : {}) };
}

/**
 * Add the run's forks beside their steps and make each step's dependents wait on
 * them too. A fork arrives as a step row right after its step (`fork_of` set) or
 * in the view's `forks` list once the step's wait reported it; the list adds only
 * forks the steps do not already carry. Returns the ids now present.
 */
function withForks(
  steps: FlowStep[],
  view: NonNullable<FlowRun['view']>,
  run: FlowRun,
  agentRef: string,
): Set<string> {
  const known = new Set(steps.map((step) => step.id));
  const listed = Array.isArray((view as Record<string, unknown>)['forks'])
    ? ((view as Record<string, unknown>)['forks'] as unknown[])
    : [];
  for (const raw of listed) {
    const row = asRecord(raw);
    const id = typeof row?.['id'] === 'string' ? row['id'] : '';
    const forkOf = typeof row?.['fork_of'] === 'string' ? row['fork_of'] : '';
    const original = steps.find((step) => step.id === forkOf);
    if (!row || !id || !original || known.has(id)) continue;
    const handle = typeof row['handle'] === 'string' ? row['handle'] : '';
    const note = typeof row['note'] === 'string' ? row['note'] : '';
    const status = typeof row['status'] === 'string' ? row['status'] : '';
    let at = steps.indexOf(original) + 1;
    while (steps[at]?.forkOf === forkOf) at += 1;
    steps.splice(at, 0, {
      id,
      target: original.target,
      targetLabel: flowTargetLabel(original.target, agentRef),
      input: original.input,
      after: [...original.after],
      status:
        !status && run.status === 'running'
          ? workflowStepStatus({ status: 'running' })
          : flowCallStatus(status),
      ...(handle ? { handle } : {}),
      kind: original.kind === 'editor' ? 'agent' : original.kind,
      forkOf,
      ...(note ? { note } : {}),
      attempts: 1,
    });
    known.add(id);
  }
  const forks = new Map<string, string[]>();
  for (const step of steps)
    if (step.forkOf) forks.set(step.forkOf, [...(forks.get(step.forkOf) ?? []), step.id]);
  if (!forks.size) return known;
  for (const step of steps) {
    if (step.forkOf) continue;
    const extra = step.after.flatMap((id) => forks.get(id) ?? []).filter((id) => id !== step.id);
    if (!extra.length) continue;
    step.after = [...new Set([...step.after, ...extra])];
    step.alsoWaitsOn = extra;
  }
  return known;
}

/**
 * How many times a workflow step ran: the distinct calls keyed to it and the
 * distinct tasks its events name; a repaired step ran at least twice.
 */
function stepAttempts(run: FlowRun, step: WorkflowStep): number {
  const keyed = (invocation: string) =>
    invocation.includes(`=step:${step.id}:`) || invocation.includes(`:step:${step.id}:`);
  const invocations = new Set(
    run.calls.flatMap((call) => (keyed(call.invocation) ? [call.invocation] : [])),
  );
  if (step.invocation) invocations.add(step.invocation);
  const handles = new Set(
    run.events.flatMap((event) =>
      event.step === step.id && typeof event.handle === 'string' && event.handle
        ? [event.handle]
        : [],
    ),
  );
  const seen = Math.max(invocations.size, handles.size);
  return step.status === 'repaired' ? Math.max(2, seen) : seen;
}

/** One member of a flow without a workflow: a council member, an arena entry, or a call. */
export interface FlowMember {
  key: string;
  label: string;
  target: string;
  targetLabel: string;
  status: FlowState;
  handle?: string;
  /** The arena judge picked this entry. */
  chosen: boolean;
  /** The perspective a council member was asked to answer from, when the agent named one. */
  perspective?: string;
  /** Shared by the calls the flow started together (one gather). */
  together?: string;
}

/** The judge's verdict or the synthesis a finished council or arena returned. */
export interface FlowVerdict {
  /** Arena: the 0-based entry the judge picked, as the judge numbered them. */
  winner?: number;
  rationale?: string;
  /** The flow's answer: a council's synthesis, an arena's winning entry with the verdict. */
  answer?: string;
}

export function flowVerdict(run: FlowRun): FlowVerdict {
  const result = asRecord(run.result);
  if (!result) return typeof run.result === 'string' ? { answer: run.result } : {};
  return {
    ...(typeof result.winner === 'number' ? { winner: result.winner } : {}),
    ...(typeof result.rationale === 'string' ? { rationale: result.rationale } : {}),
    ...(typeof result.answer === 'string' ? { answer: result.answer } : {}),
  };
}

/**
 * A council's members or an arena's entries: the calls its result lists, or
 * while it runs, the calls gathered together with the first one. A synthesis
 * or judge run as a call of its own is the flow's closing step, not a member.
 */
function memberCalls(run: FlowRun, calls: FlowCall[]): FlowCall[] {
  if (run.flow !== 'council' && run.flow !== 'arena') return calls;
  const result = asRecord(run.result);
  const listed = result?.[run.flow === 'council' ? 'members' : 'entries'];
  if (Array.isArray(listed) && listed.length) {
    const handles = new Set(listed.filter((value): value is string => typeof value === 'string'));
    return calls.filter((call) => call.handle !== undefined && handles.has(call.handle));
  }
  const group = calls[0]?.together;
  return group ? calls.filter((call) => call.together === group) : calls;
}

/**
 * The tasks a flow started, labelled as that flow names them. Arena entries
 * use the judge's own numbering (from 1) so its rationale reads against them.
 */
export function flowMembers(
  run: FlowRun,
  agentRef: string,
  args?: Record<string, unknown>,
): FlowMember[] {
  const options = asRecord(args?.options);
  const perspectives = Array.isArray(options?.perspectives)
    ? options.perspectives.filter((value): value is string => typeof value === 'string')
    : [];
  const verdict = flowVerdict(run);
  const calls = memberCalls(
    run,
    run.calls.filter((call) => call.kind !== 'ask'),
  );
  // Any other flow names a call by the agent it ran, numbered among that agent's calls.
  const named = (call: FlowCall) =>
    call.target !== '' && call.target !== 'self' && call.target !== agentRef;
  const perTarget = new Map<string, number>();
  for (const call of calls) perTarget.set(call.target, (perTarget.get(call.target) ?? 0) + 1);
  const seen = new Map<string, number>();
  return calls.map((call: FlowCall, index): FlowMember => {
    const nth = (seen.get(call.target) ?? 0) + 1;
    seen.set(call.target, nth);
    const label =
      run.flow === 'council'
        ? `Member ${index + 1}`
        : run.flow === 'arena'
          ? `Entry ${index + 1}`
          : named(call)
            ? (perTarget.get(call.target) ?? 0) > 1
              ? `${call.target} ${nth}`
              : call.target
            : `Call ${index + 1}`;
    const perspective =
      run.flow === 'council' && perspectives.length
        ? perspectives[index % perspectives.length]
        : undefined;
    return {
      key: call.invocation || `${index}`,
      label,
      target: call.target,
      targetLabel: flowTargetLabel(call.target, agentRef),
      status: flowCallStatus(call.status),
      ...(call.handle ? { handle: call.handle } : {}),
      ...(call.together ? { together: call.together } : {}),
      chosen: run.flow === 'arena' && verdict.winner === index + 1,
      ...(perspective ? { perspective } : {}),
    };
  });
}

/** Counts of steps by state, in words: "1 done, 1 failed, 3 skipped". */
export function stepTally(states: readonly FlowState[]): string {
  const counts = new Map<string, number>();
  for (const state of states) counts.set(state.word, (counts.get(state.word) ?? 0) + 1);
  return [...counts].map(([word, count]) => `${count} ${word}`).join(', ');
}

/**
 * The script the agent wrote, as JSON a person can copy: the workflow's steps
 * (live, including steps editors added) with its task and editing bounds, or a
 * flow's input and options.
 */
export function flowScriptJson(run: FlowRun, args?: Record<string, unknown>): string {
  const view = run.view;
  if (view) {
    return JSON.stringify(
      {
        ...(typeof args?.task === 'string' && args.task ? { task: args.task } : {}),
        workflow: {
          steps: view.steps.map((step) => ({
            id: step.id,
            target: step.target,
            after: step.after,
            ...(step.input !== undefined && step.input !== null ? { input: step.input } : {}),
            ...(step.description ? { description: step.description } : {}),
          })),
        },
        editors: view.editors,
        max_added_steps: view.max_added_steps ?? null,
        max_edit_rounds: view.max_edit_rounds ?? null,
        approve_edits: view.approve_edits,
      },
      null,
      2,
    );
  }
  return JSON.stringify(
    {
      flow: run.flow,
      input: args?.input ?? null,
      options: args?.options ?? null,
    },
    null,
    2,
  );
}

/** A step's instructions as readable text: strings as written, objects as JSON. */
export function inputText(input: unknown): string {
  if (input === undefined || input === null || input === '') return '';
  return typeof input === 'string' ? input : JSON.stringify(input, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
