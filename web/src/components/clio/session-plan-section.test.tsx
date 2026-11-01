import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import '@/components/ai-elements/markdown';
import { SessionPlanBody } from './session-plan-section';
import { planStatusLabel } from '@/lib/plan-status';

afterEach(cleanup);

describe('session plan section', () => {
  it('states the status in words and renders the plan', async () => {
    render(
      <SessionPlanBody
        plan={{
          path: '/state/plans/regression-hunt-abc.md',
          status: 'approved',
          text: '# Objective\n\nFind the regression.\n\n- bisect: open',
        }}
      />,
    );
    expect(
      screen.getByText('Approved, being worked on · regression-hunt-abc.md'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Find the regression.')).toBeInTheDocument();
  });

  it('keeps an unknown status as its own word', () => {
    expect(planStatusLabel('paused')).toBe('paused');
    expect(planStatusLabel('done')).toBe('Done');
  });
});
