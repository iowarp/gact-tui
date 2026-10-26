import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { WorkKindStatus } from './work-kind-status';
import type { WorkKind } from './work-kind';

afterEach(cleanup);

it.each<WorkKind>(['agent', 'question', 'tool', 'workflow'])(
  'keeps the %s glyph through execution and completion',
  (kind) => {
    const view = render(<WorkKindStatus kind={kind} status="running" />);
    const running = screen.getByRole('img', {
      name: `${kind === 'workflow' ? 'Flow' : kind[0].toUpperCase() + kind.slice(1)}: running`,
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

it('shows a known no-op flow quietly rather than calling it success or uncertainty', () => {
  const { container } = render(<WorkKindStatus kind="workflow" status="not_run" />);
  expect(screen.getByRole('img', { name: 'Flow: not run' })).toHaveClass('text-muted-foreground');
  expect(container.querySelector('[data-slot="work-status-indicator"]')).toBeNull();
});
