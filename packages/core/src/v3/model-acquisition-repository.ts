import { ConnectedStorageRepository } from './connected-storage-repository.js';
import {
  modelAcquisitionSchema,
  modelInventorySchema,
  modelSearchSchema,
  type ModelDownloadInput,
} from './model-acquisition-contract.js';

/** Model files belong to an execution host; acquisition does not start a runtime. */
export class ModelAcquisitionRepository extends ConnectedStorageRepository {
  public searchModels(query: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: `/v1/infrastructure/models/search?q=${encodeURIComponent(query)}`,
      signal,
      decode: (value) => modelSearchSchema.parse(value),
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
    action: 'cancel' | 'retry',
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
