import { describe, expect, it } from 'vitest';
import type { ComponentApi, FunctionImplementation } from '@a2ui/web_core/v0_9';
import { z } from 'zod';
import catalogSidecarsWithNulls from './catalog-sidecars.with-nulls.fixture.json';
import {
  A2uiCatalogRegistry,
  a2uiCatalogRowListSchema,
  buildA2uiCatalog,
  type A2uiCatalogRow,
  type A2uiCatalogSidecar,
  type A2uiKernelRegistry,
} from './catalog-registry.js';

function component(name: string): ComponentApi {
  return { name, schema: z.object({}).strict() };
}

function fn(name: string): FunctionImplementation {
  return {
    name,
    returnType: 'void',
    schema: z.object({}),
    execute: () => undefined,
  };
}

const KERNEL: A2uiKernelRegistry<ComponentApi> = {
  components: new Map([
    ['Text', component('Text')],
    ['Button', component('Button')],
  ]),
  functions: new Map([['openArtifact', fn('openArtifact')]]),
};

function row(overrides: Partial<A2uiCatalogRow> = {}): A2uiCatalogRow {
  return {
    catalogId: 'https://example.test/catalogs/basic',
    protocolVersion: '0.9.1',
    source: 'builtin',
    checksum: 'abc123',
    componentNames: ['Text', 'Button'],
    functionNames: ['openArtifact'],
    sidecar: {
      catalogId: 'https://example.test/catalogs/basic',
      protocolVersion: '0.9.1',
      trust: { source: 'builtin' },
      implements: { Text: { kernel: 'Text' }, Button: { kernel: 'Button' } },
    },
    producible: true,
    file: {
      catalogId: 'https://example.test/catalogs/basic',
      components: { Text: {}, Button: {} },
      functions: { openArtifact: {} },
    },
    ...overrides,
  };
}

