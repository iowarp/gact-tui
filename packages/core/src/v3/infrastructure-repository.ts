import { z } from 'zod';
import {
  contextControlsSchema,
  type ContextControls,
  type ContextSizingPreviewInput,
} from './context-sizing-contract.js';
import {
  externalServiceConnectionSchema,
  infrastructureOperationSchema,
  operationLogLineSchema,
  operationLogPageSchema,
  operationProgressPatchSchema,
  operationReuseSchema,
  type InfrastructureOperationEvent,
  type OperationLogPage,
  infrastructureTargetSchema,
  managedServiceCatalogSchema,
  infrastructureInventorySchema,
  type InfrastructureInventory,
  type CreateInfrastructureTargetInput,
  type ExternalServiceConnection,
  type ExternalServiceConnectionInput,
  type InfrastructureOperation,
  type InfrastructureTarget,
  type ManagedServiceCatalog,
  type ServiceActionInput,
} from './infrastructure-contract.js';
import { ProvenanceConnectionRepository } from './provenance-connections.js';
import {
  hostStorageSettingsSchema,
  hostPathInspectionSchema,
  type HostStorageSettings,
  type HostPathInspection,
  type HostStorageLocations,
} from './storage-contract.js';
import type { TransportFrame } from './transport.js';

/**
 * Decode one frame of an operation's event stream; undefined for a frame this
 * client does not know (newer services may add event types).
 */
export function decodeInfrastructureOperationEvent(
  frame: TransportFrame,
): InfrastructureOperationEvent | undefined {
  const data = (frame.data ?? {}) as { id?: unknown; type?: unknown; payload?: unknown };
  const type = typeof data.type === 'string' && data.type ? data.type : frame.eventName;
  const parsedId = Number(frame.cursor || data.id || 0);
  const id = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : 0;
  const payload = data.payload ?? {};
  switch (type) {
    case 'operation.snapshot':
      return {
        id: 0,
        type: 'operation.snapshot',
        operation: infrastructureOperationSchema.parse(payload),
      };
    case 'operation.completed':
      return {
        id,
        type: 'operation.completed',
        operation: infrastructureOperationSchema.parse(payload),
      };
    case 'operation.progress':
      return {
        id,
        type: 'operation.progress',
        progress: operationProgressPatchSchema.parse(payload),
      };
    case 'operation.log':
      return { id, type: 'operation.log', log: operationLogLineSchema.parse(payload) };
    case 'operation.reuse':
      return { id, type: 'operation.reuse', reuse: operationReuseSchema.parse(payload) };
    case 'stream.gap': {
      const first = (payload as { first_retained_id?: unknown }).first_retained_id;
      return {
        id: 0,
        type: 'stream.gap',
        first_retained_id: typeof first === 'number' ? first : undefined,
      };
    }
    case 'server.heartbeat':
      return { id: 0, type: 'server.heartbeat' };
    default:
      return undefined;
  }
}

