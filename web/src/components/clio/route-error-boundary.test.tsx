import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  usePromptInputController,
  useProviderAttachments,
} from '@/components/ai-elements/prompt-input';

// Toggled per test so one shared mock factory can serve both: the throw-catching test needs
// useProviderAttachments to blow up before PromptInputProvider's children ever render, while
// the persistence test needs the real hook so a seeded draft can be observed across a route
// change.
let throwFromAttachments = false;

vi.mock('@/components/ai-elements/prompt-input', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ai-elements/prompt-input')>();
  return {
    ...actual,
    useProviderAttachments: (...args: Parameters<typeof actual.useProviderAttachments>) => {
      if (throwFromAttachments) throw new Error('composer draft state exploded');
      return actual.useProviderAttachments(...args);
    },
  };
});

vi.mock('@/App', () => ({
  default: function MockApp() {
    const { textInput } = usePromptInputController();
    const { add, files } = useProviderAttachments();
    const navigate = useNavigate();
    return (
      <div>
        <button
          onClick={() => {
            textInput.setInput('draft in progress');
            add([new File(['note'], 'note.txt', { type: 'text/plain' })]);
          }}
          type="button"
        >
          Seed draft
        </button>
        <button onClick={() => navigate('/settings/appearance')} type="button">
          Go to settings
        </button>
        <span data-testid="draft-text">{textInput.value}</span>
        <span data-testid="draft-attachments">{files.length}</span>
      </div>
    );
  },
}));

import { RouteErrorBoundary } from './route-error-boundary';

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:composer-attachment'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(() => undefined),
  });
});

afterEach(() => {
  cleanup();
  throwFromAttachments = false;
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('RouteErrorBoundary', () => {
  it('catches a throw from inside the composer providers instead of leaving it unhandled', () => {
    throwFromAttachments = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <MemoryRouter initialEntries={['/workspaces/ws_1/sessions/sess_1']}>
        <RouteErrorBoundary />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByText(/could not display this workspace/iu)).toBeVisible();
    consoleError.mockRestore();
  });

  it('keeps the composer draft across a route change instead of remounting the provider', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/workspaces/ws_1/sessions/sess_1']}>
        <RouteErrorBoundary />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Seed draft' }));
    expect(screen.getByTestId('draft-text')).toHaveTextContent('draft in progress');
    expect(screen.getByTestId('draft-attachments')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'Go to settings' }));

    // The route (and the keyed inner boundary around <App/>) changed, but the composer's
    // draft state — held in PromptInputProvider ABOVE that keyed boundary — must survive,
    // since navigating off the session route entirely gives ComposerDraftSessionBoundary no
    // session match to clear on either.
    expect(screen.getByTestId('draft-text')).toHaveTextContent('draft in progress');
    expect(screen.getByTestId('draft-attachments')).toHaveTextContent('1');
  });
});
