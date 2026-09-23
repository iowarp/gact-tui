import type { A2UIActionLifecycle } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClioA2UIActionLifecycle } from './a2ui-action-lifecycle';

afterEach(cleanup);

function lifecycle(overrides: Partial<A2UIActionLifecycle> = {}): A2UIActionLifecycle {
  return {
    surface_id: 'surface_1',
    action_name: 'form.submit',
    status: 'received',
    occurred_at: '2026-09-17T00:00:00Z',
    ...overrides,
  };
}

describe('ClioA2UIActionLifecycle', () => {
  it('renders nothing when no lifecycle is known yet', () => {
    const { container } = render(<ClioA2UIActionLifecycle />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['received', 'form.submit received by the agent'],
    ['delivered', "form.submit delivered to the agent's turn"],
    ['consumed', 'form.submit applied'],
    ['duplicate', 'form.submit ignored as a duplicate'],
  ] as const)('renders words for the %s state', (status, expectedText) => {
    render(<ClioA2UIActionLifecycle lifecycle={lifecycle({ status })} />);
    expect(screen.getByText(expectedText)).toBeVisible();
  });

  it('includes the reason on a failed action', () => {
    render(
      <ClioA2UIActionLifecycle
        lifecycle={lifecycle({ status: 'failed', reason: 'busy turn' })}
      />,
    );
    expect(screen.getByText('form.submit failed: busy turn')).toBeVisible();
  });

  it('never encodes status as a dot or colour alone', () => {
    render(<ClioA2UIActionLifecycle lifecycle={lifecycle({ status: 'failed' })} />);
    expect(screen.getByText(/form\.submit failed/u)).toBeVisible();
  });
});
