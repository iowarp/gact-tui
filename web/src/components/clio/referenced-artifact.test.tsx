import type { Artifact } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReferencedArtifact } from './referenced-artifact';

const repository = vi.hoisted(() => ({ artifactDetail: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://localhost:17954' } }),
}));
vi.mock('./artifact-card', () => ({
  ClioArtifactCard: ({ artifact }: { artifact: Artifact }) => <button>{artifact.id}</button>,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const detail = {
  artifact: {
    workspace_id: 'w', name: 'figure.png', kind: 'image', head_artifact_id: 'figure_v2',
    versions: [1, 2].map(version => ({
      artifact_id: `figure_v${version}`, version, uri: `artifact://figure_v${version}`,
      fetch_url: `/v1/artifacts/figure_v${version}/bytes`, custody: 'cas',
    })),
  },
};
function view(id = 'figure_v1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <ReferencedArtifact artifactId={id} sessionId="s" />
  </QueryClientProvider>);
}
describe('just-announced artifact references', () => {
  it('shows loading until the registered version arrives', async () => {
    let resolve!: (value: typeof detail) => void;
    repository.artifactDetail.mockReturnValue(new Promise<typeof detail>(done => { resolve = done; }));
    view();
    expect(screen.getByRole('status')).toHaveTextContent('Loading saved file');
    expect(screen.queryByText('Artifact unavailable')).toBeNull();
    resolve(detail);
    expect(await screen.findByRole('button', { name: 'figure_v1' })).toBeVisible();
    expect(repository.artifactDetail).toHaveBeenCalledWith('figure_v1', expect.any(AbortSignal));
  });
  it('uses the referenced immutable version rather than the latest head', async () => {
    repository.artifactDetail.mockResolvedValue(detail);
    view();
    expect(await screen.findByRole('button', { name: 'figure_v1' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'figure_v2' })).toBeNull();
  });
  it('reports an actual lookup failure', async () => {
    repository.artifactDetail.mockRejectedValue(new Error('Service refused the request.'));
    view();
    expect(await screen.findByText('Artifact unavailable')).toBeVisible();
    expect(screen.getByText('Service refused the request.')).toBeVisible();
  });
  it('reports a missing version without substituting the registry head', async () => {
    repository.artifactDetail.mockResolvedValue(detail);
    view('missing');
    expect(await screen.findByText('The saved file has no readable version.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
