import type { WorkspaceFileRange } from '@clio/core/v3';

type ReadText = (workspaceId: string, path: string, signal?: AbortSignal) => Promise<string>;

/**
 * A `readWorkspaceFileRange` double backed by a test's `readWorkspaceFile`
 * mock, answering ranges the way an RFC 9110 file response does.
 */
export function rangeReadsFromText(readText: ReadText) {
  return async (
    workspaceId: string,
    path: string,
    range: WorkspaceFileRange,
    signal?: AbortSignal,
  ): Promise<Uint8Array> => {
    const bytes = new TextEncoder().encode(await readText(workspaceId, path, signal));
    if ('suffix' in range) return bytes.slice(Math.max(0, bytes.length - range.suffix));
    return bytes.slice(range.start, range.end + 1);
  };
}
