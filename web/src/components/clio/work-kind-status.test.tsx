import type { PendingInteraction, ToolInvocation } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { WorkKindStatus } from './work-kind-status';
import type { WorkKind } from './work-kind';
import { toolWorkPresentation } from './tool-work-status';

afterEach(cleanup);

it.each<WorkKind>(['agent', 'question', 'tool', 'workflow'])(
  'keeps the %s glyph through execution and completion',
  (kind) => {
    const view = render(<WorkKindStatus kind={kind} status="running" />);
    const running = screen.getByRole('img', {
      name: `${kind[0].toUpperCase()}${kind.slice(1)}: running`,
    });
    const glyph = running.querySelector('[data-slot="work-kind-icon"]');
    expect(glyph).not.toBeNull();
    expect(running.querySelector('[data-slot="work-status-indicator"]')).toHaveClass(
      'animate-spin',
    );
    view.rerender(<WorkKindStatus kind={kind} status="completed" />);
    const completed = screen.getByRole('img', { name: /completed$/ });
    expect(completed).toHaveClass('text-success');
    expect(completed.querySelector('[data-slot="work-kind-icon"]')).toBe(glyph);
    expect(completed.querySelector('[data-slot="work-status-indicator"]')).toBeNull();
  },
);

it.each([
  'pending',
  'submitted',
  'waiting_user',
  'waiting_permission',
  'paused',
  'cancelled',
  'unknown',
  'degraded',
  'failed',
])('never colors %s as completed', (status) => {
  render(<WorkKindStatus kind="agent" status={status} />);
  expect(screen.getByRole('img')).not.toHaveClass('text-success');
});

it('uses semantic failure over a successful transport receipt and leaves pending snapshots unfinished', () => {
  const tool: ToolInvocation = {
    id: 'fetch',
    session_id: 's',
    name: 'fetch',
    state: 'succeeded',
    presentation: { summary: 'Fetch failed', status: 'failed', blocks: [] },
  };
  expect(toolWorkPresentation(tool)).toEqual({ kind: 'tool', status: 'failed' });
  expect(
    toolWorkPresentation({
      ...tool,
      presentation: {
        summary: 'Accepted',
        blocks: [{ id: 'accepted', type: 'text', result_kind: 'snapshot', status: 'pending' }],
      },
    }),
  ).toEqual({ kind: 'tool', status: 'pending' });
});

it('marks a posted question green only after its matching interaction is answered', () => {
  const tool: ToolInvocation = {
    id: 'ask',
    session_id: 's',
    name: 'ask_user',
    state: 'succeeded',
    output: { kind: 'Question', accepted: true, handle: 'task_question' },
  };
  const interaction: PendingInteraction = {
    id: 'question',
    task_id: 'task_question',
    owner_session_id: 's',
    attended_session_id: 's',
    kind: 'question',
    status: 'pending',
    title: 'Choose a dataset',
    source: { protocol: 'native' },
    actions: [],
    created_at: '',
  };
  expect(toolWorkPresentation(tool)).toEqual({ kind: 'question', status: 'submitted' });
  expect(toolWorkPresentation(tool, [interaction]).status).toBe('waiting_user');
  expect(toolWorkPresentation(tool, [{ ...interaction, status: 'answered' }]).status).toBe(
    'completed',
  );
  expect(toolWorkPresentation(tool, [{ ...interaction, status: 'cancelled' }]).status).toBe(
    'cancelled',
  );
  expect(
    toolWorkPresentation(tool, [{ ...interaction, task_id: 'another', status: 'answered' }]).status,
  ).toBe('submitted');
  expect(tool.state).toBe('succeeded');
});
