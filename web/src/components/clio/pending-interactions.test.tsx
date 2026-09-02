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
    expect(region).toBeVisible();
    // The agent is blocked on this answer, so the controls are reachable without
    // first expanding anything.
    const title = screen.getByText('Run the analysis command');
    expect(title).toHaveAttribute('data-slot', 'pending-interaction-title');
    expect(title.closest('[role="alert"]')).toHaveClass('grid', 'grid-cols-[auto_minmax(0,1fr)]');
    // Wraps up to a few lines instead of clipping to one at the exact moment
    // the reader must decide, but stays bounded and keeps the full text
    // reachable via the title attribute.
    expect(title).toHaveClass('line-clamp-3');
    expect(title).not.toHaveClass('truncate');
    expect(title).toHaveAttribute('title', 'Run the analysis command');
    expect(screen.getByRole('button', { name: 'Allow once' })).toBeVisible();
    await user.click(trigger);
    expect(screen.queryByText('Run the analysis command')).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByText('Run the analysis command')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Allow for session' }));
    expect(onApproval).toHaveBeenCalledWith('perm_1', 'allow_session');
  });

  it('mounts every response control before the reader touches the collapse toggle', () => {
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

    expect(screen.getByRole('region', { name: '2 pending responses' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Allow once' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send response' })).toBeDisabled();
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

    expect(screen.getByRole('button', { name: '1 response needed' })).toBeVisible();
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

    expect(screen.getByRole('button', { name: '1 response needed' })).toBeVisible();
    const questionTitle = screen.getByText('Resume the campaign?');
    expect(questionTitle).toHaveAttribute('data-slot', 'pending-interaction-title');
    expect(questionTitle).toHaveClass('line-clamp-3');
    expect(questionTitle).not.toHaveClass('truncate');
    expect(questionTitle).toHaveAttribute('title', 'Resume the campaign?');
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
    // The panel floats on the composer and reads as one surface with it only
    // while the Queue's translucent fill survives. Any background of its own
    // replaces these through tailwind-merge, which is how that continuity was
    // lost once already.
    expect(responses).toHaveClass('bg-card/70', 'dark:bg-card/60');
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveClass('overscroll-contain');
    expect(viewport.closest('[data-slot="scroll-area"]')).toHaveClass('min-h-0');
  });
});
