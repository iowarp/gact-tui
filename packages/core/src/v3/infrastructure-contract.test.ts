import { describe, expect, it } from 'vitest';
import { managedServiceDefinitionSchema, targetFactsSchema } from './infrastructure-contract.js';

const facts = {
  target_id: 'local', label: 'Local host', os: 'windows', arch: 'AMD64',
  accelerator: 'none', docker_available: false, docker_installed: false,
  uv_available: true, transport_state: 'connected',
};

describe('host ownership facts', () => {
  it.each([{ uid: -1, gid: -1 }, { uid: 1000, gid: 1000 }])('decodes the backend identity object %j', (identity) => {
    expect(targetFactsSchema.parse({ ...facts, identity }).identity).toEqual(identity);
  });
  it('accepts older servers without identity but rejects malformed ownership', () => {
    expect(targetFactsSchema.parse(facts).identity).toBeUndefined();
    expect(targetFactsSchema.safeParse({ ...facts, identity: '1000' }).success).toBe(false);
    expect(targetFactsSchema.safeParse({ ...facts, identity: { uid: '1000', gid: 1000 } }).success).toBe(false);
  });
});

describe('GPU facts', () => {
  it('decodes the GPUs a target reports', () => {
    const gpu = { index: 1, name: 'A100-SXM4-40GB', vendor: 'nvidia', memory_total_mib: 40960, uuid: 'GPU-1' };
    expect(targetFactsSchema.parse({ ...facts, gpus: [gpu] }).gpus).toEqual([gpu]);
  });
  it('treats an older server without GPUs, or an unknown vendor and memory, as tolerable', () => {
    expect(targetFactsSchema.parse(facts).gpus).toBeUndefined();
    expect(targetFactsSchema.parse({ ...facts, gpus: null }).gpus).toBeUndefined();
    expect(targetFactsSchema.parse({ ...facts, gpus: 'none' }).gpus).toBeUndefined();
    expect(
      targetFactsSchema.parse({ ...facts, gpus: [{ index: 0, name: 'GPU', vendor: 'other', memory_total_mib: null, uuid: 'u' }] }).gpus,
    ).toEqual([{ index: 0, name: 'GPU', vendor: undefined, memory_total_mib: undefined, uuid: 'u' }]);
  });
});

describe('managed service instances', () => {
  const row = {
    id: 'vllm', category: 'model_runtime', label: 'vLLM', description: '', recommended_variant: 'cuda',
    variants: [], supports_stop: true, state: 'not_installed',
  };
  it('defaults the instance fields for servers that predate named instances', () => {
    const service = managedServiceDefinitionSchema.parse(row);
    expect(service.supports_instances).toBeUndefined();
    expect(service.instance_of).toBeUndefined();
    expect(service.instance_name).toBeUndefined();
  });
  it('decodes a base engine that supports instances and an instance row', () => {
    expect(managedServiceDefinitionSchema.parse({ ...row, supports_instances: true }).supports_instances).toBe(true);
    const instance = managedServiceDefinitionSchema.parse({ ...row, id: 'vllm@spotter', instance_of: 'vllm', instance_name: 'spotter' });
    expect([instance.instance_of, instance.instance_name]).toEqual(['vllm', 'spotter']);
  });
});
