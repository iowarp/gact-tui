import { TransportError, cursorPageQuery } from './transport.js';
import { flowQuestionsPath } from './flow-run-domain.js';
import { studyCitedCalls, transformRecordPath } from './transform-record.js';

/**
 * What an export records of how a session ran, beside its transcript: the
 * session record, its task rows (the Work view's direct children, flows among
 * them), the Work ledger, every flow run's checkpoint view with the task record
 * of each call (so a step opens its answer and conversation), the questions
 * its flows asked with their answers, and the study the session belongs to
 * with the record of every call the study cites. Each read uses the exact path
 * the live views use, so the offline viewer replays them through the same
 * components.
 */

/** One captured GET, returning the decoded JSON or throwing the transport's error. */
export type OrchestrationRead = (path: string) => Promise<unknown>;

/** A study already captured under one session, by every branch it covers. */
export type CapturedStudies = Map<string, string>;

/** What an export has already captured across its sessions, so each read is stored once. */
export interface CapturedOrchestration {
  studies: CapturedStudies;
  /** The `call_id`s whose transform record is captured. */
  transforms: Set<string>;
}

const MAX_FLOW_DEPTH = 8;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The path the live task rows read, page by page (`asyncProcessesPage`, direct children). */
export function sessionTaskRowsPath(sessionId: string, cursor?: string): string {
  const query = cursorPageQuery({ cursor });
  query.set('include_descendants', 'false');
  return `/v1/sessions/${encodeURIComponent(sessionId)}/async-processes?${query}`;
}

/**
 * Capture one session's orchestration. A read that fails is recorded as the
 * response it was (so the viewer answers it the same way); failures other than
 * "not found" are reported through `fail`. `alias` records that a path answers
 * exactly as an already-captured one, so a study read by each of its branches
 * is stored once.
 */
export async function captureSessionOrchestration(
  read: OrchestrationRead,
  sessionId: string,
  captured: CapturedOrchestration,
  fail: (path: string, message: string) => void,
  alias: (path: string, sameAs: string) => void,
): Promise<void> {
  const prefix = `/v1/sessions/${encodeURIComponent(sessionId)}`;
  const attempt = async (path: string): Promise<unknown> => {
    try {
      return await read(path);
    } catch (error) {
      if (!(error instanceof TransportError && error.status === 404))
        fail(path, error instanceof Error ? error.message : String(error));
      return undefined;
    }
  };
  await attempt(prefix);
  await attempt(`${prefix}/work?cursor=0`);

  const { studies, transforms } = captured;
  const covered = studies.get(sessionId);
  if (covered) alias(`${prefix}/science-log`, covered);
  else {
    const study = record(await attempt(`${prefix}/science-log`));
    if (study?.in_study === true && Array.isArray(study.branches))
      for (const branch of study.branches) {
        const id = text(record(branch)?.session_id);
        if (id && id !== sessionId && !studies.has(id)) studies.set(id, `${prefix}/science-log`);
      }
    // Every call the study cites: what it ran, where, and the files it read and wrote.
    if (study?.in_study === true && Array.isArray(study.entries))
      for (const call of studyCitedCalls(study.entries)) {
        if (transforms.has(call)) continue;
        transforms.add(call);
        await attempt(transformRecordPath(call));
      }
  }

  const flows: string[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = record(await attempt(sessionTaskRowsPath(sessionId, cursor)));
    for (const row of Array.isArray(page?.processes) ? page.processes : []) {
      const task = record(row);
      const handle = text(task?.handle) || text(task?.handle_id) || text(task?.id);
      // A row whose child runs a flow program (not the plain `react` agent loop):
      // the railroad reads that flow's run.
      const flow = record(task?.flow);
      if (handle && flow && text(flow.id) !== 'react') flows.push(handle);
    }
    cursor = text(page?.cursor) || undefined;
    if (cursor && seenCursors.has(cursor)) break;
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  const visited = new Set<string>();
  const tasks = new Set<string>();
  const captureFlow = async (handle: string, depth: number): Promise<void> => {
    if (visited.has(handle) || depth > MAX_FLOW_DEPTH) return;
    visited.add(handle);
    const run = record(await attempt(`${prefix}/tasks/${encodeURIComponent(handle)}/flow`));
    if (!run) return;
    const handles = new Set<string>([handle, text(run.root_handle)]);
    const nested: string[] = [];
    for (const call of Array.isArray(run.calls) ? run.calls : []) {
      const row = record(call);
      handles.add(text(row?.handle));
      if (text(row?.kind) === 'flow' && text(row?.handle)) nested.push(text(row?.handle));
    }
    const view = record(run.view);
    for (const list of [view?.steps, view?.forks])
      for (const step of Array.isArray(list) ? list : []) handles.add(text(record(step)?.handle));
    for (const stage of Array.isArray(run.execution) ? run.execution : [])
      handles.add(text(record(stage)?.handle));
    for (const task of handles) {
      if (!task || tasks.has(task)) continue;
      tasks.add(task);
      await attempt(`/v1/agent-tasks/${encodeURIComponent(task)}`);
    }
    for (const child of nested) await captureFlow(child, depth + 1);
  };
  for (const handle of flows) await captureFlow(handle, 0);
  // The questions the runs asked (approvals of forks and added steps), with the answers.
  if (flows.length) await attempt(flowQuestionsPath(sessionId));
}
