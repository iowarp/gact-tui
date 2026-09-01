import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioResourceDialogs, type ResourceActions } from './resource-dialogs';

const repository = vi.hoisted(() => ({
  sessionDefaults: vi.fn().mockResolvedValue({
    provider_id: '',
    model_id: '',
    effort: 'medium',
    mode: 'edit',
    edit_mode: 'diff',
    routing_mode: 'auto',
    approval_mode: 'ask',
    blueprint_id: '',
  }),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function actions(): ResourceActions {
  return {
    archiveSession: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue(undefined),
    createWorkspace: vi.fn().mockResolvedValue(undefined),
    grantWorkspaceFolder: vi.fn().mockResolvedValue(undefined),
    revokeWorkspaceFolder: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    deleteWorkspace: vi.fn().mockResolvedValue(undefined),
    exportSession: vi.fn().mockResolvedValue({}),
    importSession: vi.fn().mockResolvedValue(undefined),
    renameSession: vi.fn().mockResolvedValue(undefined),
    renameWorkspace: vi.fn().mockResolvedValue(undefined),
    restoreSession: vi.fn().mockResolvedValue(undefined),
    setSessionPinned: vi.fn().mockResolvedValue(undefined),
    setWorkspacePinned: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ClioResourceDialogs session creation', () => {
  it('creates a session with an explicit blueprint and advanced behavior', async () => {
    const user = userEvent.setup();
    const resourceActions = actions();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    queryClient.setQueryData(['session-defaults', 'http://127.0.0.1:8787'], {
      provider_id: '',
      model_id: '',
      effort: 'medium',
      mode: 'edit',
      edit_mode: 'diff',
      routing_mode: 'auto',
      approval_mode: 'ask',
      blueprint_id: '',
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ClioResourceDialogs
          actions={resourceActions}
          activeWorkspaceId="ws_ndp"
          blueprints={[
            {
              id: 'spotter-ai',
              version: '0.1.0',
              title: 'SPOTTER AI',
              display_name: 'SPOTTER AI',
              description: 'Forensic watcher',
              scope: 'global',
              enabled: true,
              validation_errors: [],
              kind: 'blueprint',
              metadata: {},
            },
          ]}
          createKind="session"
          deleteTarget={null}
          onCreateKindChange={vi.fn()}
          onDeleteTargetChange={vi.fn()}
          onRenameTargetChange={vi.fn()}
          renameTarget={null}
          workspaces={[
            {
              id: 'ws_ndp',
              name: 'ndp',
              display_name: 'EarthScope NDP',
              path: 'D:\\science\\ndp',
              connection_id: 'local',
              pinned: true,
            },
          ]}
        />
      </QueryClientProvider>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Session name' }), 'Review anomaly');
    fireEvent.click(screen.getByRole('combobox', { name: 'Agent blueprint' }));
    fireEvent.click(screen.getByRole('option', { name: 'SPOTTER AI' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Agent blueprint' })).toHaveTextContent(
        'SPOTTER AI',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Advanced session behavior' }));
    expect(screen.queryByRole('combobox', { name: 'Work routing' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Default work mode' }));
    fireEvent.click(screen.getByRole('option', { name: 'Deep research' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Default work mode' })).toHaveTextContent(
        'Deep research',
      ),
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Confirmations' }));
    fireEvent.click(screen.getByRole('option', { name: 'SPOTTER review' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Confirmations' })).toHaveTextContent(
        'SPOTTER review',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    await waitFor(() =>
      expect(resourceActions.createSession).toHaveBeenCalledWith({
        title: 'Review anomaly',
        workspaceId: 'ws_ndp',
        blueprintId: 'spotter-ai',
        mode: 'architect',
        routingMode: 'experts',
        approvalMode: 'spotter-ai',
      }),
    );
  });
});
