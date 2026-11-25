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
  text: '# Objective\n\nFind the regression.\n\n- bisect: open',
};

describe('session plan section', () => {
  it('says where the plan came from and renders it read only', async () => {
    render(<SessionPlanBody plan={PLAN} />);
    expect(screen.getByText('regression-hunt-abc.md')).toBeInTheDocument();
    expect(screen.getByText(planOriginLabel('active'))).toBeInTheDocument();
    expect(await screen.findByText('Find the regression.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit plan' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens the plan file in a tab', async () => {
    const onOpen = vi.fn();
    render(<SessionPlanBody plan={PLAN} onOpen={onOpen} preview={false} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open regression-hunt-abc.md' }));
    expect(onOpen).toHaveBeenCalledWith(PLAN.path);
    expect(screen.queryByText('Find the regression.')).toBeNull();
  });

  it('keeps an unknown status as its own word', () => {
    expect(planStatusLabel('paused')).toBe('paused');
    expect(planStatusLabel('done')).toBe('Done');
  });
});
