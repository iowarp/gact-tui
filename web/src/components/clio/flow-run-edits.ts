import type { FlowRun, PendingInteraction } from '@clio/core/v3';

/**
 * How a workflow changed while it ran, read from what its run recorded: each
 * editor proposal with what became of it (added, approved, declined, rejected
 * with its typed reason, still awaiting approval), each cancelled step, and the
 * approval questions the run asked with the person's answers. Pure functions
 * over the run's events, view and the session's questions.
 */

export type WorkflowEditOutcome =
  | 'proposed'
  | 'awaiting'
  | 'added'
  | 'approved'
  | 'declined'
  | 'rejected'
  | 'cancelled'
  | 'cancel_refused';

export interface WorkflowEdit {
  /** The step proposed, added or cancelled. */
  step: string;
  /** Who asked for the change: an editor step, or a repair of one (`repair:<step>`). */
  by: string;
  target: string;
  after: string[];
  outcome: WorkflowEditOutcome;
  /** The typed reason the run recorded for a rejection or a refused cancel. */
  reason?: string;
  /** The reason the editor gave for the step. */
  note?: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** The step a change came from: an editor's own step, or the step it repaired. */
export function editOrigin(by: string): string {
  return by.startsWith('repair:') ? by.slice('repair:'.length) : by;
}

/** Every change editors made or asked for, in the order the run recorded them. */
export function workflowEdits(run: FlowRun): WorkflowEdit[] {
  const rows: WorkflowEdit[] = [];
  const open = new Map<string, WorkflowEdit>();
  for (const event of run.events) {
    const step = event.step ?? '';
    if (!step) continue;
    const by = text(event.by);
    switch (event.event) {
      case 'step_proposed': {
        const row: WorkflowEdit = {
          step,
          by,
          target: text(event.target),
          after: list(event.after),
          outcome: 'proposed',
        };
        rows.push(row);
        open.set(step, row);
        break;
      }
      case 'step_rejected':
      case 'step_added': {
        const row = open.get(step) ?? {
          step,
          by,
          target: text(event.target),
          after: list(event.after),
          outcome: 'proposed' as const,
        };
        if (!open.has(step)) rows.push(row);
        open.delete(step);
        if (event.event === 'step_added')
          row.outcome = event.approved === true ? 'approved' : 'added';
        else if (event.reason === 'not_approved') row.outcome = 'declined';
        else {
          row.outcome = 'rejected';
          row.reason = text(event.reason);
        }
        break;
      }
      case 'step_cancelled':
        rows.push({ step, by, target: '', after: [], outcome: 'cancelled' });
        break;
      case 'cancel_rejected':
        rows.push({
          step,
          by,
          target: '',
          after: [],
          outcome: 'cancel_refused',
          reason: text(event.reason),
        });
        break;
    }
  }
  const awaiting = run.view?.awaiting_approval ?? [];
  for (const proposal of awaiting) {
    const row = open.get(proposal.id);
    if (row) {
      row.outcome = 'awaiting';
      if (proposal.reason) row.note = proposal.reason;
      continue;
    }
    rows.push({
      step: proposal.id,
      by: proposal.by,
      target: proposal.target,
      after: proposal.after,
      outcome: 'awaiting',
      ...(proposal.reason ? { note: proposal.reason } : {}),
    });
  }
  const notes = new Map(
    (run.view?.steps ?? []).flatMap((step) =>
      step.description ? [[step.id, step.description]] : [],
    ),
  );
  for (const row of rows) if (!row.note && notes.has(row.step)) row.note = notes.get(row.step);
  return rows;
}

/** What became of a change, in words; a rejection's typed reason is shown beside it. */
export function editOutcomeText(edit: WorkflowEdit): string {
  switch (edit.outcome) {
    case 'proposed':
      return 'proposed';
    case 'awaiting':
      return 'awaiting your approval';
    case 'added':
      return 'added';
    case 'approved':
      return 'added after you approved it';
    case 'declined':
      return 'not added: you declined it';
    case 'rejected':
      return `not added: ${rejectionText(edit.reason ?? '')}`;
    case 'cancelled':
      return 'cancelled before it ran';
    case 'cancel_refused':
      return `cancel refused: ${rejectionText(edit.reason ?? '')}`;
  }
}

function rejectionText(reason: string): string {
  if (reason === 'max_added_reached') return 'the workflow reached its limit of added steps';
  if (reason === 'target_not_allowed') return 'the workflow does not allow that agent';
  if (reason === 'step_exists') return 'a step with that name already exists';
  if (reason === 'not_pending') return 'the step had already started';
  if (reason.startsWith('invalid:')) return `the step was invalid (${reason.slice(8).trim()})`;
  return reason ? reason.replaceAll('_', ' ') : 'no reason was recorded';
}

/** One approval question a run asked, with where it was asked and the answer. */
export interface FlowQuestion {
  id: string;
  prompt: string;
  /** The step it is about: the step a fork copies, or the step an editor proposed. */
  step?: string;
  /** `fork` for a fork's approval, `step` for an added step's. */
  about: 'fork' | 'step';
  status: PendingInteraction['status'];
  /** The answer in words ("Yes", the text written), empty while it waits. */
  answer: string;
  answeredBy?: PendingInteraction['answered_by'];
  /** When it was asked, for ordering. */
  created: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * The step an added-step approval is about, from the call's recorded key
 * (`<run>:ask:key=approve:<editor>:<index>:<step>:<digest>:<n>`); empty when the
 * call was not keyed that way.
 */
function askStep(invocation: string): string {
  const at = invocation.indexOf(':ask:key=approve:');
  if (at < 0) return '';
  const key = invocation.slice(at + ':ask:key='.length).split(':');
  // Drop the digest and the occurrence the run appends to every call key.
  key.splice(-2);
  return key.length >= 4 ? (key.at(-1) ?? '') : '';
}

function answerText(interaction: PendingInteraction): string {
  const payload = record(interaction.payload) ?? {};
  const options = Array.isArray(payload.options) ? payload.options.map(record) : [];
  const chosen = list(payload.selected_options).map((value) => {
    const option = options.find((row) => row && (row.value ?? row.label) === value);
    return typeof option?.label === 'string' ? option.label : value;
  });
  return [...chosen, text(payload.answer)].filter(Boolean).join(', ');
}

/** The questions this run asked, among a session tree's questions, oldest first. */
export function runQuestions(
  run: FlowRun,
  interactions: readonly PendingInteraction[],
): FlowQuestion[] {
  const asks = new Map(
    run.calls
      .filter((call) => call.kind === 'ask' && call.handle)
      .map((call) => [call.handle, askStep(call.invocation)] as const),
  );
  return interactions
    .flatMap((interaction): FlowQuestion[] => {
      const metadata = record(record(interaction.payload)?.metadata) ?? {};
      const fork = Boolean(run.run_id) && metadata.workflow_run === run.run_id;
      const ask =
        (interaction.task_id !== undefined && asks.has(interaction.task_id)) ||
        (Boolean(run.run_id) && metadata.flow_run === run.run_id);
      if (!fork && !ask) return [];
      const step = fork
        ? text(metadata.step)
        : (interaction.task_id && asks.get(interaction.task_id)) || '';
      return [
        {
          id: interaction.id,
          prompt: interaction.prompt || interaction.title,
          ...(step ? { step } : {}),
          about: fork ? 'fork' : 'step',
          status: interaction.status,
          answer: interaction.status === 'answered' ? answerText(interaction) : '',
          ...(interaction.answered_by ? { answeredBy: interaction.answered_by } : {}),
          created: interaction.created_at,
        },
      ];
    })
    .toSorted((left, right) => left.created.localeCompare(right.created));
}

/** Whether a run can have asked approval questions, so the view reads them only then. */
export function runAsksQuestions(run: FlowRun): boolean {
  return Boolean(run.view?.approve_edits) || run.calls.some((call) => call.kind === 'ask');
}
