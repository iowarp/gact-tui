import { ndpSearchSchema } from './ndp-contract.js';
import type { SshRoute } from './infrastructure-contract.js';
import { z } from 'zod';
import { A2uiRepository } from './a2ui-repository.js';
import {
  connectedSourceStateSchema,
  sourceProviderSchema,
  sourceEntrySchema,
  sourceOperationSchema,
  sourceReviewSchema,
  type CreateSourceInput,
  type SftpCredentials,
  globusDestinationStatusSchema,
  type GlobusDestination,
} from './connected-storage-contract.js';
import { workspaceResourceSchema } from './composer-schemas.js';
import {
  knowledgeSnapshotSchema,
  knowledgeGraphSnapshotSchema,
  knowledgeOpenSchema,
  knowledgeSyncSchema,
  obsidianStatusSchema,
} from './knowledge-contract.js';

const root = (workspaceId: string) => `/v1/workspaces/${encodeURIComponent(workspaceId)}/sources`;
const sourcePath = (workspaceId: string, sourceId: string) =>
  `${root(workspaceId)}/${encodeURIComponent(sourceId)}`;
const storageSignInSchema = z.object({
  flow_id: z.string(),
  authorization_url: z.string(),
  user_code: z.string().optional(),
  interval: z.number().positive().optional(),
  automatic_callback: z.boolean().optional(),
});

