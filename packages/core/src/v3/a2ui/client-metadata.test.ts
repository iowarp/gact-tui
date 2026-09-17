import { afterEach, describe, expect, it } from 'vitest';
import { ClioRepository } from '../repository.js';
import type { ClioTransport, TransportRequest } from '../transport.js';
import {
  buildA2uiClientCapabilities,
  checkA2uiUrlScheme,
  currentA2uiClientMetadata,
  mergeA2uiClientMetadata,
  setA2uiClientMetadataProvider,
} from './client-metadata.js';

/** A minimal fake transport that records every request body it was asked to send. */
class RecordingTransport implements ClioTransport {
  public bodies: unknown[] = [];

  public request<T>(request: TransportRequest<T>): Promise<T> {
    this.bodies.push(request.body);
    return Promise.resolve(request.decode({ status: 'accepted' }));
  }

  public stream(): AsyncIterable<never> {
    return (async function* () {})();
  }
}

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
   * Proven here on the real ClioRepository with two independent fake
   * transports (not by calling the merge helper twice by hand).
   */
  it('sends byte-identical a2uiAction bodies through a fake browser transport and a fake Tauri transport', async () => {
    setA2uiClientMetadataProvider(() => ({
      a2uiClientCapabilities: buildA2uiClientCapabilities(['clio-workspace/v1', 'basic']),
    }));

    const browserTransport = new RecordingTransport();
    const tauriTransport = new RecordingTransport();
    const browserRepository = new ClioRepository(browserTransport);
    const tauriRepository = new ClioRepository(tauriTransport);

    const action = { name: 'form.submit', surfaceId: 'surface_1', sourceComponentId: 'btn', timestamp: '2026-09-17T00:00:00Z', context: {} };
    await browserRepository.a2uiAction('sess_1', { version: 'v0.9.1', action });
    await tauriRepository.a2uiAction('sess_1', { version: 'v0.9.1', action });

    expect(browserTransport.bodies).toHaveLength(1);
    expect(browserTransport.bodies[0]).toEqual(tauriTransport.bodies[0]);
    expect(browserTransport.bodies[0]).toMatchObject({
      metadata: {
        a2uiClientCapabilities: {
          'v0.9': { supportedCatalogIds: ['clio-workspace/v1', 'basic'] },
        },
      },
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
