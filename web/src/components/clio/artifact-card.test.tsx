import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  readArtifactBytesFor: vi.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71])),
  readArtifactTextFor: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

import { ClioArtifactCard } from './artifact-card';

beforeEach(() => {
  repository.readArtifactBytesFor.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
  repository.readArtifactTextFor.mockReset();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:artifact-preview'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(() => undefined),
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.restoreAllMocks();
});

function renderCard(onOpen = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ClioArtifactCard
        artifact={{
          id: 'artifact_plot',
          session_id: 'session_1',
          workspace_id: 'workspace_1',
          name: 'station-timeseries.png',
          media_type: 'image/png',
          uri: 'artifact://workspace_1/station-timeseries.png@v1',
          size: 4096,
        }}
        onOpen={onOpen}
      />
    </QueryClientProvider>,
  );
  return onOpen;
}

describe('ClioArtifactCard', () => {
  it('uses the AI Elements attachment preview for image artifacts', async () => {
    renderCard();

    expect(await screen.findByRole('img', { name: 'station-timeseries.png' })).toHaveAttribute(
      'src',
      'blob:artifact-preview',
    );
    expect(repository.readArtifactBytesFor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'artifact_plot' }),
      expect.any(AbortSignal),
    );
  });

  it('makes the complete artifact element the labeled canvas action', async () => {
    const user = userEvent.setup();
    const onOpen = renderCard();

    await user.click(screen.getByRole('button', { name: 'Open station-timeseries.png' }));
    await waitFor(() =>
      expect(onOpen).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'artifact_plot' }),
        expect.objectContaining({ shiftKey: false }),
      ),
    );
  });

  it('keeps tabular artifacts bounded without verbose instructional copy', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ClioArtifactCard
          artifact={{
            id: 'artifact_catalog',
            session_id: 'session_1',
            workspace_id: 'workspace_1',
            name: 'stations.csv',
            media_type: 'text/csv',
            uri: 'artifact://workspace_1/stations.csv@v3',
            size: 160_000,
          }}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('stations.csv')).toBeVisible();
    expect(screen.queryByText(/Open this data table/u)).not.toBeInTheDocument();
    expect(repository.readArtifactTextFor).not.toHaveBeenCalled();
  });

  it('does not download an inline preview when the service omits artifact size', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ClioArtifactCard
          artifact={{
            id: 'artifact_unbounded',
            session_id: 'session_1',
            workspace_id: 'workspace_1',
            name: 'unbounded.png',
            media_type: 'image/png',
            uri: 'artifact://workspace_1/unbounded.png@v1',
          }}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/did not report a size for this image/u)).toBeVisible();
    expect(repository.readArtifactBytesFor).not.toHaveBeenCalled();
  });
});
