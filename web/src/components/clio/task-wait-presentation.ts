import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';

const unsuccessful = new Set(['failed', 'error', 'cancelled', 'interrupted', 'denied']);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function strings(value: unknown): string[] {
  return typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(record).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function waitResult(output: unknown): Record<string, unknown> | undefined {
  // Earlier native results were retained as one JSON text part.
  if (Array.isArray(output) && output.length === 1) output = record(output[0])?.text;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      return undefined;
    }
  }
  const outer = record(output);
  const result = record(outer?.structuredContent) ?? record(outer?.structured_content) ?? outer;
  return Array.isArray(result?.pending) &&
    (Array.isArray(result.outcomes) || Array.isArray(result.results))
    ? result
    : undefined;
}

function resultText(value: unknown): string {
  if (value === undefined || value === null) return 'No result body was recorded.';
  if (typeof value === 'string') return value;
  const row = record(value);
  return typeof row?.output === 'string'
    ? [row.output, row.error_reason].filter(Boolean).join('\n')
    : JSON.stringify(value, null, 2);
}

/** Explain canonical and retained wait receipts without changing their recorded bodies. */
export function withTaskWaitPresentation(tool: ToolInvocation): ToolInvocation {
  if (tool.name !== 'wait_tasks' || tool.presentation?.subject === 'wait-targets') return tool;
  const input = record(tool.input);
  const args = record(input?.kwargs) ?? input;
  const requested = strings(args?.tasks);
  if (!requested.length) return tool;
  const result = waitResult(tool.output);
  const canonical = Array.isArray(result?.outcomes);
  const outcomes = records(canonical ? result?.outcomes : result?.results);
  const rows = canonical ? outcomes.filter((row) => !row.error) : outcomes;
  const errors = [
    ...records(result?.errors),
    ...(canonical ? outcomes.filter((row) => row.error) : []),
  ];
  const pending = strings(result?.pending);
  const uncollected = (row: Record<string, unknown>) =>
    row.status === 'task_state_uncertain' ||
    row.pending === true ||
    pending.includes(String(row.handle));
  const handles = [
    ...new Set([
      ...requested,
      ...pending,
      ...strings(rows.map((row) => row.handle)),
      ...strings(errors.map((row) => row.handle)),
    ]),
  ];
  const mode = args?.return_when === 'any' ? 'any' : 'all';
  const poll = args?.timeout_s === 0;
  const activeSummary = tool.state === 'running' ? tool.presentation?.summary : undefined;
  const action =
    !poll && activeSummary?.startsWith('Waiting for ')
      ? activeSummary
      : `${poll ? 'Check' : 'Wait for'} ${mode} ${mode === 'any' ? 'task' : 'tasks'}`;
  let policy =
    mode === 'any'
      ? 'Return when any requested task settles.'
      : 'Return when all requested tasks settle.';
  if (poll) policy = 'Immediate status check (timeout_s: 0); this call did not wait.';
  else if (args?.timeout_s === undefined || args.timeout_s === null) policy += ' No deadline.';
  else policy += ` Wait deadline: ${args.timeout_s} seconds.`;
  if (result?.timed_out && !poll)
    policy += ' The deadline expired; pending tasks continue running.';
  else if (pending.length) policy += ' Pending tasks continue running.';
  const blocks: ToolPresentationBlock[] = [
    { id: 'wait-targets', type: 'text', text: handles.join(', ') },
    { id: 'wait-policy', type: 'text', text: policy },
  ];
  if (result) {
    handles.forEach((handle, index) => {
      const error = errors.find((row) => row.handle === handle);
      const row = rows.find((row) => row.handle === handle);
      const block: ToolPresentationBlock = { id: `wait-task-${index}`, type: 'text' };
      if (error) {
        block.label = `${handle}: Could not collect`;
        block.text = String(error.error || error.message || 'Unknown error');
        block.severity = 'error';
      } else if (row) {
        const status = typeof row.status === 'string' ? row.status : '';
        const label =
          status === 'task_state_uncertain'
            ? 'Needs attention'
            : !canonical && row.kind === 'Subagent' && status === 'completed'
              ? 'Turn ended'
              : status
                ? status[0].toUpperCase() + status.slice(1)
                : 'Result collected';
        block.label = `${handle}: ${label}`;
        block.text = resultText(
          status === 'task_state_uncertain'
            ? row.reason || 'Execution state needs attention. Inspect this task before continuing.'
            : row.result,
        );
        block.result_kind = uncollected(row) ? 'snapshot' : 'completion';
        block.status = status;
        if (unsuccessful.has(status)) block.severity = 'error';
        else if (status === 'task_state_uncertain') block.severity = 'warning';
      } else if (pending.includes(handle)) {
        block.label = handle;
        block.text = 'Pending when this call returned.';
        block.result_kind = 'snapshot';
        block.status = 'pending';
      } else {
        block.label = handle;
        block.text = 'No outcome was recorded for this task.';
      }
      blocks.push(block);
    });
    errors.forEach((error, index) => {
      if (!error.handle)
        blocks.push({
          id: `wait-error-${index}`,
          type: 'text',
          severity: 'error',
          text: String(error.error || error.message || JSON.stringify(error)),
        });
    });
  } else {
    // In-flight calls get their selection/policy immediately; an unreadable result stays raw.
    blocks.push(...(tool.presentation?.blocks ?? []));
  }
  const failed = rows.filter((row) => unsuccessful.has(String(row.status))).length;
  const collected = rows.filter((row) => !uncollected(row)).length;
  const attention = rows.filter((row) => row.status === 'task_state_uncertain').length;
  const counts = [`${collected} ${collected === 1 ? 'result' : 'results'} collected`];
  if (pending.length) counts.unshift(`${pending.length} pending`);
  if (failed) counts.push(`${failed} unsuccessful`);
  if (attention)
    counts.push(`${attention} ${attention === 1 ? 'task needs' : 'tasks need'} attention`);
  if (errors.length) counts.push(`${errors.length} ${errors.length === 1 ? 'error' : 'errors'}`);
  return {
    ...tool,
    presentation: {
      ...tool.presentation,
      action,
      subject: 'wait-targets',
      status: failed || errors.length || attention ? 'degraded' : tool.presentation?.status,
      summary: result ? counts.join(', ') : (tool.presentation?.summary ?? ''),
      blocks,
    },
  };
}
