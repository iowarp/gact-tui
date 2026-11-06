import type { Artifact, StreamContent } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamArtifactView } from './stream-artifact-view';
import { isStreamArtifact } from './stream-artifact';

const repository = vi.hoisted(() => ({
  streamContent: vi.fn(),
  watchStream: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

afterEach(() => {
  cleanup();
  repository.streamContent.mockReset();
  repository.watchStream.mockClear();
});

const artifact = {
  id: 'artifact_1',
  name: 'sensor',
  producer: { designation: 'stream', stream_id: 'stream_1' },
} as unknown as Artifact;

function entry(seq: number, extra: Record<string, unknown>) {
  return { seq, at: '2026-11-06T10:00:00Z', media_type: 'application/json', size_bytes: 12, ...extra };
}

function content(state: string, entries: ReturnType<typeof entry>[], extra = {}): StreamContent {
  return {
    stream: {
      stream_id: 'stream_1',
      name: 'sensor',
      state,
      window: 60,
      held: entries.length,
      writes: entries.length,
      updated_at: '2026-11-06T10:00:00Z',
      ...extra,
    },
    entries,
  } as unknown as StreamContent;
}

function renderView(sessionId: string | undefined = 'sess_1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StreamArtifactView artifact={artifact} sessionId={sessionId} />
    </QueryClientProvider>,
  );
}

describe('StreamArtifactView', () => {
  it('knows a stream artifact by its producer', () => {
    expect(isStreamArtifact(artifact)).toBe(true);
    expect(isStreamArtifact({ producer: { designation: 'file' } } as never)).toBe(false);
    expect(isStreamArtifact({ producer: undefined } as never)).toBe(false);
  });

  it('shows record entries as a live table and holds a watch lease', async () => {
    repository.streamContent.mockResolvedValue(
      content('open', [
        entry(1, { value: { t: 1, temperature_c: 21.4 } }),
        entry(2, { value: { t: 2, temperature_c: 21.6, status: 'ok' } }),
      ]),
    );
    renderView();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      't',
      'temperature_c',
      'status',
    ]);
    expect(within(table).getByText('21.6')).toBeTruthy();
    // The newest record is shown as fields, every value at once.
    const fields = within(screen.getByLabelText('Newest entry'));
    expect(fields.getByText('status')).toBeTruthy();
    expect(fields.getByText('ok')).toBeTruthy();
    // Newest first: the latest reading is the first row.
    expect(within(table).getAllByRole('row')[1]!.textContent).toContain('21.6');
    expect(screen.getByText(/^Live, last update .+ 2 writes; keeps the newest 60\.$/u)).toBeTruthy();
    expect(repository.streamContent).toHaveBeenCalledWith(
      '/v1/streams/stream_1/content?limit=200',
      expect.anything(),
    );
    await waitFor(() =>
      expect(repository.watchStream).toHaveBeenCalledWith(
        'stream_1',
        'sess_1',
        false,
        undefined,
        expect.any(String),
      ),
    );
  });

  it('shows text and byte entries as a list, and a closed stream as closed', async () => {
    repository.streamContent.mockResolvedValue(
      content(
        'closed',
        [
          entry(1, { media_type: 'text/plain', text: 'door opened' }),
          entry(2, { media_type: 'image/png', size_bytes: 2048 }),
        ],
        { closed_at: '2026-11-06T10:05:00Z' },
      ),
    );
    renderView();
    expect(await screen.findByText('door opened')).toBeTruthy();
    expect(screen.getByText(/2,048 bytes, image\/png/u)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/^Closed at .+; showing its last entries\./u)).toBeTruthy();
  });

  it('says so when a stream has no entries yet', async () => {
    repository.streamContent.mockResolvedValue(content('open', []));
    renderView();
    expect(await screen.findByText('No entries yet.')).toBeTruthy();
  });

  it('says why when the stream cannot be read', async () => {
    repository.streamContent.mockRejectedValue(new Error('stream_not_found'));
    renderView();
    expect((await screen.findByRole('alert')).textContent).toContain('stream_not_found');
  });
});
