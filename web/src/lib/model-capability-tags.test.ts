import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { providerCatalogSchema } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  displayedTags,
  modelCapabilityTagDetail,
  modelCapabilityTagLabel,
  modelCapabilityTagMeaning,
  modelCapabilityTagSource,
  modelCapabilityTagsFromOption,
  modelTypeOf,
} from './model-capability-tags';
import { modelFilterTokens, surrogateChatReason, tagFilterToken } from './model-filter-tokens';
import { buildModelOptions } from './model-options';

/**
 * The adapter reads the service's `capability_tags` record through the REAL
 * catalog decoder (`providerCatalogSchema`, which validates it with the
 * generated clio-schemas Zod contract) -- never a hand-built option.
 */
const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../packages/core/src/v3/fixtures/server-provider-payloads.json'),
    'utf8',
  ),
) as {
  provider_catalog_live: { providers: Array<Record<string, unknown>> } & Record<string, unknown>;
};

const AT = '2026-09-26T00:00:00+00:00';

function evidence(source: string, detail: string) {
  return [{ source, detail, observed_at: AT }];
}

const JEV_TAGS = {
  model_key: '~typesafe/jev-latest',
  model_type: {
    value: 'classification',
    evidence: evidence('openrouter', "openrouter architecture.output_modalities=['decisions']"),
  },
  role: {
    value: 'surrogate',
    evidence: evidence('openrouter', "openrouter architecture.output_modalities=['decisions']"),
  },
  tasks: [{ value: 'text-classification', evidence: evidence('openrouter', 'outputs') }],
  input_modalities: [
    { value: 'text', evidence: evidence('openrouter', 'openrouter architecture.input_modalities') },
  ],
  output_modalities: [
    {
      value: 'scores',
      evidence: evidence('openrouter', 'openrouter architecture.output_modalities'),
    },
  ],
  capabilities: [],
  domains: [],
  free: {
    value: false,
    evidence: evidence('server_report', "openrouter pricing prompt='0.000000042' completion='0'"),
  },
  router: {
    value: false,
    evidence: evidence('server_report', "openrouter model author='~typesafe'"),
  },
};

const FREE_ROUTER_TAGS = {
  model_key: 'openrouter/free',
  model_type: { value: 'chat', evidence: evidence('openrouter', 'outputs') },
  role: { value: 'general', evidence: evidence('openrouter', 'outputs') },
  tasks: [{ value: 'text-generation', evidence: evidence('openrouter', 'outputs') }],
  input_modalities: [
    {
      value: 'image',
      evidence: evidence('openrouter', 'openrouter architecture.input_modalities'),
    },
    { value: 'text', evidence: evidence('openrouter', 'openrouter architecture.input_modalities') },
  ],
  output_modalities: [{ value: 'text', evidence: evidence('openrouter', 'outputs') }],
  capabilities: [
    {
      value: 'tool_calling',
      evidence: [...evidence('openrouter', 'tools'), ...evidence('server_report', 'tools')],
    },
  ],
  domains: [],
  free: {
    value: true,
    evidence: evidence('server_report', "openrouter pricing prompt='0' completion='0'"),
  },
  router: {
    value: true,
    evidence: evidence('server_report', "openrouter model author='openrouter'"),
  },
};

function options(capabilityTags: Record<string, unknown>[]) {
  const provider = fixture.provider_catalog_live.providers.find(
    (entry) => entry.id === 'argonne_sophia',
  );
  const [model] = provider!.models as Array<Record<string, unknown>>;
  const models = capabilityTags.map((tags) => ({
    ...model,
    model_id: tags.model_key,
    chat_selectable: (tags.role as { value: string } | undefined)?.value !== 'surrogate',
    capability_tags: tags,
  }));
  const catalog = providerCatalogSchema.parse({
    ...fixture.provider_catalog_live,
    providers: [{ ...provider, models }],
  });
  return buildModelOptions({
    activeCatalogProvider: String(provider!.id),
    providerCatalog: catalog,
    presets: [],
  }).filter((option) => option.kind !== 'provider');
}