/** Trusted setup and approved data on the connected CLIO, never the desktop implicitly. */
export class ConnectedStorageRepository extends A2uiRepository {
  /** Account setup never attaches or grants access to workspace notes. */
  public obsidianStatus(signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: '/v1/storage/obsidian',
      signal,
      decode: (value) => obsidianStatusSchema.parse(value),
    });
  }
  public installObsidian() {
    return this.transport.request({
      method: 'POST',
      path: '/v1/storage/obsidian/install',
      decode: (value) => obsidianStatusSchema.parse(value),
    });
  }
  public signInObsidian(input: { email: string; password: string; mfa?: string }) {
    return this.transport.request({
      method: 'POST',
      path: '/v1/storage/obsidian/login',
      body: input,
      decode: (value) => obsidianStatusSchema.parse(value),
    });
  }
  public signOutObsidian() {
    return this.transport.request({
      method: 'POST',
      path: '/v1/storage/obsidian/logout',
      decode: (value) => obsidianStatusSchema.parse(value),
    });
  }
  public obsidianVaults(signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: '/v1/storage/obsidian/vaults',
      signal,
      decode: (value) =>
        z.object({ vaults: z.array(z.object({ id: z.string(), name: z.string() })) }).parse(value),
    });
  }
  public setupObsidianVault(vault_id: string, password?: string) {
    return this.transport.request({
      method: 'POST',
      path: '/v1/storage/obsidian/setup',
      body: { vault_id, password },
      decode: (value) => z.object({ root: z.string() }).parse(value),
    });
  }
  /** Full topology crosses file pages, while note bytes remain on demand. */
  public knowledgeGraph(
    workspaceId: string,
    sourceId: string,
    options: { query?: string; focus?: string; attachments?: boolean } = {},
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams(
      Object.entries(options).map(([key, value]) => [key, String(value)]),
    );
    return this.transport.request({
      method: 'GET',
      path: `${sourcePath(workspaceId, sourceId)}/knowledge/graph?${query}`,
      signal,
      decode: (value) => knowledgeGraphSnapshotSchema.parse(value),
    });
  }
  public knowledgeSnapshot(
    workspaceId: string,
    sourceId: string,
    options: { query?: string; focus?: string; offset?: number; limit?: number } = {},
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams(
      Object.entries(options).map(([key, value]) => [key, String(value)]),
    );
    return this.transport.request({
      method: 'GET',
      path: `${sourcePath(workspaceId, sourceId)}/knowledge?${query}`,
      signal,
      decode: (value) => knowledgeSnapshotSchema.parse(value),
    });
  }
  public knowledgeOpen(
    workspaceId: string,
    sourceId: string,
    path: string,
    revision = '',
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/knowledge/open`,
      body: { path, revision },
      signal,
      decode: (value) => knowledgeOpenSchema.parse(value),
    });
  }
  public knowledgeSync(workspaceId: string, sourceId: string, action?: 'start' | 'stop') {
    return this.transport.request({
      method: action ? 'POST' : 'GET',
      path: `${sourcePath(workspaceId, sourceId)}/knowledge/sync${action ? `/${action}` : ''}`,
      decode: (value) => knowledgeSyncSchema.parse(value),
    });
  }
  public githubRevisions(
    url: string,
    kind: 'branch' | 'tag' | 'commit',
    page = 1,
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: '/v1/storage/github/revisions',
      body: { url, kind, page },
      signal,
      decode: (value) =>
        z
          .object({
            repository: z.string(),
            default_branch: z.string(),
            revisions: z.array(z.object({ value: z.string(), label: z.string(), sha: z.string() })),
            next_page: z.number().nullable(),
          })
          .parse(value),
    });
  }
  public inspectSourceSsh(
    input: {
      target_id?: string;
      route?: Partial<SshRoute>;
      path?: string;
      credentials?: SftpCredentials;
    },
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: '/v1/storage/ssh/inspect',
      body: input,
      signal,
      decode: (value) =>
        z
          .object({
            path: z.string(),
            parent: z.string(),
            entries: z.array(z.object({ name: z.string(), path: z.string() })),
            truncated: z.boolean(),
          })
          .parse(value),
    });
  }
  public signInSftpSource(workspaceId: string, sourceId: string, credentials: SftpCredentials) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/auth/sftp`,
      body: credentials,
      decode: (value) => connectedSourceStateSchema.parse(value),
    });
  }
  public globusDestination(signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: '/v1/storage/globus-destination',
      signal,
      decode: (value) => globusDestinationStatusSchema.parse(value),
    });
  }
  public saveGlobusDestination(input: GlobusDestination) {
    return this.transport.request({
      method: 'PUT',
      path: '/v1/storage/globus-destination',
      body: input,
      decode: (value) => globusDestinationStatusSchema.parse(value),
    });
  }
  public updateConnectedSource(workspaceId: string, sourceId: string, input: CreateSourceInput) {
    return this.transport.request({
      method: 'PATCH',
      path: sourcePath(workspaceId, sourceId),
      body: input,
      decode: (value) => connectedSourceStateSchema.parse(value),
    });
  }
  public removeConnectedSource(workspaceId: string, sourceId: string) {
    return this.transport.request({
      method: 'DELETE',
      path: sourcePath(workspaceId, sourceId),
      decode: (value) => z.object({ removed: z.boolean() }).parse(value),
    });
  }
  public publishUploadedSource(
    workspaceId: string,
    label: string,
    files: { path: string; resource_id: string; revision: number }[],
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${root(workspaceId)}/from-uploads`,
      body: { label, files, draft: true },
      signal,
      decode: (value) => connectedSourceStateSchema.parse(value),
    });
  }
  public searchNdp(
    input: { query: string; only_groups?: boolean; endpoint_id?: string },
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: '/v1/storage/ndp/search',
      body: input,
      signal,
      decode: (value) => ndpSearchSchema.parse(value),
    });
  }
  public attachNdp(
    workspaceId: string,
    input: { endpoint_id: string; dataset_id: string; resource_ids: string[] },
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${root(workspaceId)}/ndp`,
      body: input,
      decode: (value) => connectedSourceStateSchema.parse(value),
    });
  }
  public cancelStorageAccountSignIn(provider: string, flowId: string) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/storage/accounts/${encodeURIComponent(provider)}/auth/cancel`,
      body: { flow_id: flowId },
      decode: (value) => z.object({ cancelled: z.boolean() }).parse(value),
    });
  }
  public cancelSourceSignIn(workspaceId: string, sourceId: string, flowId: string) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/auth/cancel`,
      body: { flow_id: flowId },
      decode: (value) => z.object({ cancelled: z.boolean() }).parse(value),
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
  public signOutStorageAccount(provider: string) {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/storage/accounts/${encodeURIComponent(provider)}`,
      decode: (value) => z.object({ signed_out: z.boolean() }).parse(value),
    });
  }
  public startStorageAccountSignIn(provider: string, desktopRedirect?: string) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/storage/accounts/${encodeURIComponent(provider)}/auth/start`,
      body: desktopRedirect ? { desktop_redirect: desktopRedirect } : {},
      decode: (value) => storageSignInSchema.parse(value),
    });
  }
  public completeStorageAccountSignIn(provider: string, flowId: string, callbackUrl: string) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/storage/accounts/${encodeURIComponent(provider)}/auth/complete`,
      body: { flow_id: flowId, callback_url: callbackUrl },
      decode: (value) => z.object({ authenticated: z.boolean() }).parse(value),
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
  public startSourceSignIn(workspaceId: string, sourceId: string, desktopRedirect?: string) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/auth/start`,
      body: desktopRedirect ? { desktop_redirect: desktopRedirect } : undefined,
      decode: (value) => storageSignInSchema.parse(value),
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
  public beginSourceDraft(workspaceId: string, sourceId: string) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/draft`,
      decode: (value) => z.object({ id: z.string() }).parse(value),
    });
  }
  public finishSourceDraft(workspaceId: string, sourceId: string, draftId: string, keep = false) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/draft/${encodeURIComponent(draftId)}/${keep ? 'keep' : 'discard'}`,
      decode: (value) => z.object({ finished: z.boolean() }).parse(value),
    });
  }
  public linkConnectedSource(
    workspaceId: string,
    sourceId: string,
    unlink = false,
    draftId?: string,
    mapping?: { access: 'read_only' | 'publish_later' | 'write_through'; confirm_remote?: boolean },
    sessionId?: string,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/${unlink ? 'unlink' : 'link'}`,
      body:
        draftId || mapping || sessionId
          ? { draft_id: draftId, ...mapping, ...(sessionId ? { session_id: sessionId } : {}) }
          : undefined,
      decode: (value) => connectedSourceStateSchema.parse(value),
    });
  }
  public transferConnectedSource(
    workspaceId: string,
    sourceId: string,
    paths?: string[],
    draftId?: string,
    access?: 'read_only' | 'editable',
    sessionId?: string,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/transfer`,
      body:
        paths || draftId || access || sessionId
          ? {
              access,
              ...(paths ? { paths } : {}),
              ...(draftId ? { draft_id: draftId } : {}),
              ...(sessionId ? { session_id: sessionId } : {}),
            }
          : undefined,
      decode: (value) => sourceOperationSchema.parse(value),
    });
  }
  public sourceMappingOptions(workspaceId: string, sourceId: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: `${sourcePath(workspaceId, sourceId)}/mapping-options`,
      signal,
      decode: (value) =>
        z
          .object({
            link_access: z.array(z.enum(['read_only', 'publish_later', 'write_through'])),
            reason: z.string(),
            write_permission: z.boolean().nullable(),
          })
          .parse(value),
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
    action: 'disconnect' | 'reconnect' | 'remove-copy' | 'discard-edits',
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/${action}`,
      decode: (value) => connectedSourceStateSchema.parse(value),
    });
  }
  public attachSourceFile(
    workspaceId: string,
    sourceId: string,
    path: string,
    linked = false,
    draftId?: string,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/reference`,
      body: {
        path,
        ...(linked ? { linked: true } : {}),
        ...(draftId ? { draft_id: draftId } : {}),
      },
      decode: (value) => workspaceResourceSchema.parse(value),
    });
  }
  public attachSourceFolder(
    workspaceId: string,
    sourceId: string,
    linked = false,
    path = '',
    draftId?: string,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${sourcePath(workspaceId, sourceId)}/reference`,
      body: {
        folder: true,
        linked,
        ...(path ? { path } : {}),
        ...(draftId ? { draft_id: draftId } : {}),
      },
      decode: (value) => workspaceResourceSchema.parse(value),
    });
  }
}
