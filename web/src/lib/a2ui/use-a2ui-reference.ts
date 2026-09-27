import { TransportError, type A2uiReferenceResolution } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useObjectUrl } from '@/hooks/use-object-url';
import { queryKeys } from '@/lib/query-keys';
import { IMMUTABLE_QUERY } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  describeReferenceError,
  referenceFailure,
  type A2uiReferenceFailure,
} from './reference-failure';
import { useA2uiReferenceSession } from './reference-session';

export interface A2uiReferenceState {
  /** What the service says the reference names (name, media type, size, ids). */
  resolution?: A2uiReferenceResolution;
  /** A `blob:` URL for the bytes, revoked on unmount or when the bytes change. */
  objectUrl?: string;
  /** Still resolving or reading. */
  pending: boolean;
  /** The typed reason it cannot be shown, when it cannot. */
  failure?: A2uiReferenceFailure;
}

export interface UseA2uiReferenceOptions {
  /** Read the bytes too (a card may only need the metadata). Default true. */
  readBytes?: boolean;
  /** Resolve at all (e.g. only once a guard passed). Default true. */
  enabled?: boolean;
}

/** Retries only a transient network failure once; a typed service answer is final. */
function retryTransient(failureCount: number, error: unknown): boolean {
  return error instanceof TransportError && error.status === undefined && failureCount < 1;
}

/**
 * The ONE authenticated resolver for CLIO references on an A2UI surface.
 *
 * Resolves `uri` through the service (the service owns the grammar), reads the
 * bytes through the repository transport, which carries the connection's
 * bearer to a local or remote CLIO alike, and exposes them as a `blob:` URL.
 * Every failure comes back as a typed, plain reason, never a broken element.
 */
export function useA2uiReference(
  uri: string,
  { readBytes = true, enabled = true }: UseA2uiReferenceOptions = {},
): A2uiReferenceState {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sessionId = useA2uiReferenceSession();
  const resolution = useQuery({
    queryKey: queryKeys.key('a2ui-reference', settings.endpoint, sessionId, uri),
    queryFn: ({ signal }) => repository.resolveA2uiReference(sessionId!, uri, signal),
    enabled: enabled && Boolean(sessionId),
    retry: retryTransient,
  });
  const resolved = resolution.data;
  const bytes = useQuery({
    queryKey: queryKeys.key(
      'a2ui-reference-bytes',
      settings.endpoint,
      resolved?.kind,
      resolved?.fetch_path,
    ),
    queryFn: ({ signal }) => repository.readA2uiReferenceBytes(resolved!, signal),
    enabled: enabled && readBytes && Boolean(resolved),
    retry: retryTransient,
    ...IMMUTABLE_QUERY,
  });
  const objectUrl = useObjectUrl(bytes.data, resolved?.media_type || 'application/octet-stream');

  if (!enabled) return { pending: false };
  if (!sessionId) return { pending: false, failure: referenceFailure('session_unavailable') };
  const error = resolution.error ?? bytes.error;
  if (error)
    return { resolution: resolved, pending: false, failure: describeReferenceError(error) };
  const pending = resolution.isPending || (readBytes && (bytes.isPending || !objectUrl));
  return { resolution: resolved, objectUrl, pending };
}
