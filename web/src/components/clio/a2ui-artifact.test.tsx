import { TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A2uiReferenceSessionProvider } from '@/lib/a2ui/reference-session';

const AWKWARD = 'plot #1 & more+50%.png';

const repository = vi.hoisted(() => ({
  resolveA2uiReference: vi.fn(),
  readArtifactBytesFor: vi.fn(),
  readArtifactTextFor: vi.fn(),
  workspaceFiles: vi.fn(),
  readWorkspaceFileBytes: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { ClioA2UIArtifact } from './a2ui-artifact';

function artifactResolution(uri: string) {
  return {
    uri,
    kind: 'artifact',
    workspace_id: 'ws_1',
    name: 'MTA1_position_timeseries.png',
    media_type: 'image/png',
    size_bytes: 170_870,
    artifact_id: 'artifact_plot',
    fetch_path: '/v1/artifacts/artifact_plot/bytes',
  };
}

beforeEach(() => {
  repository.resolveA2uiReference.mockImplementation(async (_sid: string, uri: string) =>
    artifactResolution(uri),
  );
  repository.readArtifactBytesFor.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
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

function renderArtifact({
  action = vi.fn(),
  uri = 'artifact://artifact_plot',
  size = 170_870 as number | undefined,
  name = 'MTA1_position_timeseries.png',
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <A2uiReferenceSessionProvider value="sess_1">
        <ClioA2UIArtifact
          accessibility={{ label: 'Position plot artifact', description: 'Static plot download' }}
          action={action}
          mediaType="image/png"
          name={name}
          size={size}
          uri={uri}
        />
      </A2uiReferenceSessionProvider>
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

  it.each([`artifact://ws_1/${AWKWARD}@v1`, 'artifact:artifact_plot', 'artifact_plot'])(
    'gives the card the resolved identity for %s, workspace included',
    async (uri) => {
      renderArtifact({ uri, size: undefined });

      await screen.findByRole('img', { name: 'MTA1_position_timeseries.png' });
      expect(repository.resolveA2uiReference).toHaveBeenCalledWith(
        'sess_1',
        uri,
        expect.any(AbortSignal),
      );
      // The real version id, workspace (so the workspace fallback can engage),
      // service-reported size (so the preview is not withheld) and byte route.
      expect(repository.readArtifactBytesFor).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'artifact_plot',
          workspace_id: 'ws_1',
          size: 170_870,
          fetch_path: '/v1/artifacts/artifact_plot/bytes',
        }),
        expect.any(AbortSignal),
      );
    },
  );

  it('previews a resource through its content route', async () => {
    repository.resolveA2uiReference.mockResolvedValue({
      uri: 'resource://ws_1/res_map',
      kind: 'resource',
      workspace_id: 'ws_1',
      name: 'site map #2 & legend.png',
      media_type: 'image/png',
      size_bytes: 4856,
      resource_id: 'res_map',
      fetch_path: '/v1/workspaces/ws_1/resources/res_map/content',
    });
    renderArtifact({ uri: 'resource://ws_1/res_map', name: 'site map #2 & legend.png' });

    await screen.findByRole('img', { name: 'site map #2 & legend.png' });
    expect(repository.readArtifactBytesFor).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'res_map',
        fetch_path: '/v1/workspaces/ws_1/resources/res_map/content',
      }),
      expect.any(AbortSignal),
    );
  });

  it('names an unresolvable reference in the card, not a silent empty preview', async () => {
    repository.resolveA2uiReference.mockRejectedValue(
      new TransportError('missing', 404, 'reference_not_found'),
    );
    renderArtifact({ uri: `artifact://ws_1/${AWKWARD}@v9` });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-reason', 'reference_not_found');
    expect(alert).toHaveTextContent(/not registered on the connected service/u);
    expect(repository.readArtifactBytesFor).not.toHaveBeenCalled();
  });

  it('names a refused byte read by its real reason', async () => {
    repository.readArtifactBytesFor.mockRejectedValue(
      new TransportError('auth', 401, 'authentication_required'),
    );
    renderArtifact();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-reason', 'authentication_required');
    expect(alert).toHaveTextContent(/access token/u);
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
