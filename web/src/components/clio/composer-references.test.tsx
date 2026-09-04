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
          onActiveOptionChange={vi.fn()}
          onActiveReferenceChange={vi.fn()}
          onDismiss={vi.fn()}
          onQueryChange={vi.fn()}
          onReferencesChange={vi.fn()}
          onRestoreFocus={vi.fn()}
          onSelect={onSelect}
          query="NVDA"
          searchInput
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    const artifacts = await screen.findByRole('button', { name: 'Collapse Artifacts' });
    const localFiles = screen.getByRole('button', { name: 'Collapse Local files' });
    const sources = await screen.findByRole('button', { name: 'Collapse Sources' });
    expect(artifacts.compareDocumentPosition(localFiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(localFiles.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await user.click(screen.getByRole('option', { name: /10K-NVDA\.pdf/ }));
    expect(onSelect).toHaveBeenCalledWith(reference);
  });
});
