import { readBytesPath } from './artifact-custody.js';
import { WorkRepository } from './work-repository.js';

/** h5grove endpoints served under a workspace's `/h5grove/` data route. */
export type H5GroveEndpoint = 'meta' | 'attr' | 'data' | 'stats' | 'paths';

/**
 * Reads inside structured scientific files (HDF5 today) without downloading
 * them: the service opens the file and returns only the metadata or slice
 * asked for.
 */
export class StructuredFileRepository extends WorkRepository {
  /**
   * Call the workspace's h5grove data route. `params` are h5grove's query
   * parameters; `file` is the workspace-relative path.
   */
  public readWorkspaceHdf5(
    workspaceId: string,
    endpoint: H5GroveEndpoint,
    params: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const query = new URLSearchParams(params).toString();
    return readBytesPath(
      this.transport,
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/h5grove/${endpoint}?${query}`,
      signal,
    );
  }
}