describe('buildA2uiCatalog', () => {
  it('resolves every declared component and function against the kernel', () => {
    const result = buildA2uiCatalog(row(), KERNEL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolution.catalog.id).toBe(row().catalogId);
    expect(result.resolution.catalog.components.has('Text')).toBe(true);
    expect(result.resolution.catalog.functions.has('openArtifact')).toBe(true);
  });

  it('resolves a component alias through the sidecar implements map', () => {
    const aliased = row({
      componentNames: ['SubmitButton'],
      file: {
        catalogId: 'https://example.test/catalogs/aliased',
        components: { SubmitButton: {} },
      },
      catalogId: 'https://example.test/catalogs/aliased',
      sidecar: {
        catalogId: 'https://example.test/catalogs/aliased',
        protocolVersion: '0.9.1',
        trust: { source: 'pack' },
        implements: { SubmitButton: { kernel: 'Button' } },
      },
    });
    const result = buildA2uiCatalog(aliased, KERNEL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolution.catalog.components.has('SubmitButton')).toBe(true);
    expect(result.resolution.catalog.components.has('Button')).toBe(false);
  });

  it('returns a typed reason when a component is not implemented', () => {
    const missing = row({
      componentNames: ['Slider'],
      file: {
        catalogId: 'https://example.test/catalogs/basic',
        components: { Slider: {} },
      },
    });
    const result = buildA2uiCatalog(missing, KERNEL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe('catalog_component_unimplemented');
    expect(result.reason.detail).toContain('Slider');
  });

  it('returns a typed reason when a function is not implemented', () => {
    const missing = row({
      functionNames: ['selectData'],
      file: {
        catalogId: 'https://example.test/catalogs/basic',
        components: { Text: {} },
        functions: { selectData: {} },
      },
    });
    const result = buildA2uiCatalog(missing, KERNEL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe('catalog_function_unimplemented');
    expect(result.reason.detail).toContain('selectData');
  });

  it('returns a typed reason when the row was not producible', () => {
    const notProducible = row({ producible: false, file: undefined, instructions: undefined });
    const result = buildA2uiCatalog(notProducible, KERNEL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe('catalog_row_missing_file');
  });

  it('passes the sidecar presets through to the wrap callback', () => {
    const presetRow = row({
      catalogId: 'https://example.test/catalogs/preset',
      componentNames: ['MultiPicker'],
      file: {
        catalogId: 'https://example.test/catalogs/preset',
        components: { MultiPicker: {} },
      },
      sidecar: {
        catalogId: 'https://example.test/catalogs/preset',
        protocolVersion: '0.9.1',
        trust: { source: 'pack' },
        implements: {
          MultiPicker: { kernel: 'Button', presets: { variant: 'multipleSelection' } },
        },
      },
    });
    const seen: Array<Record<string, string> | undefined> = [];
    const result = buildA2uiCatalog(presetRow, KERNEL, (kernelComponent, name, presets) => {
      seen.push(presets);
      return { ...kernelComponent, name };
    });
    expect(result.ok).toBe(true);
    expect(seen).toEqual([{ variant: 'multipleSelection' }]);
  });
});

describe('A2uiCatalogRegistry', () => {
  it('supportedCatalogIds lists only the catalogs that fully resolved, in row order', () => {
    const registry = new A2uiCatalogRegistry(KERNEL);
    registry.load([
      row({ catalogId: 'https://example.test/catalogs/basic' }),
      row({
        catalogId: 'https://example.test/catalogs/unresolvable',
        componentNames: ['Slider'],
        file: {
          catalogId: 'https://example.test/catalogs/unresolvable',
          components: { Slider: {} },
        },
      }),
    ]);
    expect(registry.supportedCatalogIds()).toEqual(['https://example.test/catalogs/basic']);
    expect(registry.reasonFor('https://example.test/catalogs/unresolvable')?.code).toBe(
      'catalog_component_unimplemented',
    );
    expect(registry.get('https://example.test/catalogs/basic')).toBeDefined();
  });

  it('load() replaces prior state so a since-removed catalog id stops resolving', () => {
    const registry = new A2uiCatalogRegistry(KERNEL);
    registry.load([row()]);
    expect(registry.get(row().catalogId)).toBeDefined();
    registry.load([]);
    expect(registry.get(row().catalogId)).toBeUndefined();
    expect(registry.supportedCatalogIds()).toEqual([]);
  });
});

describe('a2uiCatalogRowSchema tolerates an explicit null on optional sidecar fields (S1)', () => {
  // `catalog-sidecars.with-nulls.fixture.json` is a REAL server dump (not
  // hand-typed): both builtin catalogs' sidecars, serialised WITHOUT
  // `exclude_none` -- exactly what `gact/a2ui_catalogs/routes/
  // a2ui_catalogs.py::_catalog_summary` used to send before the S1 fix (every
  // `implements.<name>` with no alias serialises `presets: null`; every
  // `events.<name>` route serialises its unset `context_schema`/`operation`/
  // `narration` the same way). Regenerate with (from a clio-agent checkout):
  //
  //   uv run python -c "
  //   import json
  //   from clio_agent.gact.a2ui_catalogs.registry import CatalogRegistry
  //   registry = CatalogRegistry()
  //   print(json.dumps([
  //       {'catalogId': e.catalog_id, 'sidecar': e.sidecar.model_dump(mode='json')}
  //       for e in registry.installed()
  //   ], indent=2, sort_keys=True))
  //   " > packages/core/src/v3/a2ui/catalog-sidecars.with-nulls.fixture.json
  //
  // Before S1's `.nullish()` fix, `.optional()` on `presets`/`context_schema`
  // rejected the explicit `null` and `a2uiCatalogRowListSchema.parse` threw,
  // failing the WHOLE catalog list (`a2ui-repository.ts`'s `a2uiCatalogs()`)
  // -- the exact root cause of "Interactive surface unavailable" reported
  // even though the server's producer tool returned `created: true`.
  function rowFromFixture(entry: { catalogId: string; sidecar: unknown }): A2uiCatalogRow {
    const sidecar = entry.sidecar as A2uiCatalogSidecar;
    return {
      catalogId: entry.catalogId,
      protocolVersion: sidecar.protocolVersion,
      source: 'builtin',
      checksum: 'irrelevant-for-this-test',
      componentNames: Object.keys(sidecar.implements ?? {}),
      functionNames: [],
      sidecar,
      producible: false,
    };
  }

  it('parses the full real-world payload without throwing', () => {
    const rows = catalogSidecarsWithNulls.map(rowFromFixture);

    expect(() => a2uiCatalogRowListSchema.parse(rows)).not.toThrow();
  });

  it('keeps a null field as null, not silently coerced to undefined or dropped', () => {
    const rows = catalogSidecarsWithNulls.map(rowFromFixture);
    const parsed = a2uiCatalogRowListSchema.parse(rows);

    const workspaceRow = parsed.find((row) => row.catalogId.includes('clio-workspace'));
    expect(workspaceRow).toBeDefined();
    expect(workspaceRow!.sidecar.implements?.Button?.presets).toBeNull();
    const approvalRoute = workspaceRow!.sidecar.events?.['approval.respond'];
    expect(approvalRoute).toBeDefined();
    expect(approvalRoute!.context_schema).toBeNull();
    expect(approvalRoute!.destination).toBe('permission');
  });
});
