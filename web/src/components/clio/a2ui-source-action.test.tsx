import type { A2UISurface } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';
import { CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSessionRegistryOwner } from '@/test-fixtures/a2ui/v0_9_1/test-harness';
import { ClioA2UISurface } from './a2ui-surface';

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn(),
  a2uiCatalogs: vi.fn(),
  a2uiCapabilities: vi.fn(),
  openSignIn: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/lib/a2ui/source-sign-in-context', () => ({
  useSourceSignIn: () => repository.openSignIn,
}));
beforeEach(() => {
  repository.a2uiCatalogs.mockResolvedValue({ rows: [CLIO_WORKSPACE_CATALOG_ROW], rejected: [] });
  repository.a2uiCapabilities.mockResolvedValue({
    agent: { 'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] } },
    client: null,
    selection: null,
  });
  repository.a2uiAction.mockResolvedValue({
    status: 'accepted',
    destination: 'client',
    state: 'consumed',
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount(readOnly = false) {
  const catalogId = CLIO_WORKSPACE_CATALOG_ROW.catalogId;
  const surface: A2UISurface = {
    id: 'login',
    session_id: 's',
    catalog_id: catalogId,
    protocol_version: '0.9.1',
    revision: 1,
    state: 'ready',
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId: 'login', catalogId } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: 'login',
          components: [
            {
              id: 'root',
              component: 'Button',
              child: 'label',
              action: {
                event: {
                  name: 'data_source/login/google_drive',
                  context: { clio_id: 'c', workspace_id: 'w' },
                },
              },
            },
            { id: 'label', component: 'Text', text: 'Sign in to Drive' },
          ],
        },
      },
    ],
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <A2uiSessionRegistryOwner sessionId="s">
        <ClioA2UISurface surface={surface} readOnly={readOnly} />
      </A2uiSessionRegistryOwner>
    </QueryClientProvider>,
  );
}
it('opens private UI only after the recorded client action is accepted', async () => {
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Sign in to Drive' }));
  expect(repository.openSignIn).toHaveBeenCalledWith({
    provider: 'google_drive',
    clioId: 'c',
    workspaceId: 'w',
  });
  expect(repository.a2uiAction).toHaveBeenCalledOnce();
  expect(repository.a2uiAction.mock.calls[0][1].action.context).toEqual({
    clio_id: 'c',
    workspace_id: 'w',
  });
});
it('does not start sign-in when an older server routes the action to an agent', async () => {
  repository.a2uiAction.mockResolvedValue({
    status: 'accepted',
    destination: 'agent',
    state: 'queued',
  });
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Sign in to Drive' }));
  expect(
    await screen.findByText(`${vocab.agent} did not accept this private sign-in action.`),
  ).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(repository.openSignIn).not.toHaveBeenCalled();
});
it('does not post or open private UI from an offline archive', async () => {
  mount(true);
  await userEvent.click(await screen.findByRole('button', { name: 'Sign in to Drive' }));
  expect(await screen.findByText('Private sign-in is unavailable in this archive.')).toBeVisible();
  expect(repository.a2uiAction).not.toHaveBeenCalled();
  expect(repository.openSignIn).not.toHaveBeenCalled();
});
it('does not post when the loaded catalog has no declared client destination', async () => {
  repository.a2uiCatalogs.mockResolvedValue({
    rows: [
      {
        ...CLIO_WORKSPACE_CATALOG_ROW,
        sidecar: { ...CLIO_WORKSPACE_CATALOG_ROW.sidecar, events: {} },
      },
    ],
    rejected: [],
  });
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Sign in to Drive' }));
  expect(
    await screen.findByText('This workspace does not support private sign-in actions.'),
  ).toBeVisible();
  expect(repository.a2uiAction).not.toHaveBeenCalled();
});
