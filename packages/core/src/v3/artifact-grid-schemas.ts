import { z } from 'zod';

/**
 * Wire shapes of the gridded-artifact routes (clio-agent
 * `gact/routes/artifact_grid_views.py`): grid facts for a map layer's legend
 * and time axis, and a bounded section sample. Tiles are PNG bytes.
 */
export const artifactGridInfoSchema = z.object({
  variable: z.string(),
  variables: z.array(z.string()),
  units: z.string(),
  longName: z.string(),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  shape: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  leading: z.array(
    z.object({
      dim: z.string(),
      count: z.number().int().nonnegative(),
      values: z.array(z.union([z.string(), z.number()])),
      truncated: z.boolean(),
    }),
  ),
  range: z.tuple([z.number(), z.number()]),
  colormaps: z.array(z.string()),
});
export type ArtifactGridInfo = z.infer<typeof artifactGridInfoSchema>;

export const artifactSectionSampleSchema = z.object({
  variable: z.string(),
  variables: z.array(z.string()),
  units: z.string(),
  vertical: z.string(),
  verticalUnits: z.string(),
  positiveDown: z.boolean(),
  distance: z.array(z.number()),
  levels: z.array(z.number()),
  values: z.array(z.array(z.number().nullable())),
  min: z.number().nullable(),
  max: z.number().nullable(),
  stations: z.array(z.object({ distance: z.number(), profile: z.string().nullable() })),
  path: z.string(),
  latitude: z.array(z.number()),
  longitude: z.array(z.number()),
});
export type ArtifactSectionSample = z.infer<typeof artifactSectionSampleSchema>;

export interface ArtifactTileRequest {
  z: number;
  x: number;
  y: number;
  variable?: string;
  /** Leading-dimension values to draw (nearest), e.g. `{ time: '2022-07-01' }`. */
  select?: Record<string, string | number>;
  colormap?: string;
  vmin?: number;
  vmax?: number;
  opacity?: number;
}

/** The query string of a tile request, in a stable order so equal tiles cache alike. */
export function artifactTileQuery(request: ArtifactTileRequest): string {
  const query = new URLSearchParams();
  if (request.variable) query.set('variable', request.variable);
  if (request.select && Object.keys(request.select).length)
    query.set('select', JSON.stringify(request.select, Object.keys(request.select).sort()));
  if (request.colormap) query.set('colormap', request.colormap);
  if (request.vmin !== undefined) query.set('vmin', String(request.vmin));
  if (request.vmax !== undefined) query.set('vmax', String(request.vmax));
  if (request.opacity !== undefined) query.set('opacity', String(request.opacity));
  return query.toString();
}
