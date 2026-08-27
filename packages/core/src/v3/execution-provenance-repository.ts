import type {
  ExecutionProvenanceOptions,
  ExecutionProvenanceResult,
  ProvenanceProvidersResult,
} from './execution-provenance-domain.js';
import {
  executionProvenanceSchema,
  provenanceProvidersSchema,
} from './execution-provenance-schemas.js';
import { AdministrationRepository } from './administration-repository.js';

/** Provider-neutral execution provenance reads served by CLIO. */
export class ExecutionProvenanceRepository extends AdministrationRepository {
  public async provenanceProviders(signal?: AbortSignal): Promise<ProvenanceProvidersResult> {
    return await this.transport.request({
      method: 'GET',
      path: '/v1/provenance/providers',
      decode: (value) => provenanceProvidersSchema.parse(value),
      signal,
    });
  }

  public async executionProvenance(
    sessionId: string,
    options: ExecutionProvenanceOptions = {},
    signal?: AbortSignal,
  ): Promise<ExecutionProvenanceResult> {
    const query = new URLSearchParams();
    if (options.provider) query.set('provider', options.provider);
    if (options.includeChildren !== undefined) {
      query.set('include_children', String(options.includeChildren));
    }
    if (options.limit !== undefined) query.set('limit', String(options.limit));
    const suffix = query.size ? `?${query.toString()}` : '';
    return await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/provenance/execution${suffix}`,
      decode: (value) => executionProvenanceSchema.parse(value),
      signal,
    });
  }
}
