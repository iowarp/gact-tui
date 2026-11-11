import { z } from 'zod';
import { readBytesPath } from './artifact-custody.js';
import { BrowserRepository } from './browser-repository.js';
import type { WorkspaceFileListing, WorkspaceFileRange } from './domain.js';
import { workspaceFileListSchema } from './repository-decoders.js';

/** Workspace file listing and reads: whole text, whole bytes, or one byte range. */
export class WorkspaceFileRepository extends BrowserRepository {
  public async workspaceFiles(
    workspaceId: string,
    signal?: AbortSignal,
    options?: {
      includeHidden?: boolean;
      excludeServiceStorage?: boolean;
      directory?: string;
      offset?: number;
    },
  ): Promise<WorkspaceFileListing> {
    // Files can hide all dot paths; reference pickers exclude only service storage
    // so ordinary files such as .gitignore and .github/workflows remain available.
    const includeHidden = options?.includeHidden ?? true;
    const excludeServiceStorage = options?.excludeServiceStorage ?? false;
    const query = new URLSearchParams({
      include_hidden: String(includeHidden),
      exclude_service_storage: String(excludeServiceStorage),
    });
    if (options?.directory !== undefined) {
      query.set('directory', options.directory);
      query.set('offset', String(options.offset ?? 0));
    }
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/files?${query.toString()}`,
      decode: (value) => workspaceFileListSchema.parse(value),
      signal,
    });
    return result as WorkspaceFileListing;
  }

  public readWorkspaceFile(
    workspaceId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/files/read?path=${encodeURIComponent(path)}`,
      responseType: 'text',
      decode: (value) => z.string().parse(value),
      signal,
    });
  }

  public readWorkspaceFileBytes(
    workspaceId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return readBytesPath(
      this.transport,
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/files/read?path=${encodeURIComponent(path)}`,
      signal,
    );
  }

  /**
   * One byte range of a workspace file (an RFC 9110 `Range` read): `start`..`end`
   * inclusive, or the last `suffix` bytes. A service that ignores `Range` answers
   * with the whole file, so callers bound what they keep.
   */
  public readWorkspaceFileRange(
    workspaceId: string,
    path: string,
    range: WorkspaceFileRange,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/files/read?path=${encodeURIComponent(path)}`,
      headers: {
        Range: 'suffix' in range ? `bytes=-${range.suffix}` : `bytes=${range.start}-${range.end}`,
      },
      responseType: 'bytes',
      decode: (value) => {
        if (!(value instanceof Uint8Array)) throw new TypeError('Expected a binary response');
        return value;
      },
      signal,
    });
  }
}
