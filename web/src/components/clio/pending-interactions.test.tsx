import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioPendingInteractions } from './pending-interactions';

afterEach(cleanup);

describe('ClioPendingInteractions', () => {
  it('uses the AI Elements confirmation actions for a pending approval', async () => {
    const user = userEvent.setup();
    const onApproval = vi.fn(async () => undefined);

    render(
      <ClioPendingInteractions
        approvals={[
          {
            id: 'perm_1',
            session_id: 'sess_1',
            tool_name: 'shell.exec',
            summary: 'Run the analysis command',
            status: 'pending',
            created_at: '2026-08-22T00:00:00Z',
          },
        ]}
        onAnswer={async () => undefined}
        onApproval={onApproval}
        onCancelQuestion={async () => undefined}
        questions={[]}
      />,
    );

    const region = screen.getByRole('region', { name: 'Agent needs your response' });
    const trigger = screen.getByRole('button', { name: '1 response needed' });
    const title = screen.getByText('Run the analysis command');
    expect(region).toBeVisible();
    expect(title).toHaveAttribute('data-slot', 'pending-interaction-title');
    expect(title.closest('[role="alert"]')).toHaveClass('grid', 'grid-cols-[auto_minmax(0,1fr)]');
    await user.click(trigger);
    expect(screen.queryByText('Run the analysis command')).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByText('Run the analysis command')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Allow for session' }));
    expect(onApproval).toHaveBeenCalledWith('perm_1', 'allow_session');
  });

  it('submits the selected server-provided question option', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn(async () => undefined);

    render(
      <ClioPendingInteractions
        approvals={[]}
        onAnswer={onAnswer}
        onApproval={async () => undefined}
        onCancelQuestion={async () => undefined}
        questions={[
          {
            id: 'question_1',
            session_id: 'sess_1',
            prompt: 'Resume the campaign?',
            status: 'pending',
            kind: 'choice',
            options: [
              { label: 'Resume', value: 'resume' },
              { label: 'Keep quarantined', value: 'quarantine' },
            ],
            created_at: '2026-08-22T00:00:00Z',
            updated_at: '2026-08-22T00:00:00Z',
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: '1 response needed' })).toBeVisible();
    expect(screen.getByText('Resume the campaign?')).toHaveAttribute(
      'data-slot',
      'pending-interaction-title',
    );
    expect(screen.queryByText('Agent needs your input')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Resume' }));
    await user.click(screen.getByRole('button', { name: 'Send response' }));
    expect(onAnswer).toHaveBeenCalledWith('question_1', { selected_options: ['resume'] });
  });

  it('submits an optional comment with the selected question option', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn(async () => undefined);

    render(
      <ClioPendingInteractions
        approvals={[]}
        onAnswer={onAnswer}
        onApproval={async () => undefined}
        onCancelQuestion={async () => undefined}
        questions={[
          {
            id: 'question_1',
            session_id: 'sess_1',
            prompt: 'Which evidence view should remain primary?',
            status: 'pending',
            kind: 'choice',
            options: [
              { label: 'Station table', value: 'table' },
              { label: 'Displacement plot', value: 'plot' },
            ],
            created_at: '2026-08-22T00:00:00Z',
            updated_at: '2026-08-22T00:00:00Z',
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Station table' }));
    const stationComment = screen.getByRole('textbox', { name: 'Comment on Station table' });
    await user.type(stationComment, 'Keep the sortable columns visible.');

    await user.click(screen.getByRole('radio', { name: 'Displacement plot' }));
    expect(
      screen.queryByRole('textbox', { name: 'Comment on Station table' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Station table' }));
    expect(screen.getByRole('textbox', { name: 'Comment on Station table' })).toHaveValue(
      'Keep the sortable columns visible.',
    );

    await user.click(screen.getByRole('button', { name: 'Send response' }));
    expect(onAnswer).toHaveBeenCalledWith('question_1', {
      answer: 'Keep the sortable columns visible.',
      selected_options: ['table'],
    });
  });

  it('exposes an independently keyboard-scrollable response viewport', () => {
    render(
      <ClioPendingInteractions
        approvals={[
          {
            id: 'perm_1',
            session_id: 'sess_1',
            tool_name: 'shell.exec',
            summary: 'Run the analysis command',
            status: 'pending',
            created_at: '2026-08-22T00:00:00Z',
          },
        ]}
        onAnswer={async () => undefined}
        onApproval={async () => undefined}
        onCancelQuestion={async () => undefined}
        questions={[
          {
            id: 'question_1',
            session_id: 'sess_1',
            prompt: 'Resume the campaign?',
            status: 'pending',
            kind: 'choice',
            options: [{ label: 'Resume', value: 'resume' }],
            created_at: '2026-08-22T00:00:00Z',
            updated_at: '2026-08-22T00:00:00Z',
          },
        ]}
      />,
    );

    const responses = screen.getByRole('region', { name: 'Agent needs your response' });
    const viewport = screen.getByRole('region', { name: '2 pending responses' });
    expect(responses).toHaveClass('min-h-0', 'shrink');
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveClass('overscroll-contain');
    expect(viewport.closest('[data-slot="scroll-area"]')).toHaveClass('min-h-0');
  });
});
