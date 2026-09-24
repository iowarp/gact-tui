import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
