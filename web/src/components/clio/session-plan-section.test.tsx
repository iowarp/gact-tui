import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { planOriginLabel, planStatusLabel } from '@/lib/plan-status';
import { SessionPlanBody } from './session-plan-section';

afterEach(cleanup);

const PLAN = {
  path: '/state/plans/regression-hunt-abc.md',
  status: 'active',
  text: '# Objective\n\nFind the regression.\n\n- [closed] bisect: find the commit\n- [active] fix: patch it\n- [open] verify: rerun the case',
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

  it('shows marked steps as a checklist with their state in words', () => {
    render(<SessionPlanBody plan={PLAN} />);
    const steps = screen.getByRole('list', { name: 'Plan steps' });
    expect(within(steps).getAllByRole('listitem').map((item) => item.dataset.stepState)).toEqual([
      'closed',
      'active',
      'open',
    ]);
    expect(within(steps).getByText('Done')).toBeInTheDocument();
    expect(within(steps).getByText('In progress')).toBeInTheDocument();
    expect(within(steps).getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText(/\[open\]/u)).toBeNull();
  });

  it('opens the plan in a tab', async () => {
    const onOpen = vi.fn();
    render(<SessionPlanBody plan={PLAN} onOpen={onOpen} preview={false} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open regression-hunt-abc.md' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByText('Find the regression.')).toBeNull();
  });

  it('keeps an unknown status as its own word', () => {
    expect(planStatusLabel('paused')).toBe('paused');
    expect(planStatusLabel('done')).toBe('Done');
  });
});
