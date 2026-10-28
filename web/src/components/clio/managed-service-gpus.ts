import type {
  GpuFact,
  ManagedServiceDefinition,
  ServerParameter,
  TargetFacts,
} from '@clio/core/v3';
import { PARAMETER_PREFIX, parametersForVariant } from './managed-service-target-utils';

/** A named instance of an engine: `vllm@<name>`. The server enforces the same rule. */
export const INSTANCE_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/u;

/** The parameters that pick a deployment's GPUs (`cuda_devices`, `xpu_devices`, …). */
export function isDeviceParameter(row: Pick<ServerParameter, 'id'>): boolean {
  return row.id.endsWith('_devices');
}

/** The GPU indices a `*_devices` value names; empty means every GPU the host exposes. */
export function parseDevices(value: string | undefined): number[] {
  const indices = (value ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => /^\d+$/u.test(token))
    .map(Number);
  return [...new Set(indices)].sort((left, right) => left - right);
}

/** The CSV a `*_devices` parameter takes. */
export function formatDevices(indices: number[]): string {
  return [...new Set(indices)].sort((left, right) => left - right).join(',');
}

/** "GPU 1", "GPUs 2,3" or "All GPUs", from a `*_devices` value as configured. */
export function devicesLabel(value: string | undefined): string {
  const tokens = (value ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return 'All GPUs';
  return tokens.length === 1 ? `GPU ${tokens[0]}` : `GPUs ${tokens.join(',')}`;
}

/** "GPU 1 · A100-SXM4-40GB · 40 GB". */
export function gpuLabel(gpu: GpuFact): string {
  return [
    `GPU ${gpu.index}`,
    gpu.name,
    gpu.memory_total_mib ? `${Math.round(gpu.memory_total_mib / 1024)} GB` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const DEVICE_VENDORS: [prefix: string, vendor: NonNullable<GpuFact['vendor']>][] = [
  ['cuda', 'nvidia'],
  ['rocm', 'amd'],
  ['hip', 'amd'],
  ['xpu', 'intel'],
];

/** The host's GPUs a device parameter can name: CUDA lists NVIDIA GPUs, ROCm AMD, XPU Intel. */
export function gpusForParameter(row: Pick<ServerParameter, 'id'>, gpus: GpuFact[]): GpuFact[] {
  const vendor = DEVICE_VENDORS.find(([prefix]) => row.id.startsWith(prefix))?.[1];
  return gpus.filter((gpu) => !vendor || !gpu.vendor || gpu.vendor === vendor);
}

/**
 * The GPUs a deployment uses, as its row shows them, or undefined when the
 * deployment does not pick GPUs (CPU builds, services without a device
 * parameter, or a host that reported none).
 */
export function deploymentDevices(
  service: ManagedServiceDefinition,
  facts?: Pick<TargetFacts, 'gpus'>,
): string | undefined {
  const keys = Object.keys(service.configuration).filter(
    (key) => key.startsWith(PARAMETER_PREFIX) && isDeviceParameter({ id: key }),
  );
  if (keys.length) {
    const chosen = keys.find((key) => service.configuration[key]?.trim()) ?? keys[0];
    return devicesLabel(service.configuration[chosen]);
  }
  const effective = service.effective_parameters.find((row) => isDeviceParameter(row));
  if (effective) return devicesLabel(/^\d+(\s*,\s*\d+)*$/u.test(effective.value) ? effective.value : '');
  const installed = service.state === 'running' || service.state === 'stopped';
  if (
    installed &&
    service.category === 'model_runtime' &&
    facts?.gpus?.length &&
    parametersForVariant(service.parameters, service.recommended_variant).some(isDeviceParameter)
  )
    return 'All GPUs';
  return undefined;
}

/** The engine a row runs: `vllm` for both `vllm` and `vllm@spotter`. */
export function engineId(service: { id: string; instance_of?: string }): string {
  return service.instance_of || service.id.split('@', 1)[0]!;
}

/** The instance name of a row (`spotter` for `vllm@spotter`), when it is one. */
export function instanceName(service: {
  id: string;
  instance_name?: string;
}): string | undefined {
  return service.instance_name || service.id.split('@')[1] || undefined;
}

/** "vLLM · spotter" for an instance row; the plain label otherwise. */
export function withInstanceLabel(service: ManagedServiceDefinition): ManagedServiceDefinition {
  const name = instanceName(service);
  if (!name || service.label.includes(name)) return service;
  return { ...service, label: `${service.label} · ${name}` };
}

/**
 * The row a new instance is set up from before CLIO reports it: the base
 * engine's declaration (variants, fields, parameters) with none of its
 * deployment state.
 */
export function instanceDefinition(
  base: ManagedServiceDefinition,
  name: string,
): ManagedServiceDefinition {
  return withInstanceLabel({
    ...base,
    id: `${base.id}@${name}`,
    instance_of: base.id,
    instance_name: name,
    supports_instances: false,
    state: 'not_installed',
    connection_url: undefined,
    connection_strategy: undefined,
    configuration: {},
    effective_parameters: [],
    owned_resources: [],
    access: undefined,
    observation: undefined,
  });
}

/** Why an instance name cannot be used, or undefined when it can. */
export function instanceNameProblem(
  name: string,
  base: Pick<ManagedServiceDefinition, 'id'>,
  existing: string[],
): string | undefined {
  if (!name) return 'Name this instance.';
  if (!INSTANCE_NAME_PATTERN.test(name))
    return 'Use up to 32 lowercase letters, digits or hyphens, starting and ending with a letter or digit.';
  if (existing.includes(`${base.id}@${name}`)) return `An instance named ${name} already exists.`;
  return undefined;
}

/**
 * The catalog's rows with instance labels, plus the instances the person
 * named here that CLIO has not reported yet, each instance listed after its
 * engine. `pending` maps an instance id (`vllm@spotter`) to its engine.
 */
export function servicesWithInstances(
  rows: ManagedServiceDefinition[],
  pending: Record<string, string> = {},
): ManagedServiceDefinition[] {
  const labelled = rows.map(withInstanceLabel);
  const known = new Set(labelled.map((row) => row.id));
  const added = Object.entries(pending).flatMap(([id, baseId]) => {
    const base = labelled.find((row) => row.id === baseId);
    const name = instanceName({ id });
    return !known.has(id) && base && name ? [instanceDefinition(base, name)] : [];
  });
  const all = [...labelled, ...added];
  const instances = (row: ManagedServiceDefinition) =>
    all.filter(
      (candidate) =>
        candidate.id !== row.id && instanceName(candidate) && engineId(candidate) === row.id,
    );
  const bases = all.filter((row) => !instanceName(row));
  const ordered = bases.flatMap((row) => [row, ...instances(row)]);
  return [...ordered, ...all.filter((row) => !ordered.includes(row))];
}
