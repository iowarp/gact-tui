import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanExitResponse } from './plan-exit-interaction';

afterEach(cleanup);

function planInteraction(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id: 'question:plan_exit',
    kind: 'question',
    owner_session_id: 'sess_root',
    attended_session_id: 'sess_root',
    status: 'pending',
    title: 'Review execution plan',
    prompt: 'Approve the saved plan?',
    source: { protocol: 'native', tool_name: 'plan_exit' },
    created_at: '2026-09-02T00:00:00Z',
    actions: ['answer', 'cancel'],
    ...overrides,
  };
}

describe('PlanExitResponse', () => {
  it('renders the saved plan and submits its decision with a modifier', async () => {
    const user = userEvent.setup();
    const interaction = planInteraction({
      payload: {
        question_id: 'plan_exit',
        question_kind: 'choice',
        plan_exit: {
          summary: 'Add authoritative Plan mode wiring and qualify the lifecycle.',
          recommended_mode: 'interactive',
          risk_notes: 'The session mode must change before submission.',
          plan_file: 'D:/workspace/plans/plan.md',
          plan_content: '# Implementation plan\n\n1. Wire the mode.\n2. Verify approval.',
          plan_content_status: 'complete',
        },
        options: [
          { label: 'Approve — auto-execute', value: 'auto' },
          { label: 'Reject — keep planning', value: 'reject' },
          { label: 'Also clear context (modifier)', value: 'clear_context' },
        ],
      },
    });
    const onResponse = vi.fn(async () => undefined);
    render(
      <PlanExitResponse interaction={interaction} onResponse={onResponse} showOwner={false} />,
    );

    expect(screen.getByText('Review execution plan')).toBeVisible();
    expect(
      await screen.findByRole('heading', { name: 'Implementation plan' }, { timeout: 5_000 }),
    ).toBeVisible();
    expect(screen.getByText('Agent recommendation:')).toHaveTextContent('interactive');
    expect(screen.getByText(/Risks: The session mode must change/)).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Approve — auto-execute' }));
    await user.click(screen.getByRole('checkbox', { name: 'Also clear context (modifier)' }));
    await user.type(screen.getByRole('textbox', { name: 'Comment (optional)' }), 'Proceed now.');
    await user.click(screen.getByRole('button', { name: 'Submit plan decision' }));

    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      answer: 'Proceed now.',
      selected_options: ['auto', 'clear_context'],
    });
  });

  it('never enables execution when the complete saved plan is unavailable', async () => {
    const user = userEvent.setup();
    const interaction = planInteraction({
      id: 'question:plan_exit_unavailable',
      actions: ['answer'],
      payload: {
        question_id: 'plan_exit_unavailable',
        question_kind: 'choice',
        plan_exit: {
          summary: 'Plan review failed to load.',
          plan_file: 'D:/workspace/plans/plan.md',
          plan_content_status: 'unavailable',
        },
        options: [
          { label: 'Approve — auto-execute', value: 'auto' },
          { label: 'Exit plan mode only', value: 'exit_only' },
          { label: 'Reject — keep planning', value: 'reject' },
        ],
      },
    });
    const onResponse = vi.fn(async () => undefined);
    render(
      <PlanExitResponse interaction={interaction} onResponse={onResponse} showOwner={false} />,
    );

    expect(screen.getByText(/saved plan is unavailable/i)).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Approve — auto-execute' }));
    expect(screen.getByRole('button', { name: 'Submit plan decision' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Exit plan mode only' }));
    await user.click(screen.getByRole('button', { name: 'Submit plan decision' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      selected_options: ['exit_only'],
    });
  });

  it('keeps the accepted plan and its recorded decision in the lifecycle', async () => {
    const interaction = planInteraction({
      status: 'answered',
      requires_human_response: false,
      actions: [],
      payload: {
        answer_metadata: { selected_options: ['auto'] },
        options: [{ label: 'Approve — auto-execute', value: 'auto' }],
        plan_exit: {
          summary: 'Create the requested file after approval.',
          plan_file: 'D:/workspace/.clio/plans/plan.md',
          plan_content: '# Accepted implementation plan\n\n1. Create the file.',
          plan_content_status: 'complete',
        },
      },
    });

    render(
      <PlanExitResponse
        interaction={interaction}
        onResponse={vi.fn(async () => undefined)}
        showOwner={false}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Accepted implementation plan' }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Approved · Approve — auto-execute');
    expect(screen.queryByRole('button', { name: 'Submit plan decision' })).not.toBeInTheDocument();
  });
});
