import { Blob as NodeBlob } from 'node:buffer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { Artifact } from '@clio/core/v3';
import { afterEach, expect, it, vi } from 'vitest';
import { FileCopyDialog } from './file-copy-dialog';

const repository = vi.hoisted(() => ({
  readArtifactBytesFor: vi.fn(),
  createResource: vi.fn(),
  appendResourceBytes: vi.fn(),
  resource: vi.fn(),
  workspaces: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const artifact: Artifact = {
  id: 'artifact_doc',
  name: 'report.docx',
  workspace_id: 'source',
  session_id: 'session_1',
  uri: 'artifact://report.docx@v1',
  size: 4,
  media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
function Copy() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Copy again</button>
      <FileCopyDialog
        source={{ kind: 'artifact', artifact, workspaceId: 'source' }}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

it('copies original Office bytes with a resumable retry and a fresh ID for the next copy', async () => {
  vi.stubGlobal('Blob', NodeBlob);
  const user = userEvent.setup();
  const bytes = new Uint8Array([80, 75, 3, 4]);
  const record = {
    id: 'copied',
    workspace_id: 'destination',
    name: artifact.name,
    received_size: 2,
    state: 'uploading',
  };
  repository.workspaces.mockResolvedValue([
    { id: 'source', name: 'Source' },
    { id: 'destination', name: 'Destination' },
  ]);
  repository.readArtifactBytesFor.mockResolvedValue(bytes);
  repository.createResource.mockResolvedValue(record);
  repository.appendResourceBytes
    .mockRejectedValueOnce(new Error('Connection interrupted'))
    .mockResolvedValue(undefined);
  repository.resource.mockResolvedValue({ ...record, received_size: 4, state: 'ready' });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Copy />
    </QueryClientProvider>,
  );
  await user.click(await screen.findByLabelText('Destination workspace'));
  await user.click(screen.getByRole('option', { name: 'Destination' }));
  await user.click(screen.getByRole('button', { name: 'Copy file' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
  await user.click(screen.getByRole('button', { name: 'Copy file' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(repository.readArtifactBytesFor).toHaveBeenCalledWith(artifact);
  expect(repository.appendResourceBytes).toHaveBeenLastCalledWith(
    'destination',
    'copied',
    2,
    new Uint8Array([3, 4]),
    undefined,
  );
  const first = repository.createResource.mock.calls[0]![1];
  expect(first).toMatchObject({ name: artifact.name, mediaType: artifact.media_type, size: 4 });
  expect(repository.createResource.mock.calls[1]![1].clientUploadId).toBe(first.clientUploadId);
  await user.click(screen.getByRole('button', { name: 'Copy again' }));
  await user.click(screen.getByLabelText('Destination workspace'));
  await user.click(screen.getByRole('option', { name: 'Destination' }));
  await user.click(screen.getByRole('button', { name: 'Copy file' }));
  await waitFor(() => expect(repository.createResource).toHaveBeenCalledTimes(3));
  expect(repository.createResource.mock.calls[2]![1].clientUploadId).not.toBe(first.clientUploadId);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
