import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { documentApplications, openFileBytes } from '@/tauri/documents';
import { NativeFileOpenMenu } from './native-file-open-menu';
import type { FileViewerSource } from './file-viewer-source';
const host = vi.hoisted(() => ({ native: true }));
const repository = vi.hoisted(() => ({
  readArtifactBytesFor: vi.fn(),
  readWorkspaceFileBytes: vi.fn(),
  resourceContent: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => host.native }));
vi.mock('@/tauri/documents', () => ({
  documentApplications: vi.fn(),
  openFileBytes: vi.fn(),
}));
const bytes = new Uint8Array([0, 255, 10, 42]);
beforeEach(() => {
  host.native = true;
  vi.mocked(documentApplications).mockResolvedValue([
    { id: 'os-app', name: 'Image Viewer', is_default: true },
  ]);
  vi.mocked(openFileBytes).mockResolvedValue('desktop/file.png');
  for (const read of Object.values(repository)) read.mockResolvedValue(bytes);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const sources: FileViewerSource[] = [
  {
    kind: 'artifact',
    workspaceId: 'ws',
    artifact: {
      id: 'art',
      workspace_id: 'ws',
      session_id: 's',
      name: 'plot.png',
      media_type: 'image/png',
      uri: 'artifact://plot.png',
    },
  },
  { kind: 'workspace', workspaceId: 'ws', path: 'results/plot.png', mediaType: 'image/png' },
  {
    kind: 'resource',
    workspaceId: 'ws',
    resource: {
      id: 'upload',
      workspace_id: 'ws',
      name: 'plot.png',
      claimed_mime: 'image/png',
      detected_mime: 'image/png',
      state: 'ready',
      client_upload_id: 'client',
      revision: 1,
      detection_source: 'test',
      declared_size: 4,
      failure: '',
      completed_at: '2026-10-09',
      mime_mismatch: false,
      received_size: 4,
      sha256: 'abc',
      created_at: '2026-10-09',
      updated_at: '2026-10-09',
    },
  },
];
function mount(source = sources[0]!) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <NativeFileOpenMenu source={source} />
    </QueryClientProvider>,
  );
}
it.each(sources)('opens original bytes from $kind on the desktop', async (source) => {
  mount(source);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open in' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Image Viewer (default)' }));
  await waitFor(() => expect(openFileBytes).toHaveBeenCalledWith('plot.png', bytes, 'os-app'));
  expect(documentApplications).toHaveBeenCalledWith('plot.png', 'image/png');
  expect(repository.readArtifactBytesFor).toHaveBeenCalledTimes(source.kind === 'artifact' ? 1 : 0);
  expect(repository.readWorkspaceFileBytes).toHaveBeenCalledTimes(
    source.kind === 'workspace' ? 1 : 0,
  );
  expect(repository.resourceContent).toHaveBeenCalledTimes(source.kind === 'resource' ? 1 : 0);
});
it('does not advertise installed applications in a browser', () => {
  host.native = false;
  mount();
  expect(screen.queryByRole('button', { name: 'Open in' })).toBeNull();
  expect(documentApplications).not.toHaveBeenCalled();
});
it('reports an association lookup failure without inventing app choices', async () => {
  vi.mocked(documentApplications).mockRejectedValueOnce(new Error('OS lookup failed'));
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Open in' }));
  expect(
    await screen.findByRole('menuitem', { name: 'Could not read associated apps' }),
  ).toHaveAttribute('data-disabled');
  expect(openFileBytes).not.toHaveBeenCalled();
});
