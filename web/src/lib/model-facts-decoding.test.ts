import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { providerCatalogSchema } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { modelFactsFromOption } from './model-facts';
import { buildModelOptions } from './model-options';

/**
 * The service's `model_facts` record read through the REAL catalog decoder
 * (`providerCatalogSchema`, validating with the generated clio-schemas 0.3.4
 * `ModelFacts` contract), in the wire shape clio-agent #1470 serves.
 */
const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), '../packages/core/src/v3/fixtures/server-provider-payloads.json'), 'utf8'),
) as { provider_catalog_live: { providers: Array<Record<string, unknown>> } & Record<string, unknown> };

const AT = '2026-09-26T00:00:00+00:00';

const PARETO_FACTS = {
  model_key: 'openrouter/pareto-code',
  description: {
    value: {
      text: 'The Pareto Router ... ranked by [Artificial Analysis](https://artificialanalysis.ai/) ...',
      plain: 'The Pareto Router ... ranked by Artificial Analysis ...',
      links: [{ text: 'Artificial Analysis', url: 'https://artificialanalysis.ai/' }],
    },
    evidence: [{ source: 'openrouter', detail: 'openrouter description', observed_at: AT }],
  },
  released_at: {
    value: { date: '2026-04-21', precision: 'day' },
    evidence: [{ source: 'openrouter', detail: 'openrouter created=1776747900', observed_at: AT }],
  },
  recent: {
    value: true,
    window_months: 6,
    as_of: '2026-09-26',
    evidence: [{ source: 'openrouter', detail: 'openrouter created=1776747900', observed_at: AT }],
  },
  pricing: {
    value: { unit: 'usd_per_1m_tokens', input: { kind: 'variable', per_1m: null }, output: { kind: 'variable', per_1m: null } },
    evidence: [{ source: 'server_report', detail: "openrouter pricing prompt='-1' completion='-1'", observed_at: AT }],
  },
  parameters: null,
};

const QWEN_FACTS = {
  model_key: 'qwen/qwen3.6-35b-a3b',
  description: null,
  released_at: null,
  recent: null,
  pricing: {
    value: { unit: 'usd_per_1m_tokens', input: { kind: 'usd', per_1m: 0.15 }, output: { kind: 'usd', per_1m: 1.5 } },
    evidence: [{ source: 'server_report', detail: 'openrouter pricing', observed_at: AT }],
    alternatives: [
      {
        value: { unit: 'usd_per_1m_tokens', input: { kind: 'usd', per_1m: 0.2 }, output: { kind: 'usd', per_1m: 2 } },
        evidence: [{ source: 'litellm', detail: 'litellm input_cost_per_token', observed_at: AT }],
      },
    ],
  },
  parameters: {
    value: { total: 35951822704, active: null, experts_total: 256, experts_active: 8, precision: 'exact' },
    evidence: [{ source: 'hf_repo', detail: 'huggingface Qwen/Qwen3.6-35B-A3B@995ad96eacd9: safetensors.total=35951822704', observed_at: AT }],
  },
};

function decode(facts: readonly Record<string, unknown>[]) {
  const provider = fixture.provider_catalog_live.providers.find((entry) => entry.id === 'argonne_sophia')!;
  const model = (provider.models as Array<Record<string, unknown>>)[0]!;
  const catalog = providerCatalogSchema.parse({
    ...fixture.provider_catalog_live,
    providers: [{ ...provider, models: facts.map((record) => ({ ...model, model_id: record.model_key, model_facts: record })) }],
  });
  return buildModelOptions({ activeCatalogProvider: String(provider.id), providerCatalog: catalog, presets: [] }).filter(
    (option) => option.kind !== 'provider',
  );
}

describe('model_facts through the catalog decoder', () => {
  it('reads a router description, a recent release and a variable price', () => {
    const [pareto] = decode([PARETO_FACTS]);
    const facts = modelFactsFromOption(pareto!);
    expect(facts.description?.plain).toBe('The Pareto Router ... ranked by Artificial Analysis ...');
    expect(facts.description?.links).toEqual([{ text: 'Artificial Analysis', url: 'https://artificialanalysis.ai/' }]);
    expect(facts.recent).toBe(true);
    expect(facts.inputPrice).toEqual({ kind: 'variable' });
    expect(facts.parameters).toBeUndefined();
  });

  it('reads the winning price and the parameter count with its expert layout', () => {
    const [qwen] = decode([QWEN_FACTS]);
    const facts = modelFactsFromOption(qwen!);
    expect(facts.inputPrice).toEqual({ kind: 'usd', per1m: 0.15 });
    expect(facts.parameters).toMatchObject({ total: 35951822704, expertsTotal: 256, expertsActive: 8 });
    expect(facts.releasedOn).toBeUndefined();
  });

  it('refuses a record that breaks the contract, never half-reads it', () => {
    expect(() => decode([{ ...QWEN_FACTS, pricing: { value: { unit: 'eur', input: {}, output: {} }, evidence: [] } }])).toThrow();
  });
});
