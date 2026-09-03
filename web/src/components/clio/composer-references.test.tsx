import type { WorkspaceReference } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioComposerReferenceMenu } from './composer-references';

const reference: WorkspaceReference = {
  kind: 'resource',
  id: 'resource_nvda',
  label: '10K-NVDA.pdf',
  detail: 'Uploaded source 10K-NVDA.pdf',
  media_type: 'application/pdf',
  revision: '1',
  navigation: { workspace_id: 'workspace_1', resource_id: 'resource_nvda' },
};

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ workspaceReferences: vi.fn(async () => [reference]) }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8788' } }),
}));

afterEach(cleanup);

describe('composer reference presentation', () => {
  it('groups uploaded files with sources while retaining the resource identity', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ClioComposerReferenceMenu
          activeReferenceId=""
          onActiveReferenceChange={vi.fn()}
          onQueryChange={vi.fn()}
          onReferencesChange={vi.fn()}
          onSelect={onSelect}
          query="NVDA"
          searchInput
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Sources')).toBeVisible();
    expect(screen.queryByText('Artifacts')).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /10K-NVDA\.pdf/ }));
    expect(onSelect).toHaveBeenCalledWith(reference);
  });
});
