import { ConnectedStorageRepository } from './connected-storage-repository.js';
import {
  modelAcquisitionSchema,
  modelInventorySchema,
  modelSearchSchema,
  modelSearchPageSchema,
  modelRegistryDetailsSchema,
  type ModelDownloadInput,
} from './model-acquisition-contract.js';

/** Model files belong to an execution host; acquisition does not start a runtime. */
export class ModelAcquisitionRepository extends ConnectedStorageRepository {
  public modelRegistryDetails(repository: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: `/v1/infrastructure/models/details?repository=${encodeURIComponent(repository)}`,
      signal,
      decode: (value) => modelRegistryDetailsSchema.parse(value),
    });
  }
  public searchModels(query: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: `/v1/infrastructure/models/search?q=${encodeURIComponent(query)}`,
      signal,
      decode: (value) => modelSearchSchema.parse(value),
    });
  }
  public searchModelsPage(
    input: { query: string; cursor?: string; filters?: string[] },
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams({ q: input.query });
    if (input.cursor) params.set('cursor', input.cursor);
    for (const filter of input.filters ?? []) params.append('filters', filter);
    return this.transport.request({
      method: 'GET',
      path: `/v1/infrastructure/models/search-page?${params.toString()}`,
      signal,
      decode: (value) => modelSearchPageSchema.parse(value),
    });
  }
  public modelInventory(targetId: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: `/v1/infrastructure/targets/${encodeURIComponent(targetId)}/models`,
      signal,
      decode: (value) => modelInventorySchema.parse(value),
    });
  }
  public acquireModel(targetId: string, input: ModelDownloadInput, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/infrastructure/targets/${encodeURIComponent(targetId)}/models`,
      body: input,
      signal,
      decode: (value) => modelAcquisitionSchema.parse(value),
    });
  }
  public modelAcquisitionAction(
    targetId: string,
    jobId: string,
    action: 'cancel' | 'retry' | 'remove',
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/infrastructure/targets/${encodeURIComponent(targetId)}/models/${encodeURIComponent(jobId)}/${action}`,
      signal,
      decode: (value) => modelAcquisitionSchema.parse(value),
    });
  }
}
