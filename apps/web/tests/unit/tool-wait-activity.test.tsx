/**
 * P2.14 durable-job surface: a RUNNING wait_agent_tasks/check_agent_tasks
 * call (tool_call present, no tool_result yet) is the prototype's activity
 * line — "✻ waiting for N background agents…", N = the polled task_ids
 * count — not a plain collapsed tool row. Once the result lands it falls
 * back to the normal row.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolPart, waitingTaskCount } from '../../src/transcript/parts/ToolPart';
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
