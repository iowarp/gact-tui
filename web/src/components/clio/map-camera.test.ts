import { renderHook } from '@testing-library/react';
import type { MapLibreMap } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import { mapCameraSchema, useMapCamera } from './map-camera';

function mapFixture(loaded = true) {
  const handlers = new Map<string, () => void>();
  const map = {
    on: vi.fn((name: string, callback: () => void) => handlers.set(name, callback)),
    once: vi.fn((name: string, callback: () => void) => handlers.set(name, callback)),
    off: vi.fn(),
    loaded: () => loaded,
    getCenter: () => ({ lng: -90, lat: 40 }),
    getZoom: () => 4,
    getBearing: () => 10,
    getPitch: () => 5,
    jumpTo: vi.fn(),
  };
  return { map, handlers, instance: map as unknown as MapLibreMap };
}

describe('shared real map camera binding', () => {
  it('moves the renderer when the producer changes a bound camera', () => {
    const fixture = mapFixture();
    renderHook(() =>
      useMapCamera(
        fixture.instance,
        { longitude: -87.6, latitude: 41.8, zoom: 7, bearing: 25, pitch: 30 },
        undefined,
      ),
    );
    expect(fixture.map.jumpTo).toHaveBeenCalledWith({
      center: [-87.6, 41.8],
      zoom: 7,
      bearing: 25,
      pitch: 30,
    });
  });
  it('waits for the real map to load, and removes the pending callback on unmount', () => {
    const fixture = mapFixture(false);
    const { unmount } = renderHook(() =>
      useMapCamera(fixture.instance, { longitude: 0, latitude: 0, zoom: 3 }, undefined),
    );
    expect(fixture.map.jumpTo).not.toHaveBeenCalled();
    fixture.handlers.get('idle')!();
    expect(fixture.map.jumpTo).toHaveBeenCalledWith({
      center: [0, 0],
      zoom: 3,
      bearing: 0,
      pitch: 0,
    });
    unmount();
    expect(fixture.map.off).toHaveBeenCalledWith('idle', expect.any(Function));
  });
  it('writes human navigation back to the same shared data-model binding', () => {
    const fixture = mapFixture();
    const write = vi.fn();
    renderHook(() => useMapCamera(fixture.instance, undefined, write));
    fixture.handlers.get('moveend')!();
    expect(write).toHaveBeenCalledWith({
      longitude: -90,
      latitude: 40,
      zoom: 4,
      bearing: 10,
      pitch: 5,
    });
  });
  it('rejects invalid cameras and avoids a producer/human feedback loop', () => {
    const fixture = mapFixture();
    renderHook(() =>
      useMapCamera(
        fixture.instance,
        { longitude: -90, latitude: 40, zoom: 4, bearing: 10, pitch: 5 },
        undefined,
      ),
    );
    expect(fixture.map.jumpTo).not.toHaveBeenCalled();
    for (const invalid of [
      { longitude: 181, latitude: 0, zoom: 3 },
      { longitude: 0, latitude: 0, zoom: 3, pitch: 90 },
      { longitude: 0, latitude: 0, zoom: Infinity },
    ]) {
      expect(mapCameraSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
