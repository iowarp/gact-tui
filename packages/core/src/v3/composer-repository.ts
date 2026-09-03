import type {
  ComposerMessagePart,
  MessageAcceptance,
  MessageBehavior,
  MessageDelivery,
  MessageSubmissionInput,
  PendingSteer,
  PendingSteerCancellation,
  ProviderCatalog,
  QueuedMessage,
  QueuedMessagePromotion,
  ResourceDeliveryRecord,
  WorkspaceResource,
  WorkspaceResourceDerivatives,
  WorkspaceResourceProcessing,
  WorkspaceResourceSearchResult,
  WorkspaceResourceStructure,
  WorkspaceReference,
  WorkspaceResourceStructureNode,
  ComposerModelRef,
} from './composer-domain.js';
import {
  messageAcceptanceSchema,
  pendingSteerCancellationSchema,
  pendingSteerSchema,
  providerCatalogSchema,
  queuedMessagePromotionSchema,
  queuedMessageSchema,
  resourceDeliveryRecordSchema,
  workspaceResourceSchema,
  workspaceResourceDerivativesSchema,
  workspaceResourceProcessingSchema,
  workspaceResourceSearchResultSchema,
  workspaceResourceStructureNodeSchema,
  workspaceResourceStructureSchema,
  workspaceReferenceSchema,
} from './composer-schemas.js';
import { ArtifactPreviewRepository } from './artifact-preview-repository.js';
import { QueuedMessageReorderConflictError } from './composer-conflicts.js';
import { decodeComposerRows } from './composer-decoding.js';
import { TransportError } from './transport.js';

export interface CreateQueuedMessageInput {
  parts: ComposerMessagePart[];
  metadata?: Record<string, unknown>;
  client_message_id: string;
  idempotency_key: string;
  behavior: MessageBehavior;
  model: ComposerModelRef;
}

