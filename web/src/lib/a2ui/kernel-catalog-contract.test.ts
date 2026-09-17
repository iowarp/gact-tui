import {
  A2UI_MAP_POINTS_MAX,
  A2UI_MAP_POINT_CATEGORY_MAX_CHARS,
  A2UI_MAP_POINT_DETAIL_MAX_CHARS,
  A2UI_MAP_POINT_ID_MAX_CHARS,
  A2UI_MAP_POINT_LABEL_MAX_CHARS,
  A2UI_TIME_SERIES_ROWS_MAX,
  A2UI_TIME_SERIES_Y_KEYS_MAX,
  A2UI_WORKFLOW_EDGES_MAX,
  A2UI_WORKFLOW_NODES_MAX,
} from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import clioWorkspaceCatalog from '@/test-fixtures/a2ui/v0_9_1/catalogs/clio-workspace/v1/catalog.json';

/**
 * Anti-drift lock, moved here from `packages/core/src/v3/schema-contracts.test.ts`
 * (the generated closed component union it used to check against is deleted —
 * `docs/design/a2ui-compat-campaign-2026-09.md` S1/S6): every cap
 * `schema-contracts.ts` restates for the CLIO kernel components is proven
 * directly against the vendored `clio-workspace/v1` catalog file's own JSON
 * Schema `maxItems`/`maxLength`, so an upstream clio-schemas change breaks
 * this test instead of silently splitting the two.
 */
function componentSchema(name: string): {
  properties: Record<string, { maxItems?: number; maxLength?: number; minLength?: number }>;
} {
  const component = (
    clioWorkspaceCatalog.components as unknown as Record<
      string,
      { allOf: Array<Record<string, unknown>> }
    >
  )[name];
  if (!component) throw new Error(`Fixture is missing component ${name}`);
  const propertiesEntry = component.allOf.find(
    (entry): entry is { properties: Record<string, { maxItems?: number; maxLength?: number }> } =>
      typeof entry === 'object' && entry !== null && 'properties' in entry,
  );
  if (!propertiesEntry) throw new Error(`Component ${name} has no properties entry`);
  return propertiesEntry;
}

describe('A2UI CLIO workspace catalog caps', () => {
  it('states the map caps the vendored catalog file enforces', () => {
    const map = componentSchema('clio.map.v1');
    expect(map.properties.points?.maxItems).toBe(A2UI_MAP_POINTS_MAX);
    const point = (
      clioWorkspaceCatalog.$defs as unknown as Record<
        string,
        { properties: Record<string, { maxLength?: number }> }
      >
    ).MapPoint.properties;
    expect(point.id?.maxLength).toBe(A2UI_MAP_POINT_ID_MAX_CHARS);
    expect(point.label?.maxLength).toBe(A2UI_MAP_POINT_LABEL_MAX_CHARS);
    expect(point.detail?.maxLength).toBe(A2UI_MAP_POINT_DETAIL_MAX_CHARS);
    expect(point.category?.maxLength).toBe(A2UI_MAP_POINT_CATEGORY_MAX_CHARS);
  });

  it('states the time-series caps the vendored catalog file enforces', () => {
    const timeSeries = componentSchema('clio.time-series.v1');
    expect(timeSeries.properties.series?.maxItems).toBe(A2UI_TIME_SERIES_ROWS_MAX);
    expect(timeSeries.properties.yKeys?.maxItems).toBe(A2UI_TIME_SERIES_Y_KEYS_MAX);
  });

  it('states the workflow caps the vendored catalog file enforces', () => {
    const workflow = componentSchema('clio.workflow.v1');
    expect(workflow.properties.nodes?.maxItems).toBe(A2UI_WORKFLOW_NODES_MAX);
    expect(workflow.properties.edges?.maxItems).toBe(A2UI_WORKFLOW_EDGES_MAX);
  });
});
