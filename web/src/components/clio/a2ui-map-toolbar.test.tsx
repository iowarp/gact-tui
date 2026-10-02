import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  artifactTableExport: vi.fn(),
  artifactTableQuery: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
// G0: `onMapInstance` is how `ClioScientificMap` captures the live maplibre
// `Map` for PNG export (`map.once('render', ...)` + `map.triggerRepaint()`,
// `map-export.ts`'s `mapPngBlob` — #516 review item 14 replaced the previous
// direct `map.getCanvas()` read); the real `<Map>` needs a WebGL canvas
// jsdom cannot provide (see `scientific-map-view.test.tsx`'s own doc
// comment), so this stand-in hands back a real, plain `<canvas>` plus fake
// `once`/`triggerRepaint` that synchronously invoke the render listener — a
// `react-map-gl`-dynamic-import style async factory + `react.useEffect`
// (not a static top-level `useEffect` import) avoids referencing a binding
// before `vi.mock`'s own hoisting makes it available, same as the
// `react-map-gl/maplibre` mock in `scientific-map-view.test.tsx`.
vi.mock('./scientific-map-view', async () => {
  const react = await import('react');
  return {
    ClioScientificMapView: ({
      onMapInstance,
    }: {
      onMapInstance?: (map: {
        getCanvas: () => HTMLCanvasElement;
        getCenter: () => { lng: number; lat: number };
        getZoom: () => number;
        loaded: () => boolean;
        on: () => void;
        off: () => void;
        once: (type: 'render' | 'remove', listener: () => void) => void;
        triggerRepaint: () => void;
      }) => void;
    }) => {
      react.useEffect(() => {
        const canvas = document.createElement('canvas');
        onMapInstance?.({
          getCanvas: () => canvas,
          getCenter: () => ({ lng: 0, lat: 0 }),
          getZoom: () => 3,
          loaded: () => true,
          on: () => {},
          off: () => {},
          once: (type, listener) => { if (type === 'render') listener(); },
          triggerRepaint: () => {},
        });
      }, [onMapInstance]);
      return <div data-testid="map-canvas" />;
    },
  };
});
// The side list virtualizes with `@tanstack/react-virtual` (#1533 MEDIUM 6 —
// scaling past one DOM node per point); jsdom never resolves a real scroll
// container height, so — same as every other virtualized list in this
// codebase (transcript-minimap.test.tsx, conversation-activity.test.tsx) —
// stub it to render every row, keeping these tests about selection/filter
// behavior rather than virtualization mechanics.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 56,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: 56,
        start: index * 56,
      })),
  }),
}));

import { useState } from 'react';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';
import { ClioComposerAnnotations } from './composer-annotations';
import { SelectionActionsProvider } from './selection-actions';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import type { ComposerAnnotation } from '@/lib/composer-annotations';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Opens the map's shared `SurfaceToolbar` overflow and nested Download submenu. */
async function mapSurface(): Promise<HTMLElement> {
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="a2ui-map"] button[aria-label="More"]'),
    ).toBeInTheDocument(),
  );
  return document.querySelector('[data-slot="a2ui-map"]') as HTMLElement;
}

async function openDownloadMenu(user: ReturnType<typeof userEvent.setup>) {
  const map = await mapSurface();
  await user.click(within(map).getByRole('button', { name: 'More' }));
  await user.click(screen.getByRole('menuitem', { name: /Download/ }));
}

/** The point count moved from the map body into its secondary toolbar details. */
async function expectMapCount(user: ReturnType<typeof userEvent.setup>, count: string) {
  const dialog = screen.queryByRole('dialog');
  const toolbarScope = dialog ?? (await mapSurface());
  await user.click(within(toolbarScope).getByRole('button', { name: 'More' }));
  expect(await screen.findByRole('menuitem', { name: count })).toBeVisible();
  await user.keyboard('{Escape}');
}

/**
 * Radix submenu/menu items track "current" via real pointer-move events,
 * which jsdom's synthetic `userEvent.click` does not generate — fire the
 * pointer sequence directly so `onSelect` actually runs.
 */
