import type { AsyncProcess } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClioProcessLanes } from './observability-processes';

afterEach(cleanup);

function asyncProcess(overrides: Partial<AsyncProcess> = {}): AsyncProcess {
  return {
    kind: 'agent',
    id: 'task_01JQ8ZC4M6WQ2N7YH3K5RB9XPD',
    title: '',
    live_state: 'running',
    status: 'running',
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:30.000Z',
    metadata: {},
    ...overrides,
  };
}

describe('ClioProcessLanes row identity', () => {
  it('names a row by its title rather than the task token', () => {
    render(<ClioProcessLanes processes={[asyncProcess({ title: 'Evidence researcher' })]} />);

    // The reui gantt swap (f15c56ce) renders a row's name twice: once as the
    // tree panel's own row label, once as the timeline event's label.
    for (const element of screen.getAllByText('Evidence researcher')) {
      expect(element).toBeVisible();
    }
    expect(screen.queryByText(/task_01JQ8ZC4M6WQ2N7YH3K5RB9XPD/u)).not.toBeInTheDocument();
  });

  it('falls back to a typed kind, never the raw task token, when nothing named it', () => {
    render(<ClioProcessLanes processes={[asyncProcess()]} />);

    // The token is an opaque identifier. Rendering it as the row's identity told
    // the reader nothing about what was running, and it is already carried on
    // the span for anyone correlating a trace.
    for (const element of screen.getAllByText('Agent task')) {
      expect(element).toBeVisible();
    }
    expect(screen.queryByText(/task_01JQ8ZC4M6WQ2N7YH3K5RB9XPD/u)).not.toBeInTheDocument();
    // The reui gantt swap (f15c56ce) dropped the custom data-execution-span-id
    // attribute the old Timeline rendering stamped on a span (the vendored bar
    // has no passthrough for arbitrary data attributes); the token is still a
    // stable correlation handle in the DOM via the gantt tree row's own
    // data-gantt-row-id, keyed on the same process id.
    expect(
      document.querySelector('[data-gantt-row-id="owner:task_01JQ8ZC4M6WQ2N7YH3K5RB9XPD"]'),
    ).not.toBeNull();
  });

  it('names an unnamed MCP task for what it is', () => {
    render(
      <ClioProcessLanes processes={[asyncProcess({ id: 'mcp_task_7f2a', kind: 'mcp-task' })]} />,
    );

    for (const element of screen.getAllByText('MCP task')) expect(element).toBeVisible();
    expect(screen.queryByText(/mcp_task_7f2a/u)).not.toBeInTheDocument();
  });
});
