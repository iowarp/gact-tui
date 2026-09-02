import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  readArtifactBytesFor: vi.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71])),
  readArtifactTextFor: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { ClioA2UIArtifact } from './a2ui-artifact';

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:a2ui-artifact-preview'),
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
  vi.clearAllMocks();
});

function renderArtifact(action = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ClioA2UIArtifact
        accessibility={{ label: 'Position plot artifact', description: 'Static plot download' }}
        action={action}
        mediaType="image/png"
        name="MTA1_position_timeseries.png"
        size={170_870}
        uri="artifact://artifact_plot"
      />
    </QueryClientProvider>,
  );
  return action;
}

describe('ClioA2UIArtifact', () => {
  it('reuses the native AI Elements artifact preview without exposing the wire URI', async () => {
    renderArtifact();

    expect(
      await screen.findByRole('img', { name: 'MTA1_position_timeseries.png' }),
    ).toHaveAttribute('src', 'blob:a2ui-artifact-preview');
    expect(screen.getByLabelText('Position plot artifact')).toHaveAttribute(
      'aria-description',
      'Static plot download',
    );
    expect(screen.queryByText('artifact://artifact_plot')).not.toBeInTheDocument();
    expect(repository.readArtifactBytesFor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'artifact_plot' }),
      expect.any(AbortSignal),
    );
  });

  it('claims no session provenance the protocol never supplied', async () => {
    renderArtifact();

    await screen.findByRole('img', { name: 'MTA1_position_timeseries.png' });
    expect(screen.queryByText('Output')).not.toBeInTheDocument();
    expect(screen.queryByText('Input')).not.toBeInTheDocument();
  });

  it('makes the whole artifact card the action target', async () => {
    const user = userEvent.setup();
    const action = renderArtifact();

    await user.click(screen.getByRole('button', { name: 'Open MTA1_position_timeseries.png' }));

    expect(action).toHaveBeenCalledOnce();
  });
});
