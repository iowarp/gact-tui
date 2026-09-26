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
        },
      ],
      { name: 'Codex (subscription)' },
    ),
  );
}