function selectMenuItem(item: HTMLElement) {
  fireEvent.pointerMove(item);
  fireEvent.click(item);
}

/** A composer stand-in, inside the provider, so "Reference this" has somewhere real to attach to. */
function ComposerAndChildren({ children }: { children: ReactNode }) {
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

function WithComposer({ children }: { children: ReactNode }) {
  return (
    <SelectionActionsProvider>
      <ComposerAndChildren>{children}</ComposerAndChildren>
    </SelectionActionsProvider>
  );
}

const TEST_CATALOG_ID = 'test://a2ui-map-data-source';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [...KERNEL_COMPONENTS.values()],
  [...KERNEL_FUNCTIONS.values()],
);

function buildSurface(components: Record<string, unknown>[]) {
  const surfaceId = 'map-surface';
  const processor = new MessageProcessor([testCatalog], async () => undefined, {
    version: 'v0.9.1',
  });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId, catalogId: TEST_CATALOG_ID } },
    { version: 'v0.9.1', updateComponents: { surfaceId, components } },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the test surface to exist');
  return surface;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A single-point dataUri map surface, shared by the G0 toolbar tests below. */
function dataUriMapSurface(title = 'Stations') {
  return buildSurface([
    { id: 'root', component: 'Column', children: ['map'] },
    {
      id: 'map',
      component: 'clio.map.v1',
      dataUri: 'artifact://artifact_stations01',
      labelField: 'station',
      latitudeField: 'lat',
      longitudeField: 'lon',
      title,
    },
  ]);
}

