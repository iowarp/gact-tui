import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meshViewportSchema } from './a2ui-mesh-viewport-catalog';
import { rasterViewportSchema } from './a2ui-raster-viewport-catalog';
import { ViewerFileGate } from './viewer-file-gate';

let observed: IntersectionObserverCallback | undefined;
let margin: string | undefined;

beforeEach(() => {
  observed = undefined;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observed = callback;
        margin = options?.rootMargin;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function scroll(near: boolean) {
  act(() =>
    observed?.([{ isIntersecting: near } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
}

const mounts = vi.fn();
function Scene() {
  mounts();
  return <canvas data-testid="scene" />;
}

describe('ViewerFileGate', () => {
  it('mounts the viewer one viewport ahead and disposes it when it leaves', () => {
    mounts.mockClear();
    render(
      <ViewerFileGate files={['artifact://artifact_case07']} noun="3D view">
        <Scene />
      </ViewerFileGate>,
    );
    expect(margin).toBe('100%');
    expect(screen.getByText('The 3D view loads when it scrolls into view.')).toBeInTheDocument();
    expect(screen.queryByTestId('scene')).toBeNull();
    scroll(true);
    expect(screen.getByTestId('scene')).toBeInTheDocument();
    scroll(false);
    expect(screen.queryByTestId('scene')).toBeNull();
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it('says in words when a bound file is not a registered artifact, and loads nothing', () => {
    render(
      <ViewerFileGate files={['/scratch/case07.stl']} noun="3D view">
        <Scene />
      </ViewerFileGate>,
    );
    scroll(true);
    expect(screen.getByRole('alert')).toHaveTextContent(
      "This view's file is not a registered artifact: /scratch/case07.stl",
    );
    expect(screen.queryByTestId('scene')).toBeNull();
  });

  it('says when nothing is selected yet', () => {
    render(
      <ViewerFileGate files={['']} noun="3D view">
        <Scene />
      </ViewerFileGate>,
    );
    expect(screen.getByText('Nothing is selected for this 3D view yet.')).toBeInTheDocument();
  });

  it('reports a lost graphics context in words and reloads the view', () => {
    mounts.mockClear();
    render(
      <ViewerFileGate files={['artifact://artifact_case07']} noun="3D view">
        <Scene />
      </ViewerFileGate>,
    );
    scroll(true);
    act(() => {
      screen.getByTestId('scene').dispatchEvent(new Event('webglcontextlost'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('lost its graphics context');
    expect(screen.queryByTestId('scene')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reload view' }));
    expect(screen.getByTestId('scene')).toBeInTheDocument();
    expect(mounts).toHaveBeenCalledTimes(2);
  });
});

it('lets a viewer file be literal or bound to a selection', () => {
  const bound = { path: '/selection/case/values/0' };
  expect(meshViewportSchema.parse({ meshUri: bound }).meshUri).toEqual(bound);
  expect(
    meshViewportSchema.parse({ meshUri: 'artifact://artifact_a', materialUri: bound }).materialUri,
  ).toEqual(bound);
  expect(rasterViewportSchema.parse({ rasterUri: bound }).rasterUri).toEqual(bound);
  expect(rasterViewportSchema.safeParse({ rasterUri: 3 }).success).toBe(false);
  // A literal must still be a registered artifact; only a binding is checked when shown.
  expect(meshViewportSchema.safeParse({ meshUri: '/scratch/part.glb' }).success).toBe(false);
});

it('resolves a viewer file bound to a selection through the data model', async () => {
  const { Catalog, MessageProcessor } = await import('@a2ui/web_core/v0_9');
  const { A2uiSurface, Column } = await import('@a2ui/react/v0_9');
  const { ClioMeshViewportCatalogComponent } = await import('./a2ui-mesh-viewport-catalog');
  const catalog = new Catalog(
    'test://mesh',
    [Column, ClioMeshViewportCatalogComponent] as never[],
    [],
  );
  const processor = new MessageProcessor([catalog], async () => undefined, { version: 'v0.9.1' });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId: 's', catalogId: 'test://mesh' } },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 's',
        components: [
          { id: 'root', component: 'Column', children: ['viewer'] },
          {
            id: 'viewer',
            component: 'clio.mesh-viewport.v1',
            meshUri: { path: '/selection/case/values/0' },
          },
        ],
      },
    },
    {
      version: 'v0.9.1',
      updateDataModel: {
        surfaceId: 's',
        path: '/',
        value: { selection: { case: { field: 'mesh', values: ['/scratch/c07.stl'] } } },
      },
    },
  ] as never);
  render(<A2uiSurface surface={processor.model.getSurface('s')!} />);
  scroll(true);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "This view's file is not a registered artifact: /scratch/c07.stl",
  );
});
