import { fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `react-map-gl/maplibre`'s `<Map>` needs a real WebGL canvas maplibre-gl
 * cannot get from jsdom, so the rectangle-selection gesture (pointer capture,
 * pixel math, the drag-distance threshold) is tested against a light stand-in
 * that exposes the one surface this component actually uses: a forwarded
 * `MapRef` (`getMap().unproject(...)`, `boxZoom.disable()`) and an `onLoad`
 * callback. `a2ui-map-data-source.test.tsx` mocks this component out
 * entirely for the same reason; this file is the map view's own coverage.
 */
const fakeMap = vi.hoisted(() => ({
  boxZoom: { disable: vi.fn() },
  unproject: vi.fn((point: [number, number]) => ({ lat: point[1] / 10, lng: point[0] / 10 })),
}));
const capturedMapProps = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));
const capturedSourceData = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('react-map-gl/maplibre', async () => {
  const react = await import('react');
  const MapMock = react.forwardRef(function MapMock(
    props: {
      children?: ReactNode;
      onLoad?: (event: { target: typeof fakeMap }) => void;
    } & Record<string, unknown>,
    ref: React.Ref<unknown>,
  ) {
    capturedMapProps.current = props;
    react.useImperativeHandle(ref, () => ({ getMap: () => fakeMap }));
    react.useEffect(() => {
      props.onLoad?.({ target: fakeMap });
      // Intentionally fires once, mirroring maplibre's own single 'load' event.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return react.createElement('div', { 'data-testid': 'fake-map' }, props.children);
  });
  return {
    __esModule: true,
    default: MapMock,
    Layer: (props: { id?: string }) =>
      react.createElement('div', { 'data-layer-id': props.id, 'data-testid': 'map-points-layer' }),
    Marker: (props: { children?: ReactNode }) => props.children,
    NavigationControl: () => null,
    Popup: (props: { children?: ReactNode }) => props.children,
    Source: (props: { children?: ReactNode; data?: unknown }) => {
      capturedSourceData.current = props.data;
      return props.children;
    },
  };
});

import { ClioScientificMapView, type ScientificMapPoint } from './scientific-map-view';

const POINTS: ScientificMapPoint[] = [
  { id: 'inside-1', label: 'Inside one', latitude: 2, longitude: 3 },
  { id: 'inside-2', label: 'Inside two', latitude: 4, longitude: 6 },
  { id: 'outside', label: 'Outside', latitude: 50, longitude: 50 },
];

/** `fakeMap.unproject` maps container pixel `(x, y)` to `{lng: x/10, lat: y/10}`. */
function stubContainerRect(element: Element) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    bottom: 300,
    height: 300,
    left: 0,
    right: 400,
    top: 0,
    width: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ClioScientificMapView zone selection', () => {
  it('disables the default shift+drag box-zoom once the map loads', () => {
    render(<ClioScientificMapView onSelect={vi.fn()} points={POINTS} />);
    expect(fakeMap.boxZoom.disable).toHaveBeenCalledTimes(1);
  });

  it('shift+drags a rectangle and selects every point inside it', () => {
    const onZoneSelect = vi.fn();
    const { container } = render(
      <ClioScientificMapView onSelect={vi.fn()} onZoneSelect={onZoneSelect} points={POINTS} />,
    );
    const surface = container.querySelector('[data-slot="a2ui-map-surface"]')!;
    stubContainerRect(surface);

    // Bounds unproject to lng [0,10] / lat [0,10] — both "inside" points, not
    // the one at (50, 50).
    fireEvent.pointerDown(surface, { button: 0, clientX: 0, clientY: 0, shiftKey: true });
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 100, shiftKey: true });
    fireEvent.pointerUp(surface, { clientX: 100, clientY: 100, shiftKey: true });

    expect(fakeMap.unproject).toHaveBeenCalledWith([0, 0]);
    expect(fakeMap.unproject).toHaveBeenCalledWith([100, 100]);
    expect(onZoneSelect).toHaveBeenCalledTimes(1);
    expect(onZoneSelect).toHaveBeenCalledWith(expect.arrayContaining(['inside-1', 'inside-2']));
    expect(onZoneSelect.mock.calls[0]![0]).not.toContain('outside');
  });

  it('draws a visible rectangle while dragging, removed once released', () => {
    const { container } = render(
      <ClioScientificMapView onSelect={vi.fn()} onZoneSelect={vi.fn()} points={POINTS} />,
    );
    const surface = container.querySelector('[data-slot="a2ui-map-surface"]')!;
    stubContainerRect(surface);

    expect(container.querySelector('[data-slot="a2ui-map-zone-drag"]')).toBeNull();
    fireEvent.pointerDown(surface, { button: 0, clientX: 0, clientY: 0, shiftKey: true });
    fireEvent.pointerMove(surface, { clientX: 50, clientY: 40, shiftKey: true });
    expect(container.querySelector('[data-slot="a2ui-map-zone-drag"]')).not.toBeNull();
    fireEvent.pointerUp(surface, { clientX: 50, clientY: 40, shiftKey: true });
    expect(container.querySelector('[data-slot="a2ui-map-zone-drag"]')).toBeNull();
  });

  it('ignores an ordinary drag (no shift): normal map panning is left alone', () => {
    const onZoneSelect = vi.fn();
    const { container } = render(
      <ClioScientificMapView onSelect={vi.fn()} onZoneSelect={onZoneSelect} points={POINTS} />,
    );
    const surface = container.querySelector('[data-slot="a2ui-map-surface"]')!;
    stubContainerRect(surface);

    fireEvent.pointerDown(surface, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(surface, { clientX: 100, clientY: 100 });

    expect(onZoneSelect).not.toHaveBeenCalled();
    expect(container.querySelector('[data-slot="a2ui-map-zone-drag"]')).toBeNull();
  });

  it('ignores a shift+click that never moved past the drag threshold', () => {
    const onZoneSelect = vi.fn();
    const { container } = render(
      <ClioScientificMapView onSelect={vi.fn()} onZoneSelect={onZoneSelect} points={POINTS} />,
    );
    const surface = container.querySelector('[data-slot="a2ui-map-surface"]')!;
    stubContainerRect(surface);

    fireEvent.pointerDown(surface, { button: 0, clientX: 20, clientY: 20, shiftKey: true });
    fireEvent.pointerUp(surface, { clientX: 21, clientY: 21, shiftKey: true });

    expect(onZoneSelect).not.toHaveBeenCalled();
  });

  it('does nothing when the surface has no onZoneSelect (e.g. selection is unbound)', () => {
    const { container } = render(<ClioScientificMapView onSelect={vi.fn()} points={POINTS} />);
    const surface = container.querySelector('[data-slot="a2ui-map-surface"]')!;
    stubContainerRect(surface);

    fireEvent.pointerDown(surface, { button: 0, clientX: 0, clientY: 0, shiftKey: true });
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 100, shiftKey: true });
    fireEvent.pointerUp(surface, { clientX: 100, clientY: 100, shiftKey: true });

    expect(container.querySelector('[data-slot="a2ui-map-zone-drag"]')).toBeNull();
  });
});

