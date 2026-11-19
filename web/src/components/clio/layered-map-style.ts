import { useQuery } from '@tanstack/react-query';
import type { ArtifactGridInfo } from '@clio/core/v3';
import type { MapLibreMap } from 'maplibre-gl';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { MapLayer } from './layered-map-model';
import { artifactIdFromDataUri } from './table-query-rows';

/** MapLibre ids each map layer owns, and the grid facts a grid layer reads. */
export const layerSourceId = (layer: MapLayer) => `clio-layer-${layer.id}`;
export const layerStyleIds = (layer: MapLayer) =>
  layer.kind === 'grid'
    ? [`${layerSourceId(layer)}-raster`]
    : layer.kind === 'shapes'
      ? [
          `${layerSourceId(layer)}-line`,
          `${layerSourceId(layer)}-circle`,
          `${layerSourceId(layer)}-fill`,
        ]
      : [`${layerSourceId(layer)}-line`, `${layerSourceId(layer)}-circle`];

export function removeLayer(map: MapLibreMap, layer: MapLayer): void {
  for (const id of layerStyleIds(layer)) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(layerSourceId(layer))) map.removeSource(layerSourceId(layer));
}

/** Grid facts (times, legend range) of a grid layer's artifact. */
export function useGridInfo(layer: MapLayer): { info?: ArtifactGridInfo; error?: string } {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const artifactId = layer.gridUri?.replace('artifact://', '');
  const fixed = layer.fixed;
  const query = useQuery({
    enabled: Boolean(artifactId),
    queryKey: queryKeys.key(
      'artifact-grid-info',
      settings.endpoint,
      artifactId,
      layer.variable,
      JSON.stringify(fixed ?? {}),
    ),
    queryFn: ({ signal }) =>
      repository.artifactGridInfo(artifactId!, layer.variable, fixed, signal),
  });
  return { info: query.data, error: query.error ? String(query.error) : undefined };
}

/** The artifact id a table layer reads, for keys. */
export const tableLayerArtifact = (layer: MapLayer) => artifactIdFromDataUri(layer.dataUri);
