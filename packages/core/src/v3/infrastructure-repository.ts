import { z } from 'zod';
import {
  externalServiceConnectionSchema,
  infrastructureOperationSchema,
  infrastructureTargetSchema,
  managedServiceCatalogSchema,
  type CreateInfrastructureTargetInput,
  type ExternalServiceConnection,
  type ExternalServiceConnectionInput,
  type InfrastructureOperation,
  type InfrastructureTarget,
  type ManagedServiceCatalog,
  type ServiceActionInput,
} from './infrastructure-contract.js';
import { A2uiRepository } from './a2ui-repository.js';

/** Infrastructure lifecycle and connection operations owned by the active CLIO. */
export class InfrastructureRepository extends A2uiRepository {
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
