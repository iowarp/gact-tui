import { z } from 'zod';
import { ModelAcquisitionRepository } from './model-acquisition-repository.js';

export type ProvenanceConnectionInput = {
  service_id: 'flowcept' | 'cmf';
  label: string;
  url: string;
  settings_path?: string;
  attention_files_dir?: string;
  capture_attention?: boolean;
};
const connectionSchema = z.object({
  id: z.string(),
  service_id: z.enum(['flowcept', 'cmf']),
  label: z.string(),
  url: z.string(),
  configuration: z.record(z.string(), z.string()),
  verification: z.record(z.string(), z.unknown()),
  managed: z.literal(false),
  verified: z.boolean(),
  active: z.boolean(),
  selected: z.boolean(),
});
export type ProvenanceConnection = z.infer<typeof connectionSchema>;
const activationSchema = z.object({ connection_id: z.string(), restart_required: z.boolean() });
const base = '/v1/infrastructure/provenance/connections';

/** Connection-only setup: never grants service or data lifecycle ownership. */
export class ProvenanceConnectionRepository extends ModelAcquisitionRepository {
  public async provenanceConnections(signal?: AbortSignal): Promise<ProvenanceConnection[]> {
    const value = await this.transport.request({
      method: 'GET',
      path: base,
      signal,
      decode: (data) => z.object({ connections: z.array(connectionSchema) }).parse(data),
    });
    return value.connections;
  }
  public connectProvenance(input: ProvenanceConnectionInput, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: base,
      body: input,
      signal,
      decode: (data) => connectionSchema.parse(data),
    });
  }
  public verifyProvenanceConnection(id: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `${base}/${encodeURIComponent(id)}/verify`,
      signal,
      timeoutMs: 90_000,
      decode: (data) => connectionSchema.parse(data),
    });
  }
  public useProvenanceConnection(id: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `${base}/${encodeURIComponent(id)}/use`,
      signal,
      decode: (data) => activationSchema.parse(data),
    });
  }
  public disconnectProvenanceConnection(id: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `${base}/${encodeURIComponent(id)}/disconnect`,
      signal,
      decode: (data) => activationSchema.parse(data),
    });
  }
  public forgetProvenanceConnection(id: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'DELETE',
      path: `${base}/${encodeURIComponent(id)}`,
      signal,
      decode: () => undefined,
    });
  }
}
