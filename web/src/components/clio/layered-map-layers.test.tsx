import { cleanup, render, waitFor } from '@testing-library/react';
import type { MapLibreMap } from 'maplibre-gl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapLayer } from './layered-map-model';

const rows = vi.hoisted(() => ({ current: [] as Record<string, unknown>[] }));
vi.mock('./table-query-rows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./table-query-rows')>()),
  useTableQueryRows: () => ({ rows: rows.current, note: '', error: '' }),
}));
vi.mock('@/theme/runtime', () => ({ readThemeColor: (token: string) => `token:${token}` }));
vi.mock('./category-colors', () => ({ categoryColor: (name: string) => `category:${name}` }));

const { TableLayerSource } = await import('./layered-map-layers');

afterEach(cleanup);

function fakeMap(): MapLibreMap {
  return {
    getSource: () => undefined,
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getLayer: () => undefined,
    setLayoutProperty: vi.fn(),
  } as unknown as MapLibreMap;
}

const track: MapLayer = {
  id: 'track',
  kind: 'points',
  label: 'ru29 track',
  dataUri: 'artifact://artifact_glider',
  latitudeField: 'lat',
  longitudeField: 'lon',
  idField: 'id',
  categoryField: 'leg',
};

describe('TableLayerSource category legend', () => {
  it('reports each category with the colour it painted, and nothing for a value-coloured layer', async () => {
    rows.current = [
      { id: 'a', lat: 17.8, lon: -64.7, leg: 'transect 18', depth: 4 },
      { id: 'b', lat: 17.9, lon: -64.6, leg: 'transect 18', depth: 9 },
      { id: 'c', lat: 18.0, lon: -64.5, leg: 'transect 43', depth: 2 },
      { id: 'd', lat: 18.1, lon: -64.4, leg: null, depth: 7 },
    ];
    const onCategories = vi.fn();
    const props = {
      map: fakeMap(),
      now: undefined,
      edits: undefined,
      selectedIds: new Set<string>(),
      visible: true,
      query: undefined,
      onRows: vi.fn(),
      onCategories,
    };
    const { rerender } = render(<TableLayerSource {...props} layer={track} />);
    await waitFor(() =>
      expect(onCategories).toHaveBeenLastCalledWith('track', [
        { category: 'transect 18', color: 'category:transect 18', count: 2 },
        { category: 'transect 43', color: 'category:transect 43', count: 1 },
        { category: null, color: 'token:primary', count: 1 },
      ]),
    );

    rerender(<TableLayerSource {...props} layer={{ ...track, valueField: 'depth' }} />);
    await waitFor(() => expect(onCategories).toHaveBeenLastCalledWith('track', []));
  });
});
