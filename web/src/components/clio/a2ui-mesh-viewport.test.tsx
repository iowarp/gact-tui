import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import type { ComposerAnnotation } from '@/lib/composer-annotations';

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
import { ClioComposerAnnotations } from './composer-annotations';
import { SelectionActionsProvider } from './selection-actions';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

/** `wrap`, plus the composer's own selection-action registry, for "Reference this" coverage (G0). */
function ComposerHarness({ children }: { children: ReactNode }) {
  const [annotations, setAnnotations] = useState<readonly ComposerAnnotation[]>([]);
  useReferenceThisSelectionAction({ annotations, onAnnotationsChange: setAnnotations }, () => {});
  return (
    <>
      {children}
      <ClioComposerAnnotations
        annotations={annotations}
        onRemove={(gone) => setAnnotations(annotations.filter((item) => item !== gone))}
      />
    </>
  );
}

function wrapWithComposer(children: ReactNode) {
  return wrap(
    <SelectionActionsProvider>
      <ComposerHarness>{children}</ComposerHarness>
    </SelectionActionsProvider>,
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

  it('states that a per-node field cannot threshold a cells export, instead of ignoring it', async () => {
    repository.readArtifactBytes.mockResolvedValue(BRICKS);
    render(
      wrap(
        <ClioMeshViewport
          meshUri="artifact://artifact_bricks_node"
          thresholdField="S_MISES"
          thresholdMin={10}
        />,
      ),
    );
    const note = await screen.findByText(/is per-node; a threshold needs per-element values/);
    expect(note).toHaveAttribute('data-reason', 'threshold_field_per_node');
    // No threshold is claimed in the state line.
    expect(screen.queryByText(/of 2 elements at/)).not.toBeInTheDocument();
  });

  it('refuses a mesh source that is not a registered artifact', () => {
    render(wrap(<ClioMeshViewport meshUri="/scratch/part.glb" />));
    expect(screen.getByText(/not a registered artifact id/)).toBeInTheDocument();
    expect(repository.readArtifactBytes).not.toHaveBeenCalled();
  });

  // G0: built-in toolbar affordances (surface-toolbar.tsx), replacing the old
  // bespoke "Save image" header button.
  describe('G0 surface toolbar', () => {
    it('offers a download menu with a PNG snapshot (disabled without WebGL) and the original mesh file', async () => {
      const user = userEvent.setup();
      repository.readArtifactBytes.mockResolvedValue(SURFACE);
      render(wrap(<ClioMeshViewport field="S_MISES" meshUri="artifact://artifact_surface" />));
      await screen.findByText('Before optimization');

      await user.click(screen.getByRole('button', { name: 'More' }));
      await user.click(screen.getByRole('menuitem', { name: /Download/ }));
      // jsdom has no WebGL, so the scene never exists — the PNG stays
      // disabled, the same gate the old "Save image" button used.
      expect(await screen.findByRole('menuitem', { name: 'PNG snapshot' })).toHaveAttribute(
        'data-disabled',
        '',
      );
      expect(
        screen.getByRole('menuitem', { name: 'Original file' }),
      ).not.toHaveAttribute('data-disabled');
    });

    it('downloads the original mesh artifact bytes, named for the component title', async () => {
      const user = userEvent.setup();
      repository.readArtifactBytes.mockResolvedValue(SURFACE);
      const capturedBlobs: Blob[] = [];
      vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
        if (blob instanceof Blob) capturedBlobs.push(blob);
        return 'blob:fake';
      });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      let downloadedName = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloadedName = this.download;
      });

      render(wrap(<ClioMeshViewport meshUri="artifact://artifact_surface" title="Impeller" />));

      await user.click(screen.getByRole('button', { name: 'More' }));
      await user.click(screen.getByRole('menuitem', { name: /Download/ }));
      const item = await screen.findByRole('menuitem', { name: 'Original file' });
      fireEvent.pointerMove(item);
      fireEvent.click(item);

      // The parse query reads the bytes once (with a fetch path + abort
      // signal); "Original file" reads them again, plainly, for the raw download.
      await waitFor(() => expect(repository.readArtifactBytes).toHaveBeenCalledWith('artifact_surface'));
      await waitFor(() => expect(capturedBlobs).toHaveLength(1));
      expect(downloadedName).toBe('Impeller.glb');
      expect(capturedBlobs[0]!.type).toBe('model/gltf-binary');
      expect(Array.from(new Uint8Array(await capturedBlobs[0]!.arrayBuffer()))).toStrictEqual(
        Array.from(SURFACE),
      );
    });

    it('renders a full-screen toggle that moves the view into a dialog', async () => {
      const user = userEvent.setup();
      repository.readArtifactBytes.mockResolvedValue(SURFACE);
      render(wrap(<ClioMeshViewport meshUri="artifact://artifact_surface" />));
      await screen.findByText('Before optimization');

      const toggle = screen.getByRole('button', { name: 'Full screen' });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await user.click(toggle);

      // Both the toolbar's own toggle and the dialog's own chrome now read
      // "Exit full screen" (same accepted redundancy as the chart/code views).
      expect(screen.getAllByRole('button', { name: 'Exit full screen' }).length).toBeGreaterThan(0);
    });

    it('"Reference this" attaches the component label and the current view, without leaking the raw artifact id into the summary', async () => {
      const user = userEvent.setup();
      repository.readArtifactBytes.mockResolvedValue(SURFACE);
      render(
        wrapWithComposer(
          <ClioMeshViewport field="S_MISES" meshUri="artifact://artifact_surface" title="Impeller" />,
        ),
      );

      await user.click(await screen.findByRole('button', { name: 'Reference this' }));

      const attached = screen.getByRole('list', { name: 'Attached selections' });
      expect(attached).toHaveTextContent('Impeller');
      expect(attached).toHaveTextContent('the current view');
      expect(attached.textContent).not.toContain('artifact_surface');
    });

    it('has no "Reference this" before the mesh has loaded', () => {
      repository.readArtifactBytes.mockImplementation(() => new Promise(() => {}));
      render(wrapWithComposer(<ClioMeshViewport meshUri="artifact://artifact_surface" />));
      expect(screen.queryByRole('button', { name: 'Reference this' })).not.toBeInTheDocument();
    });
  });
});