describe('modelCapabilityTagsFromOption (service capability_tags)', () => {
  it('a classifier is a surrogate with its task, and filters by model type and Hub task', () => {
    const [jev] = options([JEV_TAGS]);
    const tags = modelCapabilityTagsFromOption(jev!);
    const shown = displayedTags(tags).map(modelCapabilityTagLabel);
    // "Makes scores" would repeat "Classifier": not drawn, still filterable.
    expect(shown).toEqual(['Surrogate', 'Classifier', '131K']);
    // A known "not free" / "not a router" shows nothing.
    expect(tags.some((tag) => tag.axis === 'price' || tag.axis === 'kind')).toBe(false);

    const tokens = modelFilterTokens(tags, { chatSelectable: jev!.chatSelectable !== false });
    expect([...tokens].sort()).toEqual([
      'input:text',
      'output:scores',
      'role:surrogate',
      'task:classification',
      'task:text-classification',
    ]);
    expect(modelTypeOf(jev!)).toBe('classification');
    expect(surrogateChatReason(modelTypeOf(jev!))).toBe("Classifiers can't hold a conversation.");
  });

  it('every tag says where it came from, with the upstream field', () => {
    const [jev] = options([JEV_TAGS]);
    const task = modelCapabilityTagsFromOption(jev!).find((tag) => tag.axis === 'task')!;
    expect(modelCapabilityTagSource(task)).toBe('From OpenRouter.');
    expect(modelCapabilityTagDetail(task)).toBe(
      "openrouter architecture.output_modalities=['decisions']",
    );
    expect(modelCapabilityTagMeaning(task)).toBe(
      'Classifier. Hugging Face task: text-classification.',
    );
    expect(tagFilterToken(task)).toBe('task:classification');
  });

  it('the free router is free and a router; agreeing sources are all named', () => {
    const [free] = options([FREE_ROUTER_TAGS]);
    const tags = modelCapabilityTagsFromOption(free!);
    const labels = displayedTags(tags).map(modelCapabilityTagLabel);
    expect(labels).toEqual(['Router', 'Free', 'Vision', 'Tools', '131K']);
    const tools = tags.find((tag) => tag.axis === 'capability')!;
    expect(modelCapabilityTagSource(tools)).toBe('From OpenRouter and the provider.');
    const tokens = modelFilterTokens(tags, { chatSelectable: true });
    for (const token of [
      'free',
      'router',
      'input:text',
      'output:text',
      'role:general',
      'cap:tools',
    ]) {
      expect(tokens.has(token)).toBe(true);
    }
  });

  it('nothing stated shows nothing; only a chat model keeps the default text filter', () => {
    const [unknown] = options([{ model_key: 'allenai/Llama-3.1-Tulu-3-405B' }]);
    const tags = modelCapabilityTagsFromOption(unknown!);
    expect(tags.map((tag) => tag.axis)).toEqual(['context']);
    expect([...modelFilterTokens(tags, { chatSelectable: true })].sort()).toEqual([
      'input:text',
      'output:text',
    ]);
    // A known surrogate whose modalities nobody stated is never passed as text.
    const surrogate = modelFilterTokens(
      [{ axis: 'role', value: 'surrogate', evidence: [{ source: 'overlay', detail: '' }] }],
      { chatSelectable: false },
    );
    expect(surrogate.has('input:text')).toBe(false);
  });

  it('a service that sends an invalid tag record is refused by the decoder, never half-read', () => {
    expect(() =>
      options([{ ...JEV_TAGS, model_type: { value: 'classifier', evidence: [] } }]),
    ).toThrow();
  });

  it('an output chip is drawn only when the model type does not already say it', () => {
    const tagsFor = (modelType: string, outputs: string[]) =>
      displayedTags([
        ...outputs.map((value) => ({ axis: 'output_modality' as const, value, evidence: [] })),
        { axis: 'task' as const, value: modelType, evidence: [] },
      ]).map(modelCapabilityTagLabel);
    expect(tagsFor('audio_speech', ['audio'])).toEqual(['Speech generator']);
    expect(tagsFor('image_generation', ['image'])).toEqual(['Image generator']);
    expect(tagsFor('chat', ['image', 'text'])).toEqual(['Makes image']);
    expect(tagsFor('other', ['tensor'])).toEqual(['Makes tensor', 'Other model']);
  });
});
