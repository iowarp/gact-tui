import { createHash, webcrypto } from 'node:crypto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TransportError, type Artifact, type ClioRepository } from '@clio/core/v3';
import { ArtifactView } from './resource-viewers';
import { verifyArtifactRecovery } from './artifact-custody';
import { readFileViewerBytes } from './file-viewer-source';

const repository = vi.hoisted(() => ({
  readArtifactTextFor: vi.fn(),
  readWorkspaceFileBytes: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://agent' } }),
}));

const saved = new TextEncoder().encode('Saved version');
const artifact: Artifact = {
  id: 'saved',
  session_id: 'session',
  workspace_id: 'workspace',
  name: 'result.txt',
  media_type: 'text/plain',
  uri: 'artifact://workspace/result.txt@v1',
  size: saved.length,
  sha256: createHash('sha256').update(saved).digest('hex'),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([undefined, '0'.repeat(64)])(
  'does not substitute an unverified workspace file (%s)',
  async (sha256) => {
    repository.readArtifactTextFor.mockRejectedValue(
      new TransportError('Missing saved bytes', 404),
    );
    repository.readWorkspaceFileBytes.mockResolvedValue(
      new TextEncoder().encode('Changed workspace text'),
    );
    const open = vi.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ArtifactView
          artifact={{ ...artifact, sha256 }}
          workspaceId="workspace"
          files={[{ path: 'result.txt', type: 'file', size: 22, internal: false }]}
          onOpenWorkspaceFile={open}
        />
      </QueryClientProvider>,
    );
    await screen.findByText(sha256 ? /has changed since that version/ : /has no recorded checksum/);
    expect(screen.queryByText('Changed workspace text')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy result.txt' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open current workspace file' }));
    expect(open).toHaveBeenCalledWith('result.txt');
  },
);

it('accepts matching bytes, then rechecks identity at download time', async () => {
  await expect(verifyArtifactRecovery(artifact, saved, 'result.txt')).resolves.toBeUndefined();
  const transport = {
    readWorkspaceFileBytes: vi.fn().mockResolvedValue(new TextEncoder().encode('Changed later')),
  };
  await expect(
    readFileViewerBytes(transport as unknown as ClioRepository, {
      kind: 'artifact',
      artifact,
      workspaceId: 'workspace',
      verifiedWorkspacePath: 'result.txt',
    }),
  ).rejects.toThrow(/has changed/);
});
