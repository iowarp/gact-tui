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

    expect(screen.getByText('Run the analysis command')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Allow for session' }));
    expect(onApproval).toHaveBeenCalledWith('perm_1', 'allow_session');
  });

  it('answers an approval from a session this workspace has not listed yet', async () => {
    const user = userEvent.setup();
    const onApproval = vi.fn(async () => undefined);

    render(
      <ClioPendingInteractions
        approvals={[
          {
            id: 'perm_child',
            session_id: 'sess_grandchild',
            tool_name: 'shell.exec',
            summary: 'Run the child analysis command',
            status: 'pending',
            created_at: '2026-08-22T00:00:00Z',
          },
        ]}
        listedSessionIds={new Set(['sess_1'])}
        onAnswer={async () => undefined}
        onApproval={onApproval}
        onCancelQuestion={async () => undefined}
        questions={[]}
      />,
    );

    expect(screen.getByText('Run the child analysis command')).toBeVisible();
    expect(screen.getByText('Session not listed yet')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Allow once' }));
    expect(onApproval).toHaveBeenCalledWith('perm_child', 'allow');
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

    await user.click(screen.getByRole('radio', { name: 'Resume' }));
    await user.click(screen.getByRole('button', { name: 'Send response' }));
    expect(onAnswer).toHaveBeenCalledWith('question_1', { selected_options: ['resume'] });
  });
});
