import type { SubagentRun, ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { asRecord, toolResultRecord } from './tool-result-shared';

export interface OperationContext {
  subagents?: Record<string, SubagentRun>;
  resources?: Record<string, { name?: string; filename?: string }>;
}
export interface OperationTask {
  key: string;
  subject: ToolPresentationBlock;
  agent?: string;
  model?: string;
  assignment?: string;
  value?: unknown;
  blocks?: ToolPresentationBlock[];
  error?: string;
  page?: Record<string, unknown>;
  /** The recorded task status of a returned result (said in words on its tab). */
  status?: string;
}

/** Unwrap declared tool arguments without changing the exact stored input. */
export function operationInput(tool: ToolInvocation): Record<string, unknown> {
  const input = asRecord(tool.input);
  return asRecord(input?.kwargs) ?? input ?? {};
}

export function operationStrings(value: unknown): string[] {
  return typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string')
      : [];
}

/** Resolve only exact recorded task/session identities, never answer prose. */
export function operationSubject(
  handle: string,
  context: OperationContext,
  declared?: ToolPresentationBlock,
  label?: string,
): ToolPresentationBlock {
  const child =
    context.subagents?.[handle] ??
    Object.values(context.subagents ?? {}).find(
      (row) => row.id === handle || row.child_session_id === handle,
    );
  const specific = label && !/^(CLIO|Subagent|Session|Tasks)$/iu.test(label) ? label : undefined;
  const named = specific || child?.title || declared?.label || declared?.text || label;
  return {
    id: `operation-${handle}`,
    type: child?.child_session_id || declared?.uri ? 'link' : 'text',
    target: declared?.target ?? (child?.child_session_id ? 'session' : undefined),
    uri: child?.child_session_id ?? declared?.uri,
    label: named || (/^task_/u.test(handle) ? `Task ${handle.slice(-6)}` : handle),
    text: named || handle,
  };
}

/** Unwrap a known answer envelope, not arbitrary JSON-looking document strings. */
export function operationAnswer(value: unknown, depth = 0): unknown {
  if (depth > 5) return value;
  const row = asRecord(value);
  if (!row || row.truncated === true) return value;
  if (Object.hasOwn(row, 'answer')) return row.answer;
  if (Object.hasOwn(row, 'output')) return row.output;
  if (Object.hasOwn(row, 'result')) return operationAnswer(row.result, depth + 1);
  if (Object.hasOwn(row, 'structuredContent'))
    return operationAnswer(row.structuredContent, depth + 1);
  if (Object.hasOwn(row, 'structured_content'))
    return operationAnswer(row.structured_content, depth + 1);
  return value;
}

/** Retained wait receipts describe the result at that call, not the child's current work. */
export function operationWaitTasks(
  tool: ToolInvocation,
  context: OperationContext,
):
  | {
      tasks: OperationTask[];
      pending: string[];
      running: number;
      attention: number;
      failed: number;
      unavailable: number;
    }
  | undefined {
  const result = toolResultRecord(tool.output);
  if (!result || result.truncated === true) return undefined;
  const values = Array.isArray(result.outcomes)
    ? result.outcomes
    : Array.isArray(result.results)
      ? result.results
      : undefined;
  if (!values) return undefined;
  const pending = operationStrings(result.pending);
  const records = values.map(asRecord).filter((row) => row !== undefined);
  const attention = records.filter((row) => row.status === 'task_state_uncertain').length;
  const running = pending.filter(
    (handle) =>
      !records.some((row) => row.handle === handle && row.status === 'task_state_uncertain'),
  ).length;
  const failed = records.filter((row) =>
    ['failed', 'error', 'denied', 'cancelled', 'interrupted'].includes(String(row.status)),
  ).length;
  let unavailable = 0;
  const tasks: OperationTask[] = [];
  const source = [...values, ...(Array.isArray(result.errors) ? result.errors : [])];
  for (const [index, value] of source.entries()) {
    const row = asRecord(value);
    if (!row) continue;
    const handle =
      typeof row.handle === 'string'
        ? row.handle
        : typeof row.task_id === 'string'
          ? row.task_id
          : typeof row.error === 'string'
            ? `collection-error-${index}`
            : '';
    if (
      !handle ||
      pending.includes(handle) ||
      row.pending === true ||
      row.status === 'task_state_uncertain'
    )
      continue;
    const block = tool.presentation?.blocks.find(
      (b) => b.uri === handle || b.uri === row.session_id,
    );
    const key = handle;
    if (tasks.some((t) => t.key === key)) continue;
    const label =
      typeof row.name === 'string'
        ? row.name
        : typeof row.title === 'string'
          ? row.title
          : handle.startsWith('collection-error-')
            ? 'Collection error'
            : undefined;
    const page = row.fragments_require_concatenation === true ? row : undefined;
    const returned = Object.hasOwn(row, 'result')
      ? row.result
      : Object.hasOwn(row, 'output')
        ? row.output
        : row.answer;
    const incomplete = !page && asRecord(returned)?.truncated === true;
    const answer = page || incomplete ? undefined : operationAnswer(returned);
    const error =
      typeof row.error === 'string'
        ? row.error
        : incomplete
          ? 'The complete returned result was not retained with this call.'
          : ['failed', 'error', 'denied', 'cancelled', 'interrupted'].includes(String(row.status))
            ? typeof row.error_reason === 'string'
              ? row.error_reason
              : `Task ${row.status}`
            : undefined;
    const blocks = tool.presentation?.blocks.filter(
      (b) => b.content_ref && (b.id.includes(handle) || b.label?.startsWith(handle)),
    );
    if (answer === undefined && !error && !blocks?.length && !page) continue;
    if (typeof row.error === 'string') unavailable++;
    // The producer's per-child report block names the task and the model it ran on.
    const report = tool.presentation?.blocks.find(
      (b) =>
        b.id.startsWith('wait-task-') && (b.label === handle || b.label?.startsWith(`${handle}:`)),
    );
    tasks.push({
      key,
      subject: operationSubject(
        handle,
        context,
        block,
        label ?? (report?.title !== handle ? report?.title : undefined),
      ),
      model: report?.model,
      status: typeof row.status === 'string' ? row.status : undefined,
      value: answer,
      error,
      blocks,
      page,
    });
  }
  return { tasks, pending, running, attention, failed, unavailable };
}

/** Complete results only; capped previews remain represented by their declared content reference. */
export function operationOutput(tool: ToolInvocation): unknown {
  const outer = asRecord(tool.output);
  const page = asRecord(outer?.structuredContent) ?? asRecord(outer?.structured_content) ?? outer;
  if (page?.fragments_require_concatenation === true) return page;
  const row = toolResultRecord(tool.output);
  return row ?? tool.output;
}
