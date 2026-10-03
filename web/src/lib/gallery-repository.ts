import gallerySampleUrl from '../../tests/fixtures/gallery-sample.png';
import type { ArtifactRasterQueryRequest, ArtifactRasterQueryResult, ArtifactTableQueryRequest, ArtifactTableQueryResult } from '@clio/core/v3';
import type { createRepository } from '@/lib/connection';
import { galleryStormTracks } from './gallery-storm-tracks';
import galleryHurricaneTracks from './gallery-hurricane-tracks.json';

type Repository = ReturnType<typeof createRepository>;
const BOUNDS = [0, 0, 100, 100] as const;
const galleryAsset = (name: string) => `${import.meta.env.BASE_URL}${name}`;

function rasterSample(query: ArtifactRasterQueryRequest): ArtifactRasterQueryResult {
  const width = Math.min(768, Math.max(1, Math.floor(query.width)));
  const height = Math.min(768, Math.max(1, Math.floor(query.height)));
  const extent = query.extent ?? BOUNDS;
  const values = Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const gx = extent[0] + ((x + 0.5) / width) * (extent[2] - extent[0]);
    const gy = extent[1] + ((y + 0.5) / height) * (extent[3] - extent[1]);
    const hot = Math.exp(-(((gx - 32) ** 2 + (gy - 38) ** 2) / 180));
    const cool = Math.exp(-(((gx - 70) ** 2 + (gy - 64) ** 2) / 220));
    return Math.round((16 + 18 * hot - 9 * cool + gx * 0.04) * 100) / 100;
  });
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return {
    width, height, extent: [...extent], sourceBounds: [...BOUNDS], sourceShape: [100, 100],
    xLabel: 'Easting', yLabel: 'Northing', values,
    min, max,
  };
}

/** Static gallery data for artifact-backed examples, without an agent service. */
export function createGalleryRepository(base: Repository): Repository {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property === 'artifactTableQuery') {
        return (artifactId: string, query: ArtifactTableQueryRequest, signal?: AbortSignal): Promise<ArtifactTableQueryResult> => {
          if (artifactId !== 'artifact_gallery_storm_tracks' && artifactId !== 'artifact_gallery_hurricane_tracks') return target.artifactTableQuery(artifactId, query, signal);
          const rows = artifactId === 'artifact_gallery_hurricane_tracks' ? galleryHurricaneTracks : galleryStormTracks;
          const filtered = rows.filter((row) => (query.filter ?? []).every((filter) => {
            const value = (row as Record<string, string | number>)[filter.column];
            if (filter.op === 'contains') return String(value ?? '').toLowerCase().includes(filter.value.toLowerCase());
            if (filter.op === 'eq') return value === filter.value;
            if (filter.op === 'in') return filter.value.includes(value);
            if (filter.op === 'isnull') return (value == null) === (filter.value ?? true);
            if (filter.op === 'range') {
              const comparable = typeof value === 'string' ? value : Number(value);
              const low = filter.value[0] == null ? null : typeof comparable === 'string' ? String(filter.value[0]) : Number(filter.value[0]);
              const high = filter.value[1] == null ? null : typeof comparable === 'string' ? String(filter.value[1]) : Number(filter.value[1]);
              return (low == null || comparable >= low) && (high == null || comparable <= high);
            }
            return true;
          }));
          const sorted = [...filtered];
          for (const sort of [...(query.sort ?? [])].reverse()) {
            sorted.sort((a, b) => {
              const left = (a as Record<string, string | number>)[sort.column];
              const right = (b as Record<string, string | number>)[sort.column];
              const result = typeof left === 'number' && typeof right === 'number'
                ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
              return sort.desc ? -result : result;
            });
          }
          const offset = query.offset ?? 0;
          const page = sorted.slice(offset, offset + query.limit);
          const names = query.columns ?? Object.keys(rows[0]!);
          const columns = Object.fromEntries(names.map((name) => [name, page.map((row) => (row as Record<string, string | number>)[name] ?? null)]));
          return Promise.resolve({
            artifact_id: artifactId,
            schema: Object.keys(rows[0]!).map((name) => ({
              name,
              type: ['lat', 'lon', 'wind_kt', 'elapsed_hours', 'year'].includes(name) ? 'double' : name === 'time' ? 'timestamp[s, tz=UTC]' : 'string',
            })),
            columns, totalRows: rows.length, matchedRows: filtered.length,
            returnedRows: page.length, truncated: page.length < filtered.length,
            downsample: { mode: 'none' }, rowKey: { column: '__row', values: page.map((row) => rows.indexOf(row)) },
          });
        };
      }
      if (property === 'artifactRasterQuery') {
        return (artifactId: string, query: ArtifactRasterQueryRequest) =>
          artifactId === 'artifact_raster_demo'
            ? Promise.resolve(rasterSample(query))
            : target.artifactRasterQuery(artifactId, query);
      }
      if (property === 'readArtifactBytes') {
        return async (artifactId: string, fetchPath?: string, signal?: AbortSignal) => {
          if (artifactId !== 'artifact_gallery_terrain_glb' && artifactId !== 'artifact_gallery_load_specimen_glb') {
            return target.readArtifactBytes(artifactId, fetchPath, signal);
          }
          const filename = artifactId === 'artifact_gallery_load_specimen_glb' ? 'load-specimen.glb' : 'surface.glb';
          const response = await fetch(galleryAsset(`gallery/${filename}`), { signal });
          if (!response.ok) throw new Error(`Gallery mesh unavailable (${response.status}).`);
          return new Uint8Array(await response.arrayBuffer());
        };
      }
      if (property === 'resolveA2uiReference') {
        return (sessionId: string, uri: string, signal?: AbortSignal) =>
          uri === 'artifact://artifact_plot'
            ? Promise.resolve({ uri, kind: 'artifact' as const, workspace_id: 'gallery',
              name: 'gallery-sample.png', media_type: 'image/png', size_bytes: 53953, artifact_id: 'artifact_plot',
              fetch_path: '/v1/artifacts/artifact_plot/bytes' })
            : target.resolveA2uiReference(sessionId, uri, signal);
      }
      if (property === 'readA2uiReferenceBytes') {
        return async (resolution: { artifact_id?: string }, signal?: AbortSignal) => {
          if (resolution.artifact_id !== 'artifact_plot') {
            return target.readA2uiReferenceBytes(resolution as Parameters<Repository['readA2uiReferenceBytes']>[0], signal);
          }
          const response = await fetch(gallerySampleUrl, { signal });
          if (!response.ok) throw new Error(`Gallery image unavailable (${response.status}).`);
          return new Uint8Array(await response.arrayBuffer());
        };
      }
      if (property === 'readArtifactBytesFor') {
        return async (artifact: Parameters<Repository['readArtifactBytesFor']>[0], signal?: AbortSignal) => {
          if (artifact.id !== 'artifact_plot') return target.readArtifactBytesFor(artifact, signal);
          const response = await fetch(gallerySampleUrl, { signal });
          if (!response.ok) throw new Error(`Gallery image unavailable (${response.status}).`);
          return new Uint8Array(await response.arrayBuffer());
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
