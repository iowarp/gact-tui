import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { documentApplications, openFileBytes, revealFileBytes } from '@/tauri/documents';
import { FrameOpenButton } from './file-viewer-take';
import { useOpenTake } from './file-viewer-take-hooks';
import type { FileViewerSource } from './file-viewer-source';

const host = vi.hoisted(() => ({ native: true }));
const repository = vi.hoisted(() => ({
  readArtifactBytesFor: vi.fn(),
  readWorkspaceFileBytes: vi.fn(),
  resourceContent: vi.fn(),
  exportArtifact: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/tauri/downloads', () => ({ openDownloads: vi.fn(async () => {}) }));
vi.mock('@/hooks/use-open-file-in-browser', () => ({ useOpenFileInBrowser: () => vi.fn() }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => host.native }));
vi.mock('@/tauri/documents', () => ({
  documentApplications: vi.fn(),
  openFileBytes: vi.fn(),
  revealFileBytes: vi.fn(),
}));

const bytes = new Uint8Array([0, 255, 10, 42]);
beforeEach(() => {
  host.native = true;
  vi.mocked(documentApplications).mockResolvedValue([
    { id: 'os-app', name: 'Image Viewer', is_default: true },
  ]);
  vi.mocked(openFileBytes).mockResolvedValue('desktop/file.png');
  vi.mocked(revealFileBytes).mockResolvedValue('desktop/file.png');
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

function OpenTake({ source }: { source: FileViewerSource }) {
  return <FrameOpenButton take={useOpenTake(source, [])} />;
}

function mount(source = sources[0]!) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <TooltipProvider>
        <OpenTake source={source} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

async function openWithAnotherApp(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open options' }));
  await user.click(await screen.findByRole('menuitem', { name: /^With another app/u }));
}

it.each(sources)('opens original bytes from $kind with another desktop app', async (source) => {
  mount(source);
  const user = userEvent.setup();
  await openWithAnotherApp(user);
  // Pointer travel between the trigger and the submenu has no geometry in jsdom.
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Image Viewer (default)' }));
  await waitFor(() => expect(openFileBytes).toHaveBeenCalledWith('plot.png', bytes, 'os-app'));
  expect(documentApplications).toHaveBeenCalledWith('plot.png', 'image/png');
  expect(repository.readArtifactBytesFor).toHaveBeenCalledTimes(source.kind === 'artifact' ? 1 : 0);
  expect(repository.readWorkspaceFileBytes).toHaveBeenCalledTimes(
    source.kind === 'workspace' ? 1 : 0,
  );
  expect(repository.resourceContent).toHaveBeenCalledTimes(source.kind === 'resource' ? 1 : 0);
});

it('opens the default app from the face on the desktop', async () => {
  mount();
  const user = userEvent.setup();
  await waitFor(() => expect(documentApplications).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'Open in the system app' }));
  await waitFor(() => expect(openFileBytes).toHaveBeenCalledWith('plot.png', bytes, 'os-app'));
});

it('does not advertise installed applications in a browser', async () => {
  host.native = false;
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open options' }));
  expect(await screen.findByRole('menuitem', { name: /^In the system app/u })).toHaveAttribute(
    'data-disabled',
  );
  expect(screen.queryByRole('menuitem', { name: /^With another app/u })).toBeNull();
  expect(documentApplications).not.toHaveBeenCalled();
});

it('reports an association lookup failure without inventing app choices', async () => {
  vi.mocked(documentApplications).mockRejectedValueOnce(new Error('OS lookup failed'));
  mount();
  const user = userEvent.setup();
  await openWithAnotherApp(user);
  expect(
    await screen.findByRole('menuitem', { name: 'Could not read associated apps' }),
  ).toHaveAttribute('data-disabled');
  expect(openFileBytes).not.toHaveBeenCalled();
});

it.each(sources)('reveals original $kind bytes when there is no associated app', async (source) => {
  vi.mocked(documentApplications).mockResolvedValue([]);
  mount(source);
  const user = userEvent.setup();
  await openWithAnotherApp(user);
  expect(await screen.findByRole('menuitem', { name: 'No associated apps' })).toBeVisible();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Open in folder' }));
  await waitFor(() => expect(revealFileBytes).toHaveBeenCalledWith('plot.png', bytes));
});

it('downloads the artifact with its evidence as one ZIP', async () => {
  host.native = false;
  repository.exportArtifact.mockResolvedValueOnce(
    new Uint8Array([99, 80, 75, 3, 4, 99]).subarray(1, 5),
  );
  let downloaded: Blob | undefined;
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    downloaded = blob as Blob;
    return 'blob:evidence';
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('Drafts-result.csv.crate.zip');
    });
  const [artifact] = sources;
  if (artifact?.kind !== 'artifact') throw new Error('Expected an artifact source');
  mount({ ...artifact, artifact: { ...artifact.artifact, name: 'Drafts / π result.csv' } });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open options' }));
  await user.click(await screen.findByRole('menuitem', { name: /^Download with evidence/u }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(repository.exportArtifact).toHaveBeenCalledWith('art');
  expect(downloaded?.type).toBe('application/zip');
  expect([...new Uint8Array(await downloaded!.arrayBuffer())]).toEqual([80, 75, 3, 4]);
  createUrl.mockRestore();
  click.mockRestore();
});

it('starts no download when the evidence package fails', async () => {
  repository.exportArtifact.mockRejectedValueOnce(new Error('Packaging failed'));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open options' }));
  await user.click(await screen.findByRole('menuitem', { name: /^Download with evidence/u }));
  await waitFor(() => expect(repository.exportArtifact).toHaveBeenCalled());
  expect(click).not.toHaveBeenCalled();
  click.mockRestore();
});

it('offers evidence only for recorded artifacts', async () => {
  mount(sources[1]);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open options' }));
  expect(await screen.findByRole('menuitem', { name: /^Download$|^Download D/u })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: /^Download with evidence/u })).toBeNull();
});
