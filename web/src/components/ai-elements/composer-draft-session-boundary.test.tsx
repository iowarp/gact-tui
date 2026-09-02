import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { PromptInputProvider, usePromptInputController } from './prompt-input';
import { ComposerDraftSessionBoundary } from './composer-draft-session-boundary';

afterEach(() => {
  cleanup();
});

function DraftHarness() {
  const { textInput } = usePromptInputController();
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => textInput.setInput('draft in progress')} type="button">
        Seed draft
      </button>
      <button
        onClick={() => navigate('/workspaces/ws_1/sessions/sess_2')}
        type="button"
      >
        Go to session 2
      </button>
      <button onClick={() => navigate('/settings/appearance')} type="button">
        Go to a non-session route
      </button>
      <span data-testid="draft-text">{textInput.value}</span>
    </div>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PromptInputProvider>
        <ComposerDraftSessionBoundary>
          <DraftHarness />
        </ComposerDraftSessionBoundary>
      </PromptInputProvider>
    </MemoryRouter>,
  );
}

describe('ComposerDraftSessionBoundary', () => {
  it('clears an in-progress draft when the route moves to a different session', async () => {
    const user = userEvent.setup();
    renderAt('/workspaces/ws_1/sessions/sess_1');

    await user.click(screen.getByRole('button', { name: 'Seed draft' }));
    expect(screen.getByTestId('draft-text')).toHaveTextContent('draft in progress');

    await user.click(screen.getByRole('button', { name: 'Go to session 2' }));
    expect(screen.getByTestId('draft-text')).toHaveTextContent('');
  });

  it('leaves the draft alone when navigating off the session route entirely', async () => {
    const user = userEvent.setup();
    renderAt('/workspaces/ws_1/sessions/sess_1');

    await user.click(screen.getByRole('button', { name: 'Seed draft' }));
    await user.click(screen.getByRole('button', { name: 'Go to a non-session route' }));

    // No session match on the new route means no signal to clear on — the draft persists
    // until a DIFFERENT session route is actually reached.
    expect(screen.getByTestId('draft-text')).toHaveTextContent('draft in progress');
  });
});
