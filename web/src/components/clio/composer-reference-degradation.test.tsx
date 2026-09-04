import { clearComposerRowDegradations, type WorkspaceReference } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
        activeReferenceId=""
        onActiveOptionChange={vi.fn()}
        onActiveReferenceChange={vi.fn()}
        onDismiss={vi.fn()}
        onQueryChange={vi.fn()}
        onReferencesChange={vi.fn()}
        onRestoreFocus={vi.fn()}
        onSelect={vi.fn()}
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
    const user = userEvent.setup();
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

    const collapsed = await screen.findByRole('button', { name: 'Expand Local files' });
    // The group's query has not run yet, so its count is unknown — not zero.
    expect(collapsed).toHaveTextContent('…');
    expect(collapsed).not.toHaveTextContent('0');

    await user.click(collapsed);
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
      expect(screen.getByRole('button', { name: 'Collapse Local files' })).toHaveTextContent('1'),
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