describe('ClioScientificMapView at scale (#1533 MEDIUM 6)', () => {
  function manyPoints(count: number): ScientificMapPoint[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `p${index}`,
      label: `Point ${index}`,
      latitude: index * 0.01,
      longitude: index * 0.01,
    }));
  }

  it('draws a single GeoJSON layer instead of one marker per point once past the threshold', () => {
    const { container } = render(
      <ClioScientificMapView onSelect={vi.fn()} points={manyPoints(151)} />,
    );

    // No per-point DOM marker buttons — the whole point set is one layer.
    expect(container.querySelectorAll('button[aria-label^="Select "]')).toHaveLength(0);
    const layer = container.querySelector('[data-testid="map-points-layer"]');
    expect(layer).not.toBeNull();
    expect(layer).toHaveAttribute('data-layer-id', 'clio-map-points-circles');
    expect(capturedMapProps.current?.interactiveLayerIds).toEqual(['clio-map-points-circles']);
  });

  it('still renders one marker per point below the threshold', () => {
    const { container } = render(
      <ClioScientificMapView onSelect={vi.fn()} points={manyPoints(5)} />,
    );

    expect(container.querySelectorAll('button[aria-label^="Select "]')).toHaveLength(5);
    expect(container.querySelector('[data-testid="map-points-layer"]')).toBeNull();
  });

  it('selects the clicked feature through the layer click handler', () => {
    const onSelect = vi.fn();
    render(<ClioScientificMapView onSelect={onSelect} points={manyPoints(151)} />);

    const onClick = capturedMapProps.current?.onClick as
      | ((event: { originalEvent: { shiftKey: boolean }; features?: Array<{ properties?: { id?: string } }> }) => void)
      | undefined;
    onClick?.({ features: [{ properties: { id: 'p42' } }], originalEvent: { shiftKey: false } });

    expect(onSelect).toHaveBeenCalledWith('p42');
  });

  it('ignores a layer click that is really a shift+drag zone release', () => {
    const onSelect = vi.fn();
    render(<ClioScientificMapView onSelect={onSelect} points={manyPoints(151)} />);

    const onClick = capturedMapProps.current?.onClick as
      | ((event: { originalEvent: { shiftKey: boolean }; features?: Array<{ properties?: { id?: string } }> }) => void)
      | undefined;
    onClick?.({ features: [{ properties: { id: 'p42' } }], originalEvent: { shiftKey: true } });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('highlights every id a bound zone selection names, not just one', () => {
    const points = manyPoints(151);
    render(
      <ClioScientificMapView
        highlightedIds={new Set(['p1', 'p2', 'p3'])}
        onSelect={vi.fn()}
        points={points}
      />,
    );
    const geojson = capturedSourceData.current as {
      features: Array<{ properties: { highlighted: boolean; id: string } }>;
    };
    const highlighted = geojson.features.filter((feature) => feature.properties.highlighted);
    expect(highlighted.map((feature) => feature.properties.id).sort()).toEqual(['p1', 'p2', 'p3']);
  });
});
