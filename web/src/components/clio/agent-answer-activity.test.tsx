import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentAnswerActivity } from './agent-answer-activity';
import { pendingInteractionDomId } from './interaction-control';

afterEach(cleanup);

function humanQuestion(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id: 'question:human_1',
    kind: 'question',
    owner_session_id: 'sess_1',
    attended_session_id: 'sess_1',
    status: 'pending',
    title: 'Choose a region',
    prompt: 'Which region should the search cover?',
    source: { protocol: 'native' },
    created_at: '2026-09-18T00:00:00Z',
    actions: ['answer'],
    ...overrides,
  };
}

/** Stands in for the tray card this interaction's real controls live in. */
function renderWithTrayFixture(interaction: PendingInteraction) {
  return render(
    <>
      <AgentAnswerActivity interaction={interaction} />
      <div id={pendingInteractionDomId(interaction.id)} tabIndex={-1}>
        <button type="button">Send response</button>
      </div>
    </>,
  );
}

describe('AgentAnswerActivity: transcript link to the pending tray card', () => {
  it('transcript_link_scrolls_to_pending_surface_and_focuses', async () => {
    const user = userEvent.setup();
    const interaction = humanQuestion();
    renderWithTrayFixture(interaction);

    const target = document.getElementById(pendingInteractionDomId(interaction.id));
    expect(target).not.toBeNull();
    const scrollIntoView = vi.fn();
    target!.scrollIntoView = scrollIntoView;

    await user.click(screen.getByRole('button', { name: 'Answer below' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
    expect(screen.getByRole('button', { name: 'Send response' })).toHaveFocus();
  });

  it('link_hidden_when_not_pending', () => {
    renderWithTrayFixture(humanQuestion({ status: 'answered' }));

    expect(screen.queryByRole('button', { name: 'Answer below' })).not.toBeInTheDocument();
  });

  it('link_hidden_when_not_pending: also absent once an agent fallback question is answered', () => {
    const answered = humanQuestion({
      id: 'question:fallback_1',
      source: { protocol: 'mcp' },
      audience: 'agent',
      routing_state: 'agent_elicitation_fallback_to_human',
      status: 'answered',
    });
    renderWithTrayFixture(answered);

    expect(screen.queryByRole('button', { name: 'Answer below' })).not.toBeInTheDocument();
  });

  it('offers the link for a pending agent-elicitation fallback routed to a human', () => {
    const pendingFallback = humanQuestion({
      id: 'question:fallback_2',
      source: { protocol: 'mcp' },
      audience: 'agent',
      routing_state: 'agent_elicitation_fallback_to_human',
      status: 'pending',
    });
    renderWithTrayFixture(pendingFallback);

    expect(screen.getByRole('button', { name: 'Answer below' })).toBeVisible();
  });
});
