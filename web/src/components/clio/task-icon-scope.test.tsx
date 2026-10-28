import type { AsyncProcess, ToolInvocation } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AsyncTaskList } from './async-task-list';
import { ClioToolInvocation } from './tool-invocation';

afterEach(cleanup);

it.each(['running', 'completed'] as const)(
  'limits kind/state icons to the task list for %s work',
  (state) => {
    const task: AsyncProcess = {
      id: 'fetch-task',
      kind: 'mcp',
      task_kind: 'MCP',
      title: 'Fetch documentation',
      live_state: state,
      effective_status: state,
      status: state,
      metadata: {},
    };
    const tool: ToolInvocation = {
      id: 'fetch-call',
      session_id: 's',
      name: 'fetch',
      state: state === 'completed' ? 'succeeded' : 'running',
    };
    render(
      <>
        <section aria-label="Task list">
          <AsyncTaskList processes={[task]} />
        </section>
        <section aria-label="Evidence tool calls">
          <ClioToolInvocation compact surface="evidence" tool={tool} />
        </section>
        <section aria-label="Conversation tools">
          <ClioToolInvocation compact tool={tool} />
        </section>
      </>,
    );
    const tasks = screen.getByRole('region', { name: 'Task list' });
    const conversation = screen.getByRole('region', { name: 'Conversation tools' });
    expect(
      tasks.querySelector('[data-slot="work-kind-status"][data-work-kind="tool"]'),
    ).not.toBeNull();
    expect(conversation.querySelector('[data-slot="work-kind-status"]')).toBeNull();
    expect(
      screen
        .getByRole('region', { name: 'Evidence tool calls' })
        .querySelector('[data-slot="work-kind-status"]'),
    ).toBeNull();
    expect(
      conversation.querySelector(state === 'completed' ? '.lucide-check' : '.animate-spin'),
    ).not.toBeNull();
  },
);
