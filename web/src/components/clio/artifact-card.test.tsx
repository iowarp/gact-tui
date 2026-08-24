import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  readArtifactBytesFor: vi.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71])),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

import { ClioArtifactCard } from './artifact-card';

beforeEach(() => {
  repository.readArtifactBytesFor.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
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

  it('keeps a labeled, always-visible canvas action', async () => {
    const user = userEvent.setup();
    const onOpen = renderCard();

    await user.click(
      screen.getByRole('button', { name: 'Open station-timeseries.png in workspace canvas' }),
    );
    await waitFor(() =>
      expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'artifact_plot' })),
    );
  });
});
