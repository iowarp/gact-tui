/** Reports the map a view shows, including a map returned from the reuse pool. */
import type { MapLibreMap } from 'maplibre-gl';
import { useEffect } from 'react';
import { useMap } from 'react-map-gl/maplibre';

/** Get the map instance from the provider, including maps returned from the reuse pool. */
export function MapInstanceReporter({
  onMapInstance,
}: {
  onMapInstance: (map: MapLibreMap) => void;
}) {
  const mapRef = useMap().current;
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    // `onLoad` only fires for a newly created map. A pooled map may already be
    // loaded when the new React view attaches, so report it from the provider.
    map.boxZoom.disable();
    onMapInstance(map);
  }, [mapRef, onMapInstance]);
  return null;
}