describe('clio.map.v1 G0 toolbar — dataUri', () => {
  beforeEach(() => {
    repository.artifactTableQuery.mockResolvedValue({
      columns: { lat: [34.1], lon: [-118.3], station: ['GNSS01'] },
      downsample: { mode: 'none' },
      matchedRows: 1,
      returnedRows: 1,
      schema: [],
      totalRows: 1,
      truncated: false,
    });
  });

  it('offers a PNG map image plus the server CSV/JSON download, and exports the PNG from the live canvas', async () => {
    const user = userEvent.setup();
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
        callback(new Blob(['png-bytes'], { type: 'image/png' }));
      });
    render(wrap(<A2uiSurface surface={dataUriMapSurface()} />));
    // Waiting for the (mocked, lazily-loaded) canvas specifically, not just
    // the header's "N locations" text — the header renders as soon as rows
    // resolve, which can land before the lazy `ClioScientificMapView` chunk
    // mounts and fires `onMapInstance`, leaving `mapInstanceRef` still unset.
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument());

    await openDownloadMenu(user);
    for (const label of [
      'PNG image',
      'CSV (current view)',
      'JSON (current view)',
      'CSV (full dataset)',
    ]) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeInTheDocument();
    }

    selectMenuItem(screen.getByRole('menuitem', { name: 'PNG image' }));
    await waitFor(() => expect(toBlobSpy).toHaveBeenCalledWith(expect.any(Function), 'image/png'));
    toBlobSpy.mockRestore();
  });

  it('exports the current view (with the live filter) and the full dataset through table-export', async () => {
    repository.artifactTableExport.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const user = userEvent.setup();
    render(wrap(<A2uiSurface surface={dataUriMapSurface()} />));
    await expectMapCount(user, '1 locations');
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument());

    await openDownloadMenu(user);
    selectMenuItem(await screen.findByRole('menuitem', { name: 'CSV (current view)' }));
    await waitFor(() =>
      expect(repository.artifactTableExport).toHaveBeenCalledWith(
        'artifact_stations01',
        expect.objectContaining({ format: 'csv', scope: 'current' }),
      ),
    );

    await openDownloadMenu(user);
    selectMenuItem(await screen.findByRole('menuitem', { name: 'CSV (full dataset)' }));
    await waitFor(() =>
      expect(repository.artifactTableExport).toHaveBeenLastCalledWith('artifact_stations01', {
        format: 'csv',
        scope: 'full',
      }),
    );
  });

  it('includes the producer\'s own downsample request in the "current view" export, matching what the map actually draws (#516 review item 16)', async () => {
    repository.artifactTableExport.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const user = userEvent.setup();
    render(
      wrap(
        <A2uiSurface
          surface={buildSurface([
            { id: 'root', component: 'Column', children: ['map'] },
            {
              id: 'map',
              component: 'clio.map.v1',
              dataQuery: { downsample: { mode: 'stride' } },
              dataUri: 'artifact://artifact_stations01',
              labelField: 'station',
              latitudeField: 'lat',
              longitudeField: 'lon',
              title: 'Stations',
            },
          ])}
        />,
      ),
    );
    await expectMapCount(user, '1 locations');
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument());

    await openDownloadMenu(user);
    selectMenuItem(await screen.findByRole('menuitem', { name: 'CSV (current view)' }));
    await waitFor(() =>
      expect(repository.artifactTableExport).toHaveBeenCalledWith(
        'artifact_stations01',
        expect.objectContaining({
          downsample: { mode: 'stride' },
          format: 'csv',
          scope: 'current',
        }),
      ),
    );
  });

  it('full-screens the map body while the header toolbar stays in place, with the same canvas', async () => {
    const user = userEvent.setup();
    render(wrap(<A2uiSurface surface={dataUriMapSurface()} />));
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Full screen' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('map-canvas')).toBeInTheDocument();
    // The SAME canvas, not a second one left behind inline.
    expect(screen.getAllByTestId('map-canvas')).toHaveLength(1);
    // The map count is secondary detail in the shared overflow, including in full screen.
    await expectMapCount(user, '1 locations');

    await user.click(within(dialog).getByRole('button', { name: 'Exit full screen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
  });
});

describe('clio.map.v1 G0 toolbar — inline points', () => {
  function inlinePointsSurface(title = 'Stations') {
    return buildSurface([
      { id: 'root', component: 'Column', children: ['map'] },
      {
        id: 'map',
        component: 'clio.map.v1',
        points: [
          { id: 's1', label: 'Station 1', latitude: 34.1, longitude: -118.3, category: 'GNSS' },
        ],
        title,
      },
    ]);
  }

  it('offers PNG plus a client-side CSV/JSON download — no dataUri, so no server export entries', async () => {
    const user = userEvent.setup();
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
        callback(new Blob(['png-bytes'], { type: 'image/png' }));
      });
    render(wrap(<A2uiSurface surface={inlinePointsSurface()} />));
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument());

    await openDownloadMenu(user);
    expect(await screen.findByRole('menuitem', { name: 'PNG image' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'CSV data' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'JSON data' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /current view|full dataset/iu }),
    ).not.toBeInTheDocument();

    selectMenuItem(screen.getByRole('menuitem', { name: 'PNG image' }));
    await waitFor(() => expect(toBlobSpy).toHaveBeenCalled());
    expect(repository.artifactTableExport).not.toHaveBeenCalled();
    toBlobSpy.mockRestore();
  });

  it('offers "Reference this" for inline points, with no dataUri to name', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <WithComposer>
          <A2uiSurface surface={inlinePointsSurface()} />
        </WithComposer>,
      ),
    );
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Reference this' }));

    const attached = screen.getByRole('list', { name: 'Attached selections' });
    expect(attached).toHaveTextContent('Stations');
    expect(attached).toHaveTextContent('the filtered current view (1 points)');

    await user.click(screen.getByRole('button', { name: /Show the full .* reference/u }));
    const popover = await screen.findByText('Sent with your next message, exactly as shown below.');
    const popoverBody = popover.closest('[data-slot="popover-content"]') as HTMLElement;
    expect(popoverBody).toHaveTextContent('inline data');
    expect(popoverBody).toHaveTextContent('Station 1');
  });

  it('full-screens inline points the same way a dataUri map does', async () => {
    const user = userEvent.setup();
    render(wrap(<A2uiSurface surface={inlinePointsSurface()} />));
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Full screen' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('map-canvas')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Exit full screen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
