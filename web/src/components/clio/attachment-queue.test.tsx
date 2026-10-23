import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  ResourceUploadProgress,
  UploadableFilePart,
  WorkspaceResourceUploadResult,
} from '@/lib/upload-workspace-resources';
import {
  PromptInputProvider,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input';
import { ClioComposerAttachments } from './composer-attachments';

vi.mock('./document-pdf-viewer', () => ({ ClioDocumentPdfViewer: () => null }));
afterEach(cleanup);

interface Attempt {
  files: readonly UploadableFilePart[];
  progress?: (progress: ResourceUploadProgress) => void;
  signal?: AbortSignal;
  resolve: (result: WorkspaceResourceUploadResult) => void;
  reject: (error: Error) => void;
}

function queue() {
  const attempts: Attempt[] = [];
  const prepare = vi.fn(
    (files: readonly UploadableFilePart[], progress?: Attempt['progress'], signal?: AbortSignal) =>
      new Promise<WorkspaceResourceUploadResult>((resolve, reject) =>
        attempts.push({ files, progress, signal, resolve, reject }),
      ),
  );
  const discard = vi.fn(async () => undefined);
  function Harness() {
    const attachments = usePromptInputAttachments();
    return (
      <>
        <input
          type="file"
          multiple
          aria-label="Choose files"
          onChange={(event) => {
            if (event.target.files) attachments.add(event.target.files);
          }}
        />
        <ClioComposerAttachments onPrepareFiles={prepare} onDiscardFiles={discard} />
      </>
    );
  }
  render(
    <PromptInputProvider>
      <Harness />
    </PromptInputProvider>,
  );
  return { attempts, prepare, discard };
}

it('shows real byte progress, distinguishes registration and retries a failed upload through its owner', async () => {
  const { attempts, prepare } = queue();
  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText('Choose files'),
    new File(['measurements'], 'data.csv', { type: 'text/csv' }),
  );
  await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  act(() => attempts[0]!.progress?.({ filename: 'data.csv', loaded: 25, total: 100 }));
  expect(screen.getByRole('progressbar', { name: 'Upload progress for data.csv' })).toHaveAttribute(
    'aria-valuenow',
    '25',
  );
  expect(screen.getByText('Uploading 25%')).toBeVisible();
  act(() => attempts[0]!.progress?.({ filename: 'data.csv', loaded: 100, total: 100 }));
  expect(screen.getByText('Registering file')).toBeVisible();
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  act(() => attempts[0]!.reject(new Error('Transfer interrupted')));
  await user.click(await screen.findByRole('button', { name: 'Retry upload for data.csv' }));
  await waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
  expect(attempts[1]!.files[0]!.filename).toBe('data.csv');
  expect(screen.queryByText('Transfer interrupted')).not.toBeInTheDocument();
});

it('aborts the real transfer and discards the pending resource when a queued row is removed', async () => {
  const { attempts, discard } = queue();
  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText('Choose files'),
    new File(['notes'], 'notes.txt', { type: 'text/plain' }),
  );
  await waitFor(() => expect(attempts).toHaveLength(1));
  await user.click(screen.getByRole('button', { name: 'Remove notes.txt' }));
  expect(attempts[0]!.signal?.aborted).toBe(true);
  expect(discard).toHaveBeenCalledWith(attempts[0]!.files);
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Open notes.txt' })).not.toBeInTheDocument(),
  );
});

it('does not retry one failed file automatically when a sibling upload completes', async () => {
  const { attempts, prepare } = queue();
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('Choose files'), [
    new File(['a'], 'first.txt', { type: 'text/plain' }),
    new File(['b'], 'second.txt', { type: 'text/plain' }),
  ]);
  await waitFor(() => expect(attempts).toHaveLength(2));
  act(() => attempts[0]!.reject(new Error('First file failed')));
  await screen.findByRole('button', { name: 'Retry upload for first.txt' });
  await act(async () => attempts[1]!.resolve({ parts: [], resources: [] }));
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Retry upload for first.txt' })).toBeVisible();
});
