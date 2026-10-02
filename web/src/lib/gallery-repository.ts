import type { ArtifactRasterQueryRequest, ArtifactRasterQueryResult } from '@clio/core/v3';
import type { createRepository } from '@/lib/connection';

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
      if (property === 'artifactRasterQuery') {
        return (artifactId: string, query: ArtifactRasterQueryRequest) =>
          artifactId === 'artifact_raster_demo'
            ? Promise.resolve(rasterSample(query))
            : target.artifactRasterQuery(artifactId, query);
      }
      if (property === 'readArtifactBytes') {
        return async (artifactId: string, fetchPath?: string, signal?: AbortSignal) => {
          if (artifactId !== 'artifact_gallery_terrain_glb') {
            return target.readArtifactBytes(artifactId, fetchPath, signal);
          }
          const response = await fetch(galleryAsset('gallery/surface.glb'), { signal });
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
          const response = await fetch(galleryAsset('gallery-sample.png'), { signal });
          if (!response.ok) throw new Error(`Gallery image unavailable (${response.status}).`);
          return new Uint8Array(await response.arrayBuffer());
        };
      }
      if (property === 'readArtifactBytesFor') {
        return async (artifact: Parameters<Repository['readArtifactBytesFor']>[0], signal?: AbortSignal) => {
          if (artifact.id !== 'artifact_plot') return target.readArtifactBytesFor(artifact, signal);
          const response = await fetch(galleryAsset('gallery-sample.png'), { signal });
          if (!response.ok) throw new Error(`Gallery image unavailable (${response.status}).`);
          return new Uint8Array(await response.arrayBuffer());
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
