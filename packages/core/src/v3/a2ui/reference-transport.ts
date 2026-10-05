import type { ClioTransport } from '../transport.js';
import { readArtifactWithCustodyFallback, readBytesPath } from '../artifact-custody.js';
import { a2uiReferenceResolutionSchema, type A2uiReferenceResolution } from './references.js';

/** Resolve a reference through the session's authoritative service. */
export function resolveSessionReference(
  transport: ClioTransport,
  sessionId: string,
  uri: string,
  signal?: AbortSignal,
): Promise<A2uiReferenceResolution> {
  return transport.request({
    method: 'GET',
    path: `/v1/sessions/${encodeURIComponent(sessionId)}/references/resolve?${new URLSearchParams({ uri }).toString()}`,
    decode: (value) => a2uiReferenceResolutionSchema.parse(value),
    signal,
  });
}

/** Read owned reference bytes, following only the service-authorized custody fallback. */
export function readResolvedReferenceBytes(
  transport: ClioTransport,
  resolution: A2uiReferenceResolution,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const read = (path: string, requestSignal?: AbortSignal) =>
    readBytesPath(transport, path, requestSignal);
  return resolution.kind === 'artifact'
    ? readArtifactWithCustodyFallback(
        resolution.artifact_id ?? '',
        resolution.fetch_path,
        read,
        signal,
      )
    : read(resolution.fetch_path, signal);
}
