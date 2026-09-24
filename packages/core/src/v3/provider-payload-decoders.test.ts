import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { messageAcceptanceSchema, providerCatalogSchema } from './composer-schemas.js';
import { sessionDefaultsSchema } from './schemas.js';
import {
  providerHandshakeSchema,
  providerListSchema,
  providerModelCatalogSchema,
} from './repository-decoders.js';

/**
 * Payloads captured from the REAL clio-agent provider routes (the FastAPI app
 * built by `build_app`, served through its own handlers against deterministic
 * handshake stubs — no network). They are what the service actually puts on
 * the wire, `null`s included, so a decoder that only accepts absent keys fails
 * here instead of in the ALCF sign-in panel.
 *
 * Regenerate from the clio-agent tree with the capture script described in the
 * provider-catalog PR (fix/provider-catalog-truth); do not hand-edit.
 */
const payloads = JSON.parse(
  readFileSync(new URL('./fixtures/server-provider-payloads.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

describe('provider decoders accept real service payloads', () => {
  it('decodes a successful model catalog whose error is null', () => {
    const raw = payloads.provider_models_live as { error: unknown };
    // The premise of the ALCF bug: the service really sends `null`.
    expect(raw.error).toBeNull();
    const catalog = providerModelCatalogSchema.parse(raw);
    expect(catalog.error).toBeUndefined();
    expect(catalog.models.map((model) => model.id)).toContain('openai/gpt-oss-120b');
  });

  it('decodes a failed model catalog and keeps the typed reason', () => {
    const catalog = providerModelCatalogSchema.parse(payloads.provider_models_failed);
    expect(catalog.models).toEqual([]);
    expect(catalog.error).toMatch(/^argonne_stored_token_unusable:/u);
  });

  it('decodes live and failed provider handshakes', () => {
    const live = providerHandshakeSchema.parse(payloads.provider_handshake_live);
    expect(live.error).toBeUndefined();
    expect(live.latency_ms).toBeUndefined();
    const failed = providerHandshakeSchema.parse(payloads.provider_handshake_failed);
    expect(failed.auth).toBe('deferred');
    expect(failed.error).toMatch(/^argonne_stored_token_unusable:/u);
  });

  it('decodes the provider list', () => {
    const list = providerListSchema.parse(payloads.providers);
    expect(list.providers.length).toBeGreaterThan(0);
  });
});

describe('provider catalog decoder accepts real service payloads', () => {
  it('decodes the live catalog', () => {
    const catalog = providerCatalogSchema.parse(payloads.provider_catalog_live);
    const metis = catalog.providers.find((provider) => provider.id === 'argonne_metis');
    expect(metis?.freshness.source).toBe('live');
    expect(metis?.models.length).toBeGreaterThan(0);
  });

  it('decodes a last-good entry with its typed staleness', () => {
    const catalog = providerCatalogSchema.parse(payloads.provider_catalog_last_good);
    const metis = catalog.providers.find((provider) => provider.id === 'argonne_metis');
    expect(metis?.freshness.source).toBe('last_good');
    expect(metis?.freshness.staleness?.reason).toBe('last_good_catalog_served');
    expect(metis?.models.every((model) => model.availability === 'candidate')).toBe(true);
  });
});

describe('reasoning levels on the wire', () => {
  it('decodes each model with the levels its provider reports', () => {
    const catalog = providerCatalogSchema.parse(payloads.provider_catalog_live);
    const metis = catalog.providers.find((provider) => provider.id === 'argonne_metis');
    const gptOss = metis?.models.find((model) => model.model_id === 'openai/gpt-oss-120b');
    expect(gptOss?.reasoning).toEqual({
      supported: true,
      parameter: 'openai_gptoss',
      levels: ['low', 'medium', 'high'],
      default: 'medium',
      source: 'served_model_reasoning_parser',
    });
    const llama = metis?.models.find((model) => model.model_id === 'meta-llama/Llama-4-Maverick');
    expect(llama?.reasoning.levels).toEqual([]);
  });

  it('decodes an accepted message whose reasoning effort is unset (null)', () => {
    const raw = payloads.post_message_response_unset_effort as {
      behavior: { reasoning_effort: unknown };
    };
    expect(raw.behavior.reasoning_effort).toBeNull();
    const accepted = messageAcceptanceSchema.parse(raw);
    expect(accepted.behavior.reasoning_effort).toBeUndefined();
  });
});

describe('session defaults effort', () => {
  it('decodes null as "the selected model default"', () => {
    const decoded = sessionDefaultsSchema.parse({ effort: null });
    expect(decoded.effort).toBeUndefined();
  });

  it('decodes every level the service accepts', () => {
    for (const effort of ['minimal', 'xhigh', 'max']) {
      expect(sessionDefaultsSchema.parse({ effort }).effort).toBe(effort);
    }
  });
});
