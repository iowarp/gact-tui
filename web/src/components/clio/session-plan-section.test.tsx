import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { planOriginLabel, planStatusLabel } from '@/lib/plan-status';
import { SessionPlanBody } from './session-plan-section';

afterEach(cleanup);

const PLAN = {
  path: '/state/plans/regression-hunt-abc.md',
  status: 'active',
  text: '# Objective\n\nFind the regression.\n\n## Issues\n\n- bisect: find the commit',
};

describe('session plan section', () => {
  it('says where the plan came from and renders the document read only', async () => {
    render(<SessionPlanBody plan={PLAN} />);
    expect(screen.getByText('regression-hunt-abc.md')).toBeInTheDocument();
    expect(screen.getByText(planOriginLabel(PLAN)!)).toBeInTheDocument();
    expect(await screen.findByText('Find the regression.')).toBeInTheDocument();
    expect(await screen.findByText('bisect: find the commit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit plan' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps a done plan from plan mode saying so, and guesses no origin it lacks', () => {
    expect(planOriginLabel({ status: 'done', origin: 'plan_mode' })).toBe('Written in plan mode.');
    expect(planOriginLabel({ status: 'done' })).toBeNull();
  });

  it('opens the plan in a tab', async () => {
    const onOpen = vi.fn();
    render(<SessionPlanBody plan={PLAN} onOpen={onOpen} preview={false} />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Open regression-hunt-abc.md' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByText('Find the regression.')).toBeNull();
  });

  it('keeps an unknown status as its own word', () => {
    expect(planStatusLabel('paused')).toBe('paused');
    expect(planStatusLabel('done')).toBe('Done');
  });
});
