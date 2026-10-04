import { z } from 'zod';
import { A2uiRepository } from './a2ui-repository.js';
import {
  connectedSourceStateSchema,
  sourceProviderSchema,
  sourceEntrySchema,
  sourceOperationSchema,
  sourceReviewSchema,
  type CreateSourceInput,
} from './connected-storage-contract.js';
import { workspaceResourceSchema } from './composer-schemas.js';

const root = (workspaceId: string) => `/v1/workspaces/${encodeURIComponent(workspaceId)}/sources`;
const sourcePath = (workspaceId: string, sourceId: string) =>
  `${root(workspaceId)}/${encodeURIComponent(sourceId)}`;

/** Trusted setup and approved data on the connected CLIO, never the desktop implicitly. */
export class ConnectedStorageRepository extends A2uiRepository {
  public publishUploadedSource(
    workspaceId: string,
    label: string,
    files: { path: string; resource_id: string; revision: number }[],
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${root(workspaceId)}/from-uploads`,
      body: { label, files },
      signal,
      decode: (value) => connectedSourceStateSchema.parse(value),
    });
  }
  public storageProviders(signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: '/v1/storage/providers',
      signal,
      decode: (value) =>
        z
          .object({
            clio_id: z.string(),
            host_id: z.string(),
            providers: z.array(sourceProviderSchema),
          })
          .parse(value),
    });
  }
  public async connectedSources(workspaceId: string, signal?: AbortSignal) {
    const result = await this.transport.request({
      method: 'GET',
      path: root(workspaceId),
      signal,
      decode: (value) => z.object({ sources: z.array(connectedSourceStateSchema) }).parse(value),
    });
    return result.sources;
  }
  public createConnectedSource(workspaceId: string, input: CreateSourceInput) {
    return this.transport.request({
      method: 'POST',
      path: root(workspaceId),
      body: input,
      decode: (value) => connectedSourceStateSchema.parse(value),
    });
  }
  public browseConnectedSource(
    workspaceId: string,
    sourceId: string,
    input: { folder: string; query: string; offset?: number; materialized?: boolean },
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/browse`,
      body: input,
      signal,
      decode: (value) =>
        z
          .object({
            source_id: z.string(),
            entries: z.array(sourceEntrySchema),
            next_offset: z.number().nullable(),
          })
          .parse(value),
    });
  }
  public startSourceSignIn(workspaceId: string, sourceId: string) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/auth/start`,
      decode: (value) =>
        z.object({ flow_id: z.string(), authorization_url: z.string() }).parse(value),
    });
  }
  public completeSourceSignIn(
    workspaceId: string,
    sourceId: string,
    flowId: string,
    callbackUrl: string,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/auth/complete`,
      body: { flow_id: flowId, callback_url: callbackUrl },
      decode: (value) =>
        z.object({ authenticated: z.boolean(), source_id: z.string() }).parse(value),
    });
  }
  public transferConnectedSource(workspaceId: string, sourceId: string) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/transfer`,
      decode: (value) => sourceOperationSchema.parse(value),
    });
  }
  public async sourceOperations(workspaceId: string, sourceId: string, signal?: AbortSignal) {
    const result = await this.transport.request({
      method: 'GET',
      path: `${sourcePath(workspaceId, sourceId)}/operations`,
      signal,
      decode: (value) => z.object({ operations: z.array(sourceOperationSchema) }).parse(value),
    });
    return result.operations;
  }
  public cancelSourceOperation(workspaceId: string, sourceId: string, operationId: string) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/operations/${encodeURIComponent(operationId)}/cancel`,
      decode: (value) => sourceOperationSchema.parse(value),
    });
  }
  public reviewSourceChanges(workspaceId: string, sourceId: string) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/review`,
      decode: (value) => sourceReviewSchema.parse(value),
    });
  }
  public applySourceChanges(
    workspaceId: string,
    sourceId: string,
    reviewId: string,
    paths: string[],
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/apply`,
      body: { review_id: reviewId, paths },
      decode: (value) => z.object({ operation_id: z.string() }).parse(value),
    });
  }
  public sourceLifecycle(
    workspaceId: string,
    sourceId: string,
    action: 'disconnect' | 'reconnect' | 'remove-copy',
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/${action}`,
      decode: (value) => connectedSourceStateSchema.parse(value),
    });
  }
  public attachSourceFile(workspaceId: string, sourceId: string, path: string) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/reference`,
      body: { path },
      decode: (value) => workspaceResourceSchema.parse(value),
    });
  }
}
