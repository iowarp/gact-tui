/**
 * P2.14 durable-job surface: a RUNNING wait_agent_tasks/check_agent_tasks
 * call (tool_call present, no tool_result yet) is the prototype's activity
 * line — "✻ waiting for N background agents…", N = the polled task_ids
 * count — not a plain collapsed tool row. Once the result lands it falls
 * back to the normal row.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolPart, waitedTasksOf, waitingTaskCount } from '../../src/transcript/parts/ToolPart';
import type { WirePart } from '../../src/transcript/registry';

function toolCall(toolName: string, input: unknown, id = 'call_1'): WirePart {
  return { type: 'tool_call', id, call_id: id, tool_name: toolName, input };
}

function toolResult(callId: string, text: string): WirePart {
  return {
    type: 'tool_result',
    call_id: callId,
    content: [{ type: 'text', text }],
  };
}

describe('waitingTaskCount', () => {
  it('reads the task_ids length off a running wait_agent_tasks call', () => {
    expect(waitingTaskCount(toolCall('wait_agent_tasks', { task_ids: ['a', 'b', 'c'] }))).toBe(3);
  });

  it('reads the task_ids length off a running check_agent_tasks call', () => {
    expect(waitingTaskCount(toolCall('check_agent_tasks', { task_ids: ['a'] }))).toBe(1);
  });

  it('returns null for any other tool', () => {
    expect(waitingTaskCount(toolCall('read_file', { task_ids: ['a', 'b'] }))).toBeNull();
  });

  it('returns null when the input carries no task_ids array', () => {
    expect(waitingTaskCount(toolCall('wait_agent_tasks', { other: 1 }))).toBeNull();
  });

  it('returns null when input is missing entirely', () => {
    expect(waitingTaskCount(toolCall('wait_agent_tasks', undefined))).toBeNull();
  });
});

describe('a running wait_agent_tasks/check_agent_tasks row renders the activity line', () => {
  it('singular: "waiting for 1 background agent…"', () => {
    render(<ToolPart call={toolCall('wait_agent_tasks', { task_ids: ['t1'] })} />);
    const line = screen.getByTestId('tool-wait-activity');
    expect(line).toHaveTextContent('✻');
    expect(line).toHaveTextContent('waiting for 1 background agent…');
    expect(screen.queryByTestId('part-tool')).toBeNull();
  });

  it('plural: "waiting for 3 background agents…"', () => {
    render(<ToolPart call={toolCall('check_agent_tasks', { task_ids: ['t1', 't2', 't3'] })} />);
    const line = screen.getByTestId('tool-wait-activity');
    expect(line).toHaveTextContent('waiting for 3 background agents…');
  });

  it('falls back to the normal collapsed row once the result arrives', () => {
    const call = toolCall('wait_agent_tasks', { task_ids: ['t1', 't2'] }, 'call_9');
    render(<ToolPart call={call} result={toolResult('call_9', '{"done": true}')} />);
    expect(screen.queryByTestId('tool-wait-activity')).toBeNull();
    expect(screen.getByTestId('part-tool')).toBeInTheDocument();
  });

  it('a non-wait tool call keeps the normal collapsed row while running', () => {
    render(<ToolPart call={toolCall('read_file', { path: '/tmp/x' })} />);
    expect(screen.queryByTestId('tool-wait-activity')).toBeNull();
    expect(screen.getByTestId('part-tool')).toBeInTheDocument();
    expect(screen.getByText('running…')).toBeInTheDocument();
  });

  it('a wait_agent_tasks call with an empty task_ids array still names its count (0)', () => {
    render(<ToolPart call={toolCall('wait_agent_tasks', { task_ids: [] })} />);
    const line = screen.getByTestId('tool-wait-activity');
    expect(line).toHaveTextContent('waiting for 0 background agents…');
  });
});

/**
 * P4R fanout/wait presentation (owner, round-7 live fan-out session): a
 * SETTLED wait_agent_tasks/check_agent_tasks row rendered
 * `wait_agent_tasks (["task_cc806f98b07c",...)` — raw task ids the reader
 * has no use for. Wire contract:
 * `tool_call.metadata.waited_tasks = [{task_id, agent_id, run_index,
 * run_label, child_session_id, name}]`, `name` server-resolved and rendered
 * VERBATIM. Absent field (older sessions, or a call this build hasn't
 * resolved names for) falls straight through to today's
 * name(argHint) row, unchanged.
 */
