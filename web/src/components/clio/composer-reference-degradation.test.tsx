import { clearComposerRowDegradations, type WorkspaceReference } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClioComposerReferenceMenu } from './composer-references';

const repositoryMocks = vi.hoisted(() => ({ workspaceReferences: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repositoryMocks }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));

afterEach(cleanup);

beforeEach(() => {
  clearComposerRowDegradations();
  repositoryMocks.workspaceReferences.mockReset();
  repositoryMocks.workspaceReferences.mockResolvedValue([]);
});

function renderMenu() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ClioComposerReferenceMenu
        onDismiss={vi.fn()}
        onRestoreFocus={vi.fn()}
        onSelect={vi.fn()}
        popoverId="refs"
        query=""
        searchInput
        workspaceId="workspace_1"
      />
    </QueryClientProvider>,
  );
}

const artifact: WorkspaceReference = {
  kind: 'artifact',
  id: 'artifact_plot',
  label: 'Displacement plot',
  detail: 'Displacement plot v3',
  media_type: 'image/png',
  revision: 'v3',
  navigation: {},
};

describe('composer reference listing honesty', () => {
  it('waits for the local file count instead of claiming the group is empty', async () => {
    let resolveFiles: (rows: WorkspaceReference[]) => void = () => undefined;
    repositoryMocks.workspaceReferences.mockImplementation(
      (_workspaceId: string, options: { kinds?: readonly string[] }) =>
        options.kinds?.includes('workspace_file')
          ? new Promise<WorkspaceReference[]>((resolve) => {
              resolveFiles = resolve;
            })
          : Promise.resolve([artifact]),
    );
    renderMenu();

    // While the group's first fetch runs it has no heading at all — not an
    // empty one and not a count of zero.
    expect(await screen.findByRole('option', { name: /Displacement plot/ })).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Workspace files' })).not.toBeInTheDocument();

    resolveFiles([
      {
        kind: 'workspace_file',
        id: 'README.md',
        label: 'README.md',
        detail: 'README.md (400 bytes)',
        media_type: 'text/markdown',
        revision: 'stat:1:400',
        navigation: { path: 'README.md' },
      },
    ]);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Collapse Workspace files' })).toHaveTextContent(
        '1',
      ),
    );
  });

  it('keeps the readable references when the service serves a kind this build has no group for', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([
      artifact,
      { ...artifact, id: 'mystery_1', kind: 'unknown' as WorkspaceReference['kind'] },
    ]);
    renderMenu();

    expect(await screen.findByRole('option', { name: /Displacement plot/ })).toBeVisible();
    expect(await screen.findByText('1 reference needs a newer version of this app.')).toBeVisible();
  });
});
