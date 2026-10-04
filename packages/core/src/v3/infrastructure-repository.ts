import { z } from 'zod';
import {
  externalServiceConnectionSchema,
  infrastructureOperationSchema,
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
import { ModelAcquisitionRepository } from './model-acquisition-repository.js';
import {
  hostStorageSettingsSchema,
  hostPathInspectionSchema,
  type HostStorageSettings,
  type HostPathInspection,
  type HostStorageLocations,
} from './storage-contract.js';

/** Infrastructure lifecycle and connection operations owned by the active CLIO. */
export class InfrastructureRepository extends ModelAcquisitionRepository {
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
