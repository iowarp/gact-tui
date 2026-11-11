import type { A2uiCatalogRow } from '@clio/core/v3';
import { afterEach, describe, expect, it } from 'vitest';
import { resetSharedA2uiCatalogRows, shareA2uiCatalogRows } from './shared-catalog-rows';

function row(overrides: Partial<A2uiCatalogRow> = {}): A2uiCatalogRow {
  return {
    catalogId: 'https://example.test/catalogs/basic',
    protocolVersion: '0.9.1',
    source: 'builtin',
    checksum: 'abc123',
    componentNames: ['Text'],
    functionNames: [],
    sidecar: {
      catalogId: 'https://example.test/catalogs/basic',
      protocolVersion: '0.9.1',
      trust: { source: 'builtin' },
      implements: { Text: { kernel: 'Text' } },
    } as A2uiCatalogRow['sidecar'],
    producible: false,
    ...overrides,
  };
}

describe('shareA2uiCatalogRows', () => {
  afterEach(() => resetSharedA2uiCatalogRows());

  it('returns the same decoded row for every session that lists an identical catalog', () => {
    const first = shareA2uiCatalogRows({ rows: [row()], rejected: [] });
    const second = shareA2uiCatalogRows({ rows: [row()], rejected: [] });
    expect(second.rows[0]).toBe(first.rows[0]);
  });

  it('keeps rows apart when checksum or producibility differ', () => {
    const base = shareA2uiCatalogRows({ rows: [row()], rejected: [] }).rows[0];
    const changed = shareA2uiCatalogRows({ rows: [row({ checksum: 'def456' })], rejected: [] })
      .rows[0];
    const producible = shareA2uiCatalogRows({ rows: [row({ producible: true })], rejected: [] })
      .rows[0];
    expect(changed).not.toBe(base);
    expect(changed?.checksum).toBe('def456');
    expect(producible).not.toBe(base);
    expect(producible?.producible).toBe(true);
  });

  it('keeps rows apart when the sidecar routes differ under the same checksum', () => {
    const base = shareA2uiCatalogRows({ rows: [row()], rejected: [] }).rows[0];
    const rerouted = row();
    rerouted.sidecar = { ...rerouted.sidecar, events: {} };
    const shared = shareA2uiCatalogRows({ rows: [rerouted], rejected: [] }).rows[0];
    expect(shared).not.toBe(base);
    expect(shared?.sidecar.events).toEqual({});
  });

  it('never shares rows without a checksum and keeps rejections', () => {
    const rejected = [{ catalogId: 'x', reason: 'bad' }] as never;
    const first = shareA2uiCatalogRows({ rows: [row({ checksum: '' })], rejected });
    const second = shareA2uiCatalogRows({ rows: [row({ checksum: '' })], rejected: [] });
    expect(second.rows[0]).not.toBe(first.rows[0]);
    expect(first.rejected).toBe(rejected);
  });

  it('stays bounded as catalogs change', () => {
    const original = shareA2uiCatalogRows({ rows: [row()], rejected: [] }).rows[0];
    for (let index = 0; index < 100; index += 1) {
      shareA2uiCatalogRows({ rows: [row({ checksum: `v${index}` })], rejected: [] });
    }
    // The oldest entry was evicted, so a fresh decode is kept rather than the stale one.
    const again = shareA2uiCatalogRows({ rows: [row()], rejected: [] }).rows[0];
    expect(again).not.toBe(original);
  });
});
