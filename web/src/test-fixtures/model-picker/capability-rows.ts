import type { ModelCapabilityTags, ModelFacts } from '@clio/core/v3';
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

export interface FactSpec {
  description?: string;
  links?: { text: string; url: string }[];
  /** `YYYY-MM-DD` (or `YYYY-MM`). */
  released?: string;
  recent?: boolean;
  asOf?: string;
  /** USD per 1M input tokens, or a price that is not a number. */
  price?: number | 'variable' | 'subscription';
  total?: number;
  active?: number;
}

const FACT_EVIDENCE = [
  { source: 'openrouter' as const, detail: 'openrouter listing', observed_at: '2026-09-26T00:00:00+00:00' },
] as [{ source: 'openrouter'; detail: string; observed_at: string }];

/** A service `model_facts` record, as the provider catalog serves it. */
export function modelFacts(id: string, spec: FactSpec): ModelFacts {
  const price = spec.price;
  const side =
    price === undefined
      ? undefined
      : typeof price === 'number'
        ? { kind: 'usd' as const, per_1m: price }
        : { kind: price, per_1m: null };
  return {
    model_key: id,
    description: spec.description
      ? {
          value: { text: spec.description, plain: spec.description, links: spec.links ?? [] },
          evidence: FACT_EVIDENCE,
        }
      : null,
    released_at: spec.released
      ? { value: { date: spec.released, precision: 'day' }, evidence: FACT_EVIDENCE }
      : null,
    recent:
      spec.recent === undefined
        ? null
        : { value: spec.recent, window_months: 6, as_of: spec.asOf ?? '2026-09-26', evidence: FACT_EVIDENCE },
    pricing: side
      ? { value: { unit: 'usd_per_1m_tokens', input: side, output: side }, evidence: FACT_EVIDENCE }
      : null,
    parameters: spec.total
      ? {
          value: {
            total: spec.total,
            active: spec.active ?? null,
            experts_total: null,
            experts_active: null,
            precision: 'exact',
          },
          evidence: FACT_EVIDENCE,
        }
      : null,
  } as ModelFacts;
}
