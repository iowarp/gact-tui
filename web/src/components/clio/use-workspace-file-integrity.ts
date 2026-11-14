import { TransportError } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { keepEqualBytes } from '@/lib/keep-equal-bytes';
import { queryKeys } from '@/lib/query-keys';
import { VIEWER_BYTES_GC_TIME_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Re-wrapped into a plain ArrayBuffer-backed copy: bytes returned through the
  // repository types as Uint8Array<ArrayBufferLike>, which SubtleCrypto's
  // stricter BufferSource typing (TS lib.dom) does not accept directly.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type IntegrityStatus = 'loading' | 'unchanged' | 'changed' | 'missing' | 'unknown';

/**
 * Compares a `workspace_file` block's recorded hash against the live file. The bytes
 * are read under the viewer's own key, so the preview below reuses them instead of
 * fetching the same file a second time.
 */
export function useWorkspaceFileIntegrity({
  workspaceId,
  path,
  expectedSha256,
}: {
  workspaceId: string;
  path: string;
  expectedSha256?: string;
}): { status: IntegrityStatus; bytes?: Uint8Array } {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const content = useQuery({
    queryKey: queryKeys.workspaceFileBytes(settings.endpoint, workspaceId, path),
    queryFn: ({ signal }) => repository.readWorkspaceFileBytes(workspaceId, path, signal),
    enabled: Boolean(workspaceId && path),
    gcTime: VIEWER_BYTES_GC_TIME_MS,
    structuralSharing: keepEqualBytes,
    retry: (failureCount, error) =>
      !(error instanceof TransportError && error.status === 404) && failureCount < 2,
  });
  const bytes = content.data;
  const digest = useQuery({
    queryKey: queryKeys.key(
      'workspace-file-integrity',
      settings.endpoint,
      workspaceId,
      path,
      content.dataUpdatedAt,
    ),
    queryFn: () => sha256Hex(bytes!),
    enabled: Boolean(bytes && expectedSha256),
    staleTime: Infinity,
  });
  if (content.isPending) return { status: 'loading' };
  if (content.error) {
    return {
      status:
        content.error instanceof TransportError && content.error.status === 404
          ? 'missing'
          : 'unknown',
    };
  }
  if (!expectedSha256) return { status: 'unknown', bytes };
  if (!digest.data) return { status: 'loading', bytes };
  return { status: digest.data === expectedSha256 ? 'unchanged' : 'changed', bytes };
}
