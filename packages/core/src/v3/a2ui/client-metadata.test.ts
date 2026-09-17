import { afterEach, describe, expect, it } from 'vitest';
import {
  buildA2uiClientCapabilities,
  checkA2uiUrlScheme,
  currentA2uiClientMetadata,
  mergeA2uiClientMetadata,
  setA2uiClientMetadataProvider,
} from './client-metadata.js';

afterEach(() => {
  setA2uiClientMetadataProvider(undefined);
});

describe('buildA2uiClientCapabilities', () => {
  it('produces the exact official envelope, preference-ordered', () => {
    expect(buildA2uiClientCapabilities(['clio-workspace/v1', 'a2ui.dev/basic/v0.9'])).toEqual({
      'v0.9': { supportedCatalogIds: ['clio-workspace/v1', 'a2ui.dev/basic/v0.9'] },
    });
  });
});

describe('currentA2uiClientMetadata / mergeA2uiClientMetadata', () => {
  it('returns {} when nothing has registered a provider', () => {
    expect(currentA2uiClientMetadata('sess_1')).toEqual({});
    expect(mergeA2uiClientMetadata('sess_1', undefined)).toBeUndefined();
  });

  it('merges the registered capabilities into an existing metadata object without mutating it', () => {
    setA2uiClientMetadataProvider(() => ({
      a2uiClientCapabilities: buildA2uiClientCapabilities(['basic']),
    }));
    const base = { pinned: true };
    const merged = mergeA2uiClientMetadata('sess_1', base);
    expect(merged).toEqual({
      a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: ['basic'] } },
      pinned: true,
    });
    expect(base).toEqual({ pinned: true });
  });

  it('includes the data model only when requested and present', () => {
    setA2uiClientMetadataProvider(() => ({
      a2uiClientCapabilities: buildA2uiClientCapabilities(['basic']),
      a2uiClientDataModel: { version: 'v0.9.1', surfaces: { surface_1: { count: 1 } } },
    }));
    expect(mergeA2uiClientMetadata('sess_1', undefined)).toEqual({
      a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: ['basic'] } },
    });
    expect(mergeA2uiClientMetadata('sess_1', undefined, { includeDataModel: true })).toEqual({
      a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: ['basic'] } },
      a2uiClientDataModel: { version: 'v0.9.1', surfaces: { surface_1: { count: 1 } } },
    });
  });

  it('never overwrites a metadata key the caller already set', () => {
    setA2uiClientMetadataProvider(() => ({
      a2uiClientCapabilities: buildA2uiClientCapabilities(['basic']),
    }));
    const merged = mergeA2uiClientMetadata('sess_1', {
      a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: ['caller-supplied'] } },
    });
    expect(merged).toEqual({
      a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: ['caller-supplied'] } },
    });
  });

  /**
   * The whole point of registering the provider once in `packages/core` is
   * that browser and Tauri send byte-identical metadata — both transports'
   * repository call sites run this exact same merge, never their own copy.
   */
  it('produces byte-identical metadata for two independent (fake) transports', () => {
    setA2uiClientMetadataProvider(() => ({
      a2uiClientCapabilities: buildA2uiClientCapabilities(['clio-workspace/v1', 'basic']),
    }));

    function fakeTransportSend(sessionId: string, body: Record<string, unknown>) {
      return { ...body, metadata: mergeA2uiClientMetadata(sessionId, undefined) };
    }

    const browserSent = fakeTransportSend('sess_1', { message: { action: { name: 'form.submit' } } });
    const tauriSent = fakeTransportSend('sess_1', { message: { action: { name: 'form.submit' } } });
    expect(browserSent).toEqual(tauriSent);
    expect(browserSent.metadata).toEqual({
      a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: ['clio-workspace/v1', 'basic'] } },
    });
  });
});

describe('checkA2uiUrlScheme', () => {
  it.each(['https://example.test/image.png', 'artifact://artifact_1', 'resource://resource_1'])(
    'allows %s',
    (value) => {
      expect(checkA2uiUrlScheme(value)).toEqual({ ok: true });
    },
  );

  it.each(['javascript:alert(1)', 'http://example.test/image.png', 'data:text/plain;base64,AA=='])(
    'blocks %s',
    (value) => {
      const result = checkA2uiUrlScheme(value);
      expect(result.ok).toBe(false);
    },
  );

  it('rejects a value that is not a URL at all', () => {
    const result = checkA2uiUrlScheme('not a url');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('not a valid URL');
  });
});