function waitCallWithMetadata(waitedTasks: unknown, id = 'call_wait'): WirePart {
  return {
    type: 'tool_call',
    id,
    call_id: id,
    tool_name: 'wait_agent_tasks',
    input: { task_ids: ['task_cc806f98b07c', 'task_ff11ab22cd33'] },
    metadata: { waited_tasks: waitedTasks },
  };
}

function waitResult(callId: string): WirePart {
  return {
    type: 'tool_result',
    call_id: callId,
    is_error: false,
    content: [{ type: 'text', text: '{"results": []}' }],
  };
}

describe('waitedTasksOf', () => {
  const good = [
    { task_id: 'task_cc806f98b07c', agent_id: 'agent_1', run_index: 0, run_label: 'geospatial #1', child_session_id: 'sess_a', name: 'geospatial #1' },
    { task_id: 'task_ff11ab22cd33', agent_id: 'agent_2', run_index: 1, run_label: 'hydrology #1', child_session_id: 'sess_b', name: 'hydrology #1' },
  ];

  it('reads every field off a well-formed waited_tasks array', () => {
    const tasks = waitedTasksOf(waitCallWithMetadata(good));
    expect(tasks).toHaveLength(2);
    expect(tasks?.[0]).toEqual(good[0]);
    expect(tasks?.[1]?.name).toBe('hydrology #1');
  });

  it('returns null when metadata carries no waited_tasks field at all', () => {
    expect(waitedTasksOf({ type: 'tool_call', id: 'c1', tool_name: 'wait_agent_tasks', input: {} })).toBeNull();
  });

  it('returns null when waited_tasks is an empty array', () => {
    expect(waitedTasksOf(waitCallWithMetadata([]))).toBeNull();
  });

  it('returns null (never a partial list) when ANY entry is missing the one field rendered verbatim (name)', () => {
    const malformed = [good[0], { ...good[1], name: undefined }];
    expect(waitedTasksOf(waitCallWithMetadata(malformed))).toBeNull();
  });

  it('returns null when waited_tasks is not an array', () => {
    expect(waitedTasksOf(waitCallWithMetadata({ not: 'an array' }))).toBeNull();
  });
});

describe('a settled wait row renders resolved names, never raw task-id JSON', () => {
  const NAMES = [
    { task_id: 'task_cc806f98b07c', agent_id: 'a1', run_index: 0, run_label: 'geospatial #1', child_session_id: 's1', name: 'geospatial #1' },
    { task_id: 'task_ff11ab22cd33', agent_id: 'a2', run_index: 1, run_label: 'hydrology #1', child_session_id: 's2', name: 'hydrology #1' },
  ];

  it('the collapsed header reads wait(<name>, <name>), not the raw tool name + task-id JSON', () => {
    const call = waitCallWithMetadata(NAMES);
    render(<ToolPart call={call} result={waitResult('call_wait')} />);
    expect(screen.getByText('wait')).toBeInTheDocument();
    expect(screen.getByText('(geospatial #1, hydrology #1)')).toBeInTheDocument();
    expect(screen.queryByText(/task_cc806f98b07c/)).toBeNull();
    expect(screen.queryByText('wait_agent_tasks')).toBeNull();
  });

  it('opening the row never leaks the raw task_ids input either', () => {
    const call = waitCallWithMetadata(NAMES);
    render(<ToolPart call={call} result={waitResult('call_wait')} />);
    fireEvent.click(screen.getByRole('button', { name: /wait/ }));
    expect(screen.queryByText(/task_cc806f98b07c/)).toBeNull();
    expect(screen.queryByText('task_ids')).toBeNull();
  });

  it('fallback: absent waited_tasks renders exactly today\'s name(argHint) row (regression pin)', () => {
    const call: WirePart = {
      type: 'tool_call',
      id: 'call_plain',
      call_id: 'call_plain',
      tool_name: 'wait_agent_tasks',
      input: { task_ids: ['task_cc806f98b07c'] },
    };
    render(<ToolPart call={call} result={waitResult('call_plain')} />);
    expect(screen.getByText('wait_agent_tasks')).toBeInTheDocument();
    expect(screen.queryByText('wait(geospatial #1, hydrology #1)')).toBeNull();
  });
});
