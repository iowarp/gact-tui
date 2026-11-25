import * as maplibre from 'maplibre-gl';
import type { ArtifactTileRequest } from '@clio/core/v3';
import { artifactTileQuery } from '@clio/core/v3';

/**
 * Map tiles of registered grids come through the repository transport, so the
 * connection's bearer travels with them to a local or remote CLIO alike and
 * Desktop's native transport serves them too. MapLibre asks for
 * `clio-tile://<artifact>/<z>/<x>/<y>?<query>`; the handler reads the bytes.
 */
export const CLIO_TILE_PROTOCOL = 'clio-tile';

type TileReader = (
  artifactId: string,
  request: ArtifactTileRequest,
  signal: AbortSignal,
) => Promise<Uint8Array>;

let reader: TileReader | undefined;
let registered = false;

/** Install the protocol once; the latest repository's reader serves every map. */
export function installClioTileReader(read: TileReader): void {
  reader = read;
  if (registered) return;
  registered = true;
  maplibre.addProtocol(CLIO_TILE_PROTOCOL, async (params, abortController) => {
    const url = new URL(params.url.replace(`${CLIO_TILE_PROTOCOL}://`, 'http://tile/'));
    const [artifactId, z, x, y] = url.pathname.replace(/^\//u, '').split('/');
    const query = url.searchParams;
    const select = query.get('select');
    const request: ArtifactTileRequest = {
      z: Number(z),
      x: Number(x),
      y: Number(y),
      variable: query.get('variable') ?? undefined,
      select: select ? (JSON.parse(select) as Record<string, string | number>) : undefined,
      colormap: query.get('colormap') ?? undefined,
      vmin: query.has('vmin') ? Number(query.get('vmin')) : undefined,
      vmax: query.has('vmax') ? Number(query.get('vmax')) : undefined,
      opacity: query.has('opacity') ? Number(query.get('opacity')) : undefined,
    };
    if (!reader || !artifactId) throw new Error('No tile reader is installed.');
    const bytes = await reader(artifactId, request, abortController.signal);
    return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  });
}

/** The tile URL template for one grid layer at one time. */
export function tileTemplate(
  artifactId: string,
  request: Omit<ArtifactTileRequest, 'z' | 'x' | 'y'>,
): string {
  const query = artifactTileQuery({ ...request, z: 0, x: 0, y: 0 });
  return `${CLIO_TILE_PROTOCOL}://${artifactId}/{z}/{x}/{y}${query ? `?${query}` : ''}`;
}
