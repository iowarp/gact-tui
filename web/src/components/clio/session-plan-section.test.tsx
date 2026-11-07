import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { planStatusLabel } from '@/lib/plan-status';

const repository = { saveSessionPlan: vi.fn(async () => undefined) };
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { SessionPlanBody } from './session-plan-section';

afterEach(() => {
  cleanup();
  repository.saveSessionPlan.mockClear();
});

const PLAN = {
  path: '/state/plans/regression-hunt-abc.md',
  status: 'approved',
  text: '# Objective\n\nFind the regression.\n\n- bisect: open',
};

function renderPlan() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionPlanBody plan={PLAN} sessionId="sess_1" />
    </QueryClientProvider>,
  );
}

describe('session plan section', () => {
  it('states the status in words and renders the plan', async () => {
    renderPlan();
    expect(
      screen.getByText('Approved, being worked on, regression-hunt-abc.md'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Find the regression.')).toBeInTheDocument();
  });

  it('saves the person’s edit and says when the agent receives it', async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole('button', { name: 'Edit plan' }));
    const editor = screen.getByRole('textbox', { name: 'Plan' });
    await user.clear(editor);
    await user.type(editor, '# Objective{enter}Check the config first.');
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(repository.saveSessionPlan).toHaveBeenCalledWith(
      'sess_1',
      '# Objective\nCheck the config first.',
    );
    expect(
      await screen.findByText('Saved. The agent receives your edit at its next step.'),
    ).toBeInTheDocument();
  });

  it('cancels an edit without saving', async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole('button', { name: 'Edit plan' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(repository.saveSessionPlan).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit plan' })).toBeInTheDocument();
  });

  it('keeps an unknown status as its own word', () => {
    expect(planStatusLabel('paused')).toBe('paused');
    expect(planStatusLabel('done')).toBe('Done');
  });
});
