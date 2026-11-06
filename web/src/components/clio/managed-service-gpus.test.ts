import { managedServiceDefinitionSchema, type ManagedServiceDefinition } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  deploymentDevices,
  devicesLabel,
  formatDevices,
  gpuLabel,
  gpusForParameter,
  instanceNameProblem,
  parseDevices,
  servicesWithInstances,
} from './managed-service-gpus';

const vllm = (overrides: Record<string, unknown> = {}): ManagedServiceDefinition =>
  managedServiceDefinitionSchema.parse({
    id: 'vllm',
    category: 'model_runtime',
    label: 'vLLM',
    description: 'Model serving.',
    recommended_variant: 'cuda',
    variants: [
      {
        id: 'cuda',
        label: 'NVIDIA CUDA',
        version: '0.28.0',
        install_type: 'container',
        artifact: 'img',
        compatible: true,
        reason: '',
      },
    ],
    supports_stop: true,
    state: 'not_installed',
    supports_instances: true,
    parameters: [
      {
        id: 'cuda_devices',
        label: 'NVIDIA GPU devices',
        description: 'CUDA devices the server may use.',
        kind: 'text',
        delivery: 'env',
        name: 'CUDA_VISIBLE_DEVICES',
        variants: ['cuda'],
      },
    ],
    ...overrides,
  });

const a100 = (index: number) => ({
  index,
  name: 'A100-SXM4-40GB',
  vendor: 'nvidia' as const,
  memory_total_mib: 40960,
  uuid: `GPU-${index}`,
});

describe('GPU device values', () => {
  it('names a deployment’s GPUs the way its row shows them', () => {
    expect(devicesLabel('')).toBe('All GPUs');
    expect(devicesLabel(undefined)).toBe('All GPUs');
    expect(devicesLabel('1')).toBe('GPU 1');
    expect(devicesLabel('2,3')).toBe('GPUs 2,3');
    expect(devicesLabel(' 2, 3 ')).toBe('GPUs 2,3');
  });

  it('round-trips the CSV a device parameter takes', () => {
    expect(parseDevices('3, 1,1,x')).toEqual([1, 3]);
    expect(parseDevices('')).toEqual([]);
    expect(formatDevices([3, 1])).toBe('1,3');
  });

  it('labels a GPU with its index, model and memory', () => {
    expect(gpuLabel(a100(1))).toBe('GPU 1 · A100-SXM4-40GB · 40 GB');
    expect(gpuLabel({ ...a100(0), memory_total_mib: undefined })).toBe('GPU 0 · A100-SXM4-40GB');
  });

  it('offers a CUDA parameter only the NVIDIA GPUs', () => {
    const amd = { ...a100(1), vendor: 'amd' as const, name: 'MI250' };
    expect(gpusForParameter({ id: 'cuda_devices' }, [a100(0), amd])).toEqual([a100(0)]);
    expect(gpusForParameter({ id: 'rocm_devices' }, [a100(0), amd])).toEqual([amd]);
  });
});

describe('deployment GPUs on a row', () => {
  it('reads the chosen GPUs from the deployment’s configuration', () => {
    expect(
      deploymentDevices(vllm({ state: 'running', configuration: { 'param.cuda_devices': '2,3' } })),
    ).toBe('GPUs 2,3');
    expect(
      deploymentDevices(vllm({ state: 'running', configuration: { 'param.cuda_devices': '' } })),
    ).toBe('All GPUs');
  });

  it('says All GPUs for an unpinned GPU deployment, and nothing without GPU facts', () => {
    const running = vllm({ state: 'running' });
    expect(deploymentDevices(running, { gpus: [a100(0)] })).toBe('All GPUs');
    expect(deploymentDevices(running, { gpus: [] })).toBeUndefined();
    expect(deploymentDevices(running)).toBeUndefined();
  });
});

describe('named instances', () => {
  it('validates the instance name the way the server does', () => {
    const base = vllm();
    expect(instanceNameProblem('spotter', base, [])).toBeUndefined();
    expect(instanceNameProblem('a', base, [])).toBeUndefined();
    expect(instanceNameProblem('', base, [])).toBe('Name this instance.');
    for (const bad of ['Spotter', '-spotter', 'spotter-', 'spot_ter', 'a'.repeat(33)])
      expect(instanceNameProblem(bad, base, [])).toMatch(/lowercase letters/u);
    expect(instanceNameProblem('spotter', base, ['vllm@spotter'])).toBe(
      'An instance named spotter already exists.',
    );
  });

  it('labels instance rows and lists each after its engine', () => {
    const rows = servicesWithInstances([
      vllm({ id: 'vllm@spotter', instance_of: 'vllm', instance_name: 'spotter' }),
      vllm({ id: 'llama_cpp', label: 'llama.cpp' }),
      vllm(),
    ]);
    expect(rows.map((row) => row.label)).toEqual(['llama.cpp', 'vLLM', 'vLLM · spotter']);
  });

  it('adds a named instance the catalog has not reported yet, from its engine', () => {
    const rows = servicesWithInstances(
      [vllm({ state: 'running', configuration: { model: 'Qwen/Qwen3-8B' } })],
      { 'vllm@judge': 'vllm' },
    );
    expect(rows.map((row) => row.id)).toEqual(['vllm', 'vllm@judge']);
    expect(rows[1]).toMatchObject({
      label: 'vLLM · judge',
      instance_of: 'vllm',
      instance_name: 'judge',
      state: 'not_installed',
      configuration: {},
      supports_instances: false,
    });
    expect(rows[1].parameters).toEqual(rows[0].parameters);
  });

  it('prefers the catalog’s row once CLIO reports the instance', () => {
    const reported = vllm({
      id: 'vllm@judge',
      label: 'vLLM · judge',
      instance_of: 'vllm',
      instance_name: 'judge',
      state: 'running',
    });
    const rows = servicesWithInstances([vllm(), reported], { 'vllm@judge': 'vllm' });
    expect(rows).toHaveLength(2);
    expect(rows[1].state).toBe('running');
    expect(rows[1].label).toBe('vLLM · judge');
  });
});