/** Infrastructure lifecycle and connection operations owned by the active CLIO. */
export class InfrastructureRepository extends ProvenanceConnectionRepository {
  public infrastructureInventory(signal?: AbortSignal): Promise<InfrastructureInventory> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/infrastructure/inventory',
      decode: (value) => infrastructureInventorySchema.parse(value),
      signal,
    });
  }
  public hostStorageSettings(targetId: string, signal?: AbortSignal): Promise<HostStorageSettings> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/infrastructure/targets/${encodeURIComponent(targetId)}/storage`,
      decode: (value) => hostStorageSettingsSchema.parse(value),
      signal,
    });
  }

  public saveHostStorageSettings(
    targetId: string,
    locations: HostStorageLocations,
    signal?: AbortSignal,
  ): Promise<HostStorageSettings> {
    return this.transport.request({
      method: 'PUT',
      path: `/v1/infrastructure/targets/${encodeURIComponent(targetId)}/storage`,
      body: locations,
      decode: (value) => hostStorageSettingsSchema.parse(value),
      signal,
    });
  }

  public inspectHostPath(
    targetId: string,
    input: { path: string; browse?: boolean; required_bytes?: number },
    signal?: AbortSignal,
  ): Promise<HostPathInspection> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/infrastructure/targets/${encodeURIComponent(targetId)}/storage/inspect`,
      body: input,
      decode: (value) => hostPathInspectionSchema.parse(value),
      signal,
    });
  }

  public async infrastructureTargets(signal?: AbortSignal): Promise<InfrastructureTarget[]> {
    const response = await this.transport.request({
      method: 'GET',
      path: '/v1/infrastructure/targets',
      decode: (value) => z.object({ targets: z.array(infrastructureTargetSchema) }).parse(value),
      signal,
    });
    return response.targets;
  }

  public createInfrastructureTarget(
    input: CreateInfrastructureTargetInput,
    signal?: AbortSignal,
  ): Promise<InfrastructureTarget> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/infrastructure/targets',
      body: input,
      decode: (value) => infrastructureTargetSchema.parse(value),
      signal,
    });
  }

  public deleteInfrastructureTarget(targetId: string, signal?: AbortSignal): Promise<void> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/infrastructure/targets/${encodeURIComponent(targetId)}`,
      decode: () => undefined,
      signal,
    });
  }

  public updateInfrastructureTarget(
    targetId: string,
    input: CreateInfrastructureTargetInput,
    signal?: AbortSignal,
  ): Promise<InfrastructureTarget> {
    return this.transport.request({
      method: 'PUT',
      path: `/v1/infrastructure/targets/${encodeURIComponent(targetId)}`,
      body: input,
      decode: (value) => infrastructureTargetSchema.parse(value),
      signal,
    });
  }

  public setInfrastructureTransportState(
    targetId: string,
    state: InfrastructureTarget['transport_state'],
    signal?: AbortSignal,
  ): Promise<InfrastructureTarget> {
    return this.transport.request({
      method: 'PUT',
      path: `/v1/infrastructure/targets/${encodeURIComponent(targetId)}/transport-state`,
      body: { state },
      decode: (value) => infrastructureTargetSchema.parse(value),
      signal,
    });
  }

  public managedServiceCatalog(
    targetId = 'local',
    signal?: AbortSignal,
  ): Promise<ManagedServiceCatalog> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/infrastructure/catalog?target_id=${encodeURIComponent(targetId)}`,
      decode: (value) => managedServiceCatalogSchema.parse(value),
      signal,
    });
  }

  public runManagedServiceAction(
    serviceId: string,
    input: ServiceActionInput,
    signal?: AbortSignal,
  ): Promise<InfrastructureOperation> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/infrastructure/services/${encodeURIComponent(serviceId)}/actions`,
      body: input,
      decode: (value) => infrastructureOperationSchema.parse(value),
      signal,
    });
  }

  public infrastructureOperation(
    operationId: string,
    signal?: AbortSignal,
  ): Promise<InfrastructureOperation> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/infrastructure/operations/${encodeURIComponent(operationId)}`,
      decode: (value) => infrastructureOperationSchema.parse(value),
      signal,
    });
  }

  /**
   * The live event stream of one operation: a snapshot first, then progress,
   * log lines and reuse notes, ending with `operation.completed`. Pass the
   * highest event id already held as `lastEventId` to resume (exclusive).
   */
  public async *infrastructureOperationEvents(
    operationId: string,
    lastEventId?: number,
    signal?: AbortSignal,
  ): AsyncIterable<InfrastructureOperationEvent> {
    const frames = this.transport.stream(
      {
        connection_id: '',
        path: `/v1/infrastructure/operations/${encodeURIComponent(operationId)}/events`,
      },
      lastEventId ? String(lastEventId) : undefined,
      signal,
    );
    for await (const frame of frames) {
      const event = decodeInfrastructureOperationEvent(frame);
      if (event) yield event;
    }
  }

  /** Live log lines newer than `after` (an event id), for clients that poll. */
  public infrastructureOperationLog(
    operationId: string,
    after = 0,
    limit = 500,
    signal?: AbortSignal,
  ): Promise<OperationLogPage> {
    const query = new URLSearchParams({ after: String(after), limit: String(limit) });
    return this.transport.request({
      method: 'GET',
      path: `/v1/infrastructure/operations/${encodeURIComponent(operationId)}/log?${query.toString()}`,
      decode: (value) => operationLogPageSchema.parse(value),
      signal,
    });
  }

  /**
   * The context control (number, Max, Fit to GPU) a deployment form renders
   * for its model on its host, computed the way a launch would. Changes nothing.
   */
  public previewContextSizing(
    serviceId: string,
    input: ContextSizingPreviewInput,
    signal?: AbortSignal,
  ): Promise<ContextControls> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/infrastructure/services/${encodeURIComponent(serviceId)}/context-sizing`,
      body: input,
      decode: (value) => contextControlsSchema.parse(value),
      signal,
    });
  }

  public cancelInfrastructureOperation(
    operationId: string,
    signal?: AbortSignal,
  ): Promise<InfrastructureOperation> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/infrastructure/operations/${encodeURIComponent(operationId)}`,
      decode: (value) => infrastructureOperationSchema.parse(value),
      signal,
    });
  }

  public async externalServiceConnections(
    signal?: AbortSignal,
  ): Promise<ExternalServiceConnection[]> {
    const response = await this.transport.request({
      method: 'GET',
      path: '/v1/infrastructure/service-connections',
      decode: (value) =>
        z.object({ connections: z.array(externalServiceConnectionSchema) }).parse(value),
      signal,
    });
    return response.connections;
  }

  public createExternalServiceConnection(
    input: ExternalServiceConnectionInput,
    signal?: AbortSignal,
  ): Promise<ExternalServiceConnection> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/infrastructure/service-connections',
      body: input,
      decode: (value) => externalServiceConnectionSchema.parse(value),
      signal,
    });
  }

  public deleteExternalServiceConnection(
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/infrastructure/service-connections/${encodeURIComponent(connectionId)}`,
      decode: () => undefined,
      signal,
    });
  }

  public updateExternalServiceConnection(
    connectionId: string,
    input: ExternalServiceConnectionInput,
    signal?: AbortSignal,
  ): Promise<ExternalServiceConnection> {
    return this.transport.request({
      method: 'PUT',
      path: `/v1/infrastructure/service-connections/${encodeURIComponent(connectionId)}`,
      body: input,
      decode: (value) => externalServiceConnectionSchema.parse(value),
      signal,
    });
  }

  public checkExternalServiceConnection(
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<ExternalServiceConnection> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/infrastructure/service-connections/${encodeURIComponent(connectionId)}/check`,
      decode: (value) => externalServiceConnectionSchema.parse(value),
      signal,
    });
  }
}
