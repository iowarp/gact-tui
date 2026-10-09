import { useEffect } from 'react';
import type { MapLibreMap } from 'maplibre-gl';
import { z } from 'zod';

export const mapCameraSchema = z
  .object({
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-85).max(85),
    zoom: z.number().finite().min(1).max(16),
    bearing: z.number().finite().min(-180).max(180).optional(),
    pitch: z.number().finite().min(0).max(60).optional(),
  })
  .strict();
export type MapCamera = z.infer<typeof mapCameraSchema>;
export interface MapCameraProps {
  camera?: unknown;
  setCamera?: (camera: MapCamera) => void;
}

/** A producer binding and human navigation operate the same real MapLibre camera. */
export function useMapCamera(
  map: MapLibreMap | undefined,
  camera: unknown,
  setCamera: MapCameraProps['setCamera'],
): void {
  useEffect(() => {
    if (!map || !setCamera) return;
    const changed = () => {
      const center = map.getCenter();
      setCamera({
        longitude: center.lng,
        latitude: center.lat,
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
    };
    map.on('moveend', changed);
    return () => {
      map.off('moveend', changed);
    };
  }, [map, setCamera]);
  const key = JSON.stringify(camera ?? null);
  useEffect(() => {
    const parsed = mapCameraSchema.safeParse(JSON.parse(key));
    if (!map || !parsed.success) return;
    const next = parsed.data;
    const apply = () => {
      const center = map.getCenter();
      if (
        Math.abs(center.lng - next.longitude) < 1e-7 &&
        Math.abs(center.lat - next.latitude) < 1e-7 &&
        Math.abs(map.getZoom() - next.zoom) < 1e-7 &&
        Math.abs(map.getBearing() - (next.bearing ?? 0)) < 1e-7 &&
        Math.abs(map.getPitch() - (next.pitch ?? 0)) < 1e-7
      )
        return;
      map.jumpTo({
        center: [next.longitude, next.latitude],
        zoom: next.zoom,
        bearing: next.bearing ?? 0,
        pitch: next.pitch ?? 0,
      });
    };
    if (map.loaded()) apply();
    else map.once('idle', apply);
    return () => {
      map.off('idle', apply);
    };
  }, [map, key]);
}
