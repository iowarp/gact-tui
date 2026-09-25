import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const SURFACE = new Uint8Array(
  readFileSync(resolve(process.cwd(), 'src/test-fixtures/mesh/surface.glb')),
);

const BRICKS = new Uint8Array(
  readFileSync(resolve(process.cwd(), 'src/test-fixtures/mesh/bricks.glb')),
);

const repository = vi.hoisted(() => ({ readArtifactBytes: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { ClioMeshViewport } from './a2ui-mesh-viewport';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ClioMeshViewport', () => {
  it('reads the mesh through the artifact byte route and describes it in words', async () => {
    repository.readArtifactBytes.mockResolvedValue(SURFACE);
    render(wrap(<ClioMeshViewport field="S_MISES" meshUri="artifact://artifact_surface" />));

    await waitFor(() =>
      expect(repository.readArtifactBytes).toHaveBeenCalledWith(
        'artifact_surface',
        undefined,
        expect.any(AbortSignal),
      ),
    );
    // The stage from the file names the view when the producer gave no title.
    expect(await screen.findByText('Before optimization')).toBeInTheDocument();
    expect(screen.getByText('20 surface triangles, units mm')).toBeInTheDocument();
    // jsdom has no WebGL: the failure is stated, never left as a blank canvas.
    expect(screen.getByText(/cannot draw 3D graphics/i)).toBeInTheDocument();
  });

  it('says when the requested field is not in the mesh', async () => {
    repository.readArtifactBytes.mockResolvedValue(SURFACE);
    render(wrap(<ClioMeshViewport field="PEEQ" meshUri="artifact://artifact_surface" />));
    expect(await screen.findByText(/has no “PEEQ” result/)).toBeInTheDocument();
  });

  it('names the frame and the threshold result for a cells export', async () => {
    repository.readArtifactBytes.mockResolvedValue(BRICKS);
    render(
      wrap(
        <ClioMeshViewport
          field="DENSITY"
          frame={2}
          meshUri="artifact://artifact_bricks"
          thresholdField="DENSITY"
          thresholdMax={1}
          thresholdMin={0.3}
        />,
      ),
    );
    expect(await screen.findByText(/^Cycle 2, /)).toBeInTheDocument();
  });

  it('refuses a mesh source that is not a registered artifact', () => {
    render(wrap(<ClioMeshViewport meshUri="/scratch/part.glb" />));
    expect(screen.getByText(/not a registered artifact id/)).toBeInTheDocument();
    expect(repository.readArtifactBytes).not.toHaveBeenCalled();
  });
});
