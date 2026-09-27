import { providerCatalogSchema } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { catalog, catalogEntry } from '@/test-fixtures/provider-catalog';

/**
 * The `accepted_parameters` rows exactly as clio-agent served them for a live
 * Ollama `qwen3:8b` row (recorded /api/show), read through the REAL catalog
 * decoder, which validates with the generated clio-schemas 0.4.1
 * `AcceptedParameter` contract.
 */
const SERVED = [
  {
    name: 'temperature',
    label: 'Temperature',
    description: 'Higher values make replies more varied; lower values more focused.',
    group: 'sampling',
    kind: 'number',
    minimum: 0.0,
    maximum: 2.0,
    step: 0.05,
    options: [],
    default: null,
    evidence: [
      {
        source: 'litellm',
        detail:
          "litellm get_supported_openai_params(custom_llm_provider='ollama_chat') lists temperature",
        observed_at: '2026-09-26T22:29:49.668916+00:00',
      },
      {
        source: 'dialect',
        detail: 'OpenAI-compatible chat completions API: temperature 0 to 2',
        observed_at: '',
      },
    ],
  },
  {
    name: 'context_length',
    label: 'Context size',
    description: 'How many tokens the model can read at once on this server.',
    group: 'length',
    kind: 'integer',
    minimum: 512.0,
    maximum: 40960.0,
    step: 1024.0,
    options: [],
    default: null,
    evidence: [
      {
        source: 'server_report',
        detail: 'context window 40960 (ollama /api/show model_info.<arch>.context_length)',
        observed_at: '2026-09-26T22:29:49.684480+00:00',
      },
    ],
  },
];

function decode(acceptedParameters: unknown) {
  const payload = catalog(catalogEntry('ollama', [{ model_id: 'qwen3:8b' }]));
  (payload.providers[0]!.models[0] as Record<string, unknown>).accepted_parameters =
    acceptedParameters;
  return providerCatalogSchema.parse(payload).providers[0]!.models[0]!;
}

describe('accepted_parameters decoding', () => {
  it('decodes the served rows with their ranges and evidence', () => {
    const model = decode(SERVED);
    expect(model.accepted_parameters?.map((row) => [row.name, row.maximum])).toEqual([
      ['temperature', 2],
      ['context_length', 40960],
    ]);
    expect(model.accepted_parameters?.[1]?.evidence[0]?.source).toBe('server_report');
  });

  it('keeps an empty list (the model accepts none) apart from an older service that sends none', () => {
    expect(decode([]).accepted_parameters).toEqual([]);
    expect(decode(undefined).accepted_parameters).toBeUndefined();
  });

  it('refuses a row with no evidence', () => {
    expect(() => decode([{ ...SERVED[0], evidence: [] }])).toThrow();
  });
});
