import { z } from 'zod';
import type { Artifact } from './domain.js';
import { TransportError, type ClioTransport } from './transport.js';

export function historicalArtifactWorkspacePath(artifact: Artifact): string | undefined {
  if (!artifact.workspace_id || !artifact.name) return undefined;
  return `/v1/workspaces/${encodeURIComponent(artifact.workspace_id)}/files/read?path=${encodeURIComponent(artifact.name)}`;
}

export function readTextPath(
  transport: ClioTransport,
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  return transport.request({
    method: 'GET',
    path,
    responseType: 'text',
    decode: (value) => z.string().parse(value),
    signal,
  });
}

export function readBytesPath(
  transport: ClioTransport,
  path: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return transport.request({
    method: 'GET',
    path,
    responseType: 'bytes',
    decode: (value) => {
      if (!(value instanceof Uint8Array)) throw new TypeError('Expected a binary response');
      return value;
    },
    signal,
  });
}

/** Follows only the server-authorized workspace route for a non-CAS artifact. */
export async function readArtifactWithCustodyFallback<T>(
  artifactId: string,
  fetchPath: string | undefined,
  readPath: (path: string, signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  historicalWorkspacePath?: string,
): Promise<T> {
  const requestPath = fetchPath || `/v1/artifacts/${encodeURIComponent(artifactId)}/bytes`;
  try {
    return await readPath(requestPath, signal);
  } catch (error) {
    if (error instanceof TransportError && error.code === 'not_found' && historicalWorkspacePath) {
      return readPath(historicalWorkspacePath, signal);
    }
    if (!(error instanceof TransportError) || error.code !== 'custody_not_cas') throw error;
    const details = error.details;
    if (!details || typeof details !== 'object') throw error;
    const fetchVia = (details as { fetch_via?: unknown }).fetch_via;
    if (typeof fetchVia !== 'string' || !fetchVia.startsWith('/v1/')) throw error;
    return readPath(fetchVia, signal);
  }
}
