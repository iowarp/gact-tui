import type { ModelCapabilityTags } from '@clio/core/v3';
import type { ClioModelOption } from '@/lib/model-options';
import { defaultConfiguration } from './provider-actions';

/** The picker's configuration with a signed-in OpenRouter preset beside the defaults. */
export const openrouterConfiguration = {
  ...defaultConfiguration,
  presets: [
    ...defaultConfiguration.presets,
    {
      id: 'openrouter',
      label: 'OpenRouter',
      provider: 'openrouter',
      suggested_model: '',
      requires_api_key: true,
      auth_method: 'api_key',
      is_authenticated: true,
      status: 'ready',
    },
  ],
};

const EVIDENCE = [
  {
    source: 'openrouter' as const,
    detail: "openrouter architecture.output_modalities=['image']",
    observed_at: '2026-09-26T00:00:00+00:00',
  },
] as [{ source: 'openrouter'; detail: string; observed_at: string }];

function tag<T>(value: T) {
  return { value, evidence: EVIDENCE };
}

export interface TagSpec {
  inputs?: string[];
  outputs?: string[];
  capabilities?: string[];
  modelType?: string;
  tasks?: string[];
  free?: boolean;
  router?: boolean;
}

/** A service `capability_tags` record, as the provider catalog serves it. */
export function capabilityTags(id: string, spec: TagSpec): ModelCapabilityTags {
  const modelType = spec.modelType;
  return {
    model_key: id,
    input_modalities: (spec.inputs ?? []).map(tag),
    output_modalities: (spec.outputs ?? []).map(tag),
    capabilities: (spec.capabilities ?? []).map(tag),
    tasks: (spec.tasks ?? []).map(tag),
    model_type: modelType ? tag(modelType) : null,
    role: modelType ? tag(modelType === 'chat' ? 'general' : 'surrogate') : null,
    free: spec.free === undefined ? null : tag(spec.free),
    router: spec.router === undefined ? null : tag(spec.router),
  } as ModelCapabilityTags;
}

/** One catalog row (an OpenRouter chat model unless `spec`/`extra` say otherwise). */
export function capabilityRow(
  id: string,
  spec: TagSpec = {},
  extra: Partial<ClioModelOption> = {},
): ClioModelOption {
  return {
    providerId: 'openrouter',
    providerName: 'OpenRouter',
    id,
    label: id.split('/').at(-1) ?? id,
    available: true,
    health: 'ready',
    chatSelectable: spec.modelType ? spec.modelType === 'chat' : true,
    capabilityTags: capabilityTags(id, {
      inputs: ['text'],
      outputs: ['text'],
      modelType: 'chat',
      tasks: spec.modelType ? [] : ['text-generation'],
      ...spec,
    }),
    ...extra,
  };
}
