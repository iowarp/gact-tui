import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClioSearchAssistant } from './search-assistant';
import { vocab } from '@/lib/brand-vocabulary';

const mocks = vi.hoisted(() => ({
  repository: {
    fleetSettings: vi.fn(),
    openSearchSession: vi.fn(),
    submitMessage: vi.fn(),
    deleteSession: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => mocks.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://test' } }),
}));
vi.mock('@/hooks/use-live-session-transcript', () => ({
  useLiveSessionTranscript: () => ({
    entities: { sessions: {}, tools: {}, tasks: {}, subagents: {}, artifacts: {}, surfaces: {} },
    messages: [],
    transcript: { isPending: false },
  }),
}));
vi.mock('./conversation', () => ({ ClioConversation: () => <div>Search transcript</div> }));
vi.mock('@/hooks/use-provider-groups', () => ({
  useProviderGroups: () => ({
    options: [],
    catalog: { isPending: false, isError: false, refetch: vi.fn() },
  }),
}));
vi.mock('./model-picker', () => ({
  ClioModelPicker: ({
    trigger,
    onChange,
  }: {
    trigger: ReactNode;
    onChange: (choice: { providerId: string; id: string }) => void;
  }) => (
    <>
      {trigger}
      <button onClick={() => onChange({ providerId: 'codex', id: 'alternate-search-model' })}>
        Use alternate search model
      </button>
    </>
  ),
}));
const opened = {
  id: 'search_1',
  workspace_id: 'ws_current',
  state: 'completed',
  model_id: 'fleet-search-model',
};
beforeEach(() => {
  mocks.repository.fleetSettings.mockResolvedValue({
    search: { provider_id: 'local', model_id: 'fleet-search-model' },
  });
  mocks.repository.openSearchSession.mockResolvedValue(opened);
  mocks.repository.submitMessage.mockResolvedValue({});
  mocks.repository.deleteSession.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(onQueryChange = vi.fn(), onBack = vi.fn()) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ClioSearchAssistant
          workspaceId="ws_current"
          parentSessionId="parent_1"
          query="Where did we discuss the plant?"
          onQueryChange={onQueryChange}
          onBack={onBack}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('starts only on submit, inherits its server-selected route, and deletes only its temporary chat', async () => {
  const view = show();
  expect(mocks.repository.openSearchSession).not.toHaveBeenCalled();
  expect(await screen.findByText('fleet-search-model')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: `Search with ${vocab.agent}` }));
  await waitFor(() =>
    expect(mocks.repository.submitMessage).toHaveBeenCalledWith(
      'search_1',
      expect.objectContaining({
        parts: [{ type: 'text', text: 'Where did we discuss the plant?' }],
      }),
    ),
  );
  expect(mocks.repository.openSearchSession).toHaveBeenCalledWith({
    workspace_id: 'ws_current',
    parent_session_id: 'parent_1',
  });
  expect(mocks.repository.submitMessage.mock.calls[0][1]).not.toHaveProperty('model');
  view.unmount();
  expect(mocks.repository.deleteSession).toHaveBeenCalledWith('search_1');
  expect(mocks.repository.deleteSession).not.toHaveBeenCalledWith('parent_1');
});
it('chooses the next search model inline while retaining the temporary chat and server default', async () => {
  const user = userEvent.setup();
  show();
  await screen.findByText('fleet-search-model');
  await user.click(screen.getByRole('button', { name: `Search with ${vocab.agent}` }));
  await waitFor(() => expect(mocks.repository.submitMessage).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: `Search with ${vocab.agent}` })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Use alternate search model' }));
  expect(
    screen.getByRole('button', { name: `Choose ${vocab.agent} Search model` }),
  ).toHaveTextContent('alternate-search-model');
  await user.click(screen.getByRole('button', { name: `Search with ${vocab.agent}` }));
  await waitFor(() => expect(mocks.repository.submitMessage).toHaveBeenCalledTimes(2));
  expect(mocks.repository.openSearchSession).toHaveBeenCalledTimes(1);
  expect(mocks.repository.submitMessage.mock.calls[0][1]).not.toHaveProperty('model');
  expect(mocks.repository.submitMessage.mock.calls[1]).toEqual([
    'search_1',
    expect.objectContaining({
      model: { provider_id: 'codex', model_id: 'alternate-search-model' },
    }),
  ]);
  expect(mocks.repository.deleteSession).not.toHaveBeenCalled();
});

it('returns to normal search with Shift+Tab without submitting or changing the draft', async () => {
  const onBack = vi.fn();
  const onQueryChange = vi.fn();
  show(onQueryChange, onBack);
  const input = screen.getByRole('textbox', { name: `Ask ${vocab.agent} Search` });
  expect(input).toHaveFocus();
  await userEvent.setup().keyboard('{Shift>}{Tab}{/Shift}');
  expect(onBack).toHaveBeenCalledOnce();
  expect(onQueryChange).not.toHaveBeenCalled();
  expect(mocks.repository.openSearchSession).not.toHaveBeenCalled();
});
it('retires a late-created search if the person closed it before creation returned', async () => {
  let resolve!: (value: typeof opened) => void;
  mocks.repository.openSearchSession.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = show();
  await userEvent.setup().click(screen.getByRole('button', { name: `Search with ${vocab.agent}` }));
  view.unmount();
  await act(async () => {
    resolve(opened);
  });
  expect(mocks.repository.deleteSession).toHaveBeenCalledWith('search_1');
  expect(mocks.repository.submitMessage).not.toHaveBeenCalled();
});
it('shows the actual connection failure and retains the question for retry', async () => {
  mocks.repository.openSearchSession.mockRejectedValue(new Error('Search agent unavailable'));
  show();
  await userEvent.setup().click(screen.getByRole('button', { name: `Search with ${vocab.agent}` }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Search agent unavailable');
  expect(screen.getByRole('textbox')).toHaveValue('Where did we discuss the plant?');
});

it('identifies an older service before offering a search request', async () => {
  mocks.repository.fleetSettings.mockResolvedValue({
    judges: { goals: null, variants: null, permissions: null },
  });
  show();
  expect(
    await screen.findByText(
      'Search is unavailable on this connection. Update its agent to enable it.',
    ),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: `Search with ${vocab.agent}` })).toBeDisabled();
  expect(mocks.repository.openSearchSession).not.toHaveBeenCalled();
});

it('does not clear a new search draft when a closed request finishes submitting', async () => {
  let finish!: () => void;
  mocks.repository.submitMessage.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const onQueryChange = vi.fn();
  const view = show(onQueryChange);
  await userEvent.setup().click(screen.getByRole('button', { name: `Search with ${vocab.agent}` }));
  await waitFor(() => expect(mocks.repository.submitMessage).toHaveBeenCalled());
  view.unmount();
  await act(async () => {
    finish();
  });
  expect(onQueryChange).not.toHaveBeenCalled();
});
