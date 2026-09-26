/**
 * Complete provider-catalog payloads for provider tests -- every field the
 * service reports, so a test states only what it is about.
 */

export interface CatalogModelInput {
  model_id: string;
  reasoning?: Record<string, unknown>;
  availability?: string;
  transport?: string;
  modalities?: string[];
  /** The service's clio-schemas ModelCapabilityTags record for the model. */
  capability_tags?: Record<string, unknown>;
  /** The service's clio-schemas AcceptedParameter records for the model. */
  accepted_parameters?: ReturnType<typeof acceptedParameter>[];
}

const PARAMETER_SHAPES: Record<
  string,
  {
    label: string;
    group: 'sampling' | 'length' | 'advanced';
    kind: 'number' | 'integer';
    minimum: number | null;
    maximum: number | null;
    step: number;
  }
> = {
  temperature: {
    label: 'Temperature',
    group: 'sampling',
    kind: 'number',
    minimum: 0,
    maximum: 2,
    step: 0.05,
  },
  top_p: { label: 'Top P', group: 'sampling', kind: 'number', minimum: 0, maximum: 1, step: 0.01 },
  top_k: { label: 'Top K', group: 'sampling', kind: 'integer', minimum: 0, maximum: null, step: 1 },
  min_p: { label: 'Min P', group: 'sampling', kind: 'number', minimum: 0, maximum: 1, step: 0.01 },
  repetition_penalty: {
    label: 'Repetition penalty',
    group: 'sampling',
    kind: 'number',
    minimum: 0,
    maximum: 2,
    step: 0.05,
  },
  max_tokens: {
    label: 'Longest reply',
    group: 'length',
    kind: 'integer',
    minimum: 1,
    maximum: 16384,
    step: 256,
  },
  context_length: {
    label: 'Context size',
    group: 'length',
    kind: 'integer',
    minimum: 512,
    maximum: 40960,
    step: 1024,
  },
  seed: { label: 'Seed', group: 'advanced', kind: 'integer', minimum: 0, maximum: null, step: 1 },
  parallel: {
    label: 'Replies at once',
    group: 'advanced',
    kind: 'integer',
    minimum: 1,
    maximum: null,
    step: 1,
  },
};

/** One accepted response setting, as the service reports it (defaults to "Provider default"). */
export function acceptedParameter(
  name: keyof typeof PARAMETER_SHAPES,
  default_: number | null = null,
) {
  return {
    name,
    description: `${PARAMETER_SHAPES[name]!.label} changes the reply.`,
    options: [] as string[],
    default: default_,
    evidence: [{ source: 'litellm' as const, detail: `${name} accepted`, observed_at: '' }],
    ...PARAMETER_SHAPES[name]!,
  };
}

export function catalogEntry(
  id: string,
  models: CatalogModelInput[],
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: id,
    kind: id,
    endpoint: '',
    configuration_url: `/settings/providers?provider=${id}`,
    connectivity: 'ok',
    auth: 'ok',
    health: 'ready',
    freshness: { generated_at: '2026-08-23T05:00:00Z', source: 'live_handshake' },
    failure: '',
    checking: false,
    models: models.map((model) => ({
      provider_id: id,
      provider_kind: id,
      endpoint: '',
      deployment: '',
      revision: '',
      aliases: [],
      modalities: ['text'],
      native_tool_calling: true,
      availability: 'available',
      reasoning: { supported: false, parameter: '', levels: [] },
      evidence: {
        source: 'live',
        generated_at: '2026-08-23T05:00:00Z',
        live: true,
        context_source: '',
      },
      failure: '',
      ...model,
    })),
    ...overrides,
  };
}

export function catalog(...providers: ReturnType<typeof catalogEntry>[]) {
  return { authoritative: 'live_handshake', providers };
}

/** The live Codex catalog: gpt-5.6-luna reports its own reasoning levels. */
export function codexCatalog() {
  return catalog(
    catalogEntry(
      'codex',
      [
        {
          model_id: 'gpt-5.6-luna',
          reasoning: {
            supported: true,
            parameter: '',
            levels: ['low', 'medium', 'high', 'xhigh'],
            default: 'medium',
          },
          capability_tags: {
            model_key: 'gpt-5.6-luna',
            capabilities: [
              {
                value: 'reasoning',
                evidence: [
                  {
                    source: 'server_report',
                    detail: 'Codex model catalog supported_reasoning_levels',
                    observed_at: '2026-08-23T05:00:00Z',
                  },
                ],
              },
            ],
          },
        },
      ],
      { name: 'Codex (subscription)' },
    ),
  );
}