export class ComposerRepository extends ArtifactPreviewRepository {
  public async workspaceReferences(
    workspaceId: string,
    options: { q?: string; kinds?: readonly string[] } = {},
    signal?: AbortSignal,
  ): Promise<WorkspaceReference[]> {
    const query = new URLSearchParams();
    if (options.q?.trim()) query.set('q', options.q.trim());
    for (const kind of options.kinds ?? []) query.append('kinds', kind);
    const suffix = query.size ? `?${query.toString()}` : '';
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/references${suffix}`,
      decode: (value) =>
        decodeComposerRows(
          'workspace_references',
          workspaceReferenceSchema,
          (value as { references?: unknown }).references,
        ),
      signal,
    });
    return result;
  }

  public submitMessage(
    sessionId: string,
    input: MessageSubmissionInput,
    signal?: AbortSignal,
  ): Promise<MessageAcceptance> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
      body: input,
      decode: (value) => messageAcceptanceSchema.parse(value),
      signal,
    });
  }

  public async pendingSteers(sessionId: string, signal?: AbortSignal): Promise<PendingSteer[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/pending-steers`,
      decode: (value) =>
        decodeComposerRows(
          'pending_steers',
          pendingSteerSchema,
          (value as { pending_steers?: unknown }).pending_steers,
        ),
      signal,
    });
    return result;
  }

  public cancelPendingSteer(
    sessionId: string,
    messageId: string,
    signal?: AbortSignal,
  ): Promise<PendingSteerCancellation> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/pending-steers/${encodeURIComponent(messageId)}`,
      decode: (value) => pendingSteerCancellationSchema.parse(value),
      signal,
    });
  }

  public async queuedMessages(sessionId: string, signal?: AbortSignal): Promise<QueuedMessage[]> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/queued-messages`,
      decode: (value) =>
        decodeComposerRows(
          'queued_messages',
          queuedMessageSchema,
          (value as { queued_messages?: unknown }).queued_messages,
        ),
      signal,
    });
  }

  public createQueuedMessage(
    sessionId: string,
    input: CreateQueuedMessageInput,
    signal?: AbortSignal,
  ): Promise<QueuedMessage> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/queued-messages`,
      body: input,
      decode: (value) => queuedMessageSchema.parse(value),
      signal,
    });
  }

  public updateQueuedMessage(
    sessionId: string,
    messageId: string,
    input: {
      revision: number;
      parts?: ComposerMessagePart[];
      metadata?: Record<string, unknown>;
      behavior?: MessageBehavior;
      model?: ComposerModelRef;
    },
    signal?: AbortSignal,
  ): Promise<QueuedMessage> {
    return this.transport.request({
      method: 'PATCH',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/queued-messages/${encodeURIComponent(messageId)}`,
      body: input,
      decode: (value) => queuedMessageSchema.parse(value),
      signal,
    });
  }

  public deleteQueuedMessage(
    sessionId: string,
    messageId: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/queued-messages/${encodeURIComponent(messageId)}?revision=${revision}`,
      decode: () => undefined,
      signal,
    });
  }

  /**
   * Apply a queued-message order, or report the conflict that stopped it.
   *
   * A 409 means the service's queue moved under the drag. The stale order is
   * never resubmitted: that would replay it over whatever the concurrent writer
   * did, which is exactly what the revision guard exists to prevent. The queue
   * is read back once and handed to the caller inside a
   * {@link QueuedMessageReorderConflictError} so the surface can show the order
   * the service actually holds and say why the drag did not land.
   */
  public async reorderQueuedMessages(
    sessionId: string,
    rows: QueuedMessage[],
    signal?: AbortSignal,
  ): Promise<QueuedMessage[]> {
    try {
      return await this.requestQueuedMessageReorder(sessionId, rows, signal);
    } catch (error) {
      if (!(error instanceof TransportError) || error.status !== 409) throw error;
      const current = await this.queuedMessages(sessionId, signal);
      throw new QueuedMessageReorderConflictError(current, error.message);
    }
  }

  private requestQueuedMessageReorder(
    sessionId: string,
    rows: QueuedMessage[],
    signal?: AbortSignal,
  ): Promise<QueuedMessage[]> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/queued-messages/reorder`,
      body: {
        ordered_ids: rows.map((row) => row.id),
        revisions: Object.fromEntries(rows.map((row) => [row.id, row.revision])),
      },
      decode: (value) =>
        queuedMessageSchema.array().parse((value as { queued_messages?: unknown }).queued_messages),
      signal,
    });
  }

  /**
   * Promote one queued message into the live turn.
   *
   * The response is schema-validated whole rather than field-cast: `String()`
   * over a missing `queued_message_id` manufactures the literal `"undefined"`,
   * which then travels as a real id into invalidation keys and error text. A
   * renamed or absent field must be a typed decode failure the caller can see.
   */
  public promoteQueuedMessage(
    sessionId: string,
    messageId: string,
    revision: number,
    delivery: MessageDelivery,
    signal?: AbortSignal,
  ): Promise<QueuedMessagePromotion> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/queued-messages/${encodeURIComponent(messageId)}/promote`,
      body: { revision, delivery },
      decode: (value) => queuedMessagePromotionSchema.parse(value),
      signal,
    });
  }

  public async resources(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceResource[]> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources`,
      decode: (value) =>
        decodeComposerRows(
          'resources',
          workspaceResourceSchema,
          (value as { resources?: unknown }).resources,
        ),
      signal,
    });
  }

  public createResource(
    workspaceId: string,
    file: { name: string; size: number; mediaType: string; clientUploadId: string },
    signal?: AbortSignal,
  ): Promise<WorkspaceResource> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources`,
      body: {
        name: file.name,
        size: file.size,
        media_type: file.mediaType,
        client_upload_id: file.clientUploadId,
      },
      decode: (value) => workspaceResourceSchema.parse(value),
      signal,
    });
  }

  public appendResourceBytes(
    workspaceId: string,
    resourceId: string,
    offset: number,
    bytes: Uint8Array,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.transport.request({
      method: 'PATCH',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/content`,
      rawBody: bytes,
      headers: {
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': String(offset),
      },
      decode: () => undefined,
      signal,
    });
  }

  public resource(
    workspaceId: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceResource> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}`,
      decode: (value) => workspaceResourceSchema.parse(value),
      signal,
    });
  }

  public resourcePreview(
    workspaceId: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/preview`,
      responseType: 'bytes',
      decode: (value) => value as Uint8Array,
      signal,
    });
  }

  public resourceContent(
    workspaceId: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/content`,
      responseType: 'bytes',
      decode: (value) => value as Uint8Array,
      signal,
    });
  }

  public resourceDerivatives(
    workspaceId: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceResourceDerivatives> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/derivatives`,
      decode: (value) => workspaceResourceDerivativesSchema.parse(value),
      signal,
    });
  }

  public resourceDerivativeContent(
    workspaceId: string,
    resourceId: string,
    derivativeId: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/derivatives/${encodeURIComponent(derivativeId)}/content`,
      responseType: 'bytes',
      decode: (value) => value as Uint8Array,
      signal,
    });
  }

  public resourceStructure(
    workspaceId: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceResourceStructure> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/structure`,
      decode: (value) => workspaceResourceStructureSchema.parse(value),
      signal,
    });
  }

  public resourceStructureNode(
    workspaceId: string,
    resourceId: string,
    collection: string,
    index: number,
    signal?: AbortSignal,
  ): Promise<WorkspaceResourceStructureNode> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/structure/${encodeURIComponent(collection)}/${index}`,
      decode: (value) => workspaceResourceStructureNodeSchema.parse(value),
      signal,
    });
  }

  public searchResource(
    workspaceId: string,
    resourceId: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceResourceSearchResult> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/search?q=${encodeURIComponent(query)}`,
      decode: (value) => workspaceResourceSearchResultSchema.parse(value),
      signal,
    });
  }

  public reprocessResource(
    workspaceId: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceResourceProcessing> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/reprocess`,
      decode: (value) => workspaceResourceProcessingSchema.parse(value),
      signal,
    });
  }

  public cancelResourceProcessing(
    workspaceId: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceResourceProcessing> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/processing/cancel`,
      decode: (value) => workspaceResourceProcessingSchema.parse(value),
      signal,
    });
  }

  public async resourceDeliveries(
    workspaceId: string,
    signal?: AbortSignal,
  ): Promise<ResourceDeliveryRecord[]> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resource-deliveries`,
      decode: (value) =>
        decodeComposerRows(
          'resource_deliveries',
          resourceDeliveryRecordSchema,
          (value as { records?: unknown }).records,
        ),
      signal,
    });
  }

  public deleteResource(
    workspaceId: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}`,
      decode: () => undefined,
      signal,
    });
  }

  public providerCatalog(refresh = false, signal?: AbortSignal): Promise<ProviderCatalog> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/provider-catalog${refresh ? '?refresh=true' : ''}`,
      decode: (value) => providerCatalogSchema.parse(value),
      signal,
    });
  }
}
