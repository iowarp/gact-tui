import { describe, expect, it } from 'vitest';
import {
  a2uiComponentSchema,
  A2UI_MAP_POINTS_MAX,
  A2UI_MAP_POINT_CATEGORY_MAX_CHARS,
  A2UI_MAP_POINT_DETAIL_MAX_CHARS,
  A2UI_MAP_POINT_ID_MAX_CHARS,
  A2UI_MAP_POINT_LABEL_MAX_CHARS,
  A2UI_TIME_SERIES_ROWS_MAX,
  A2UI_TIME_SERIES_Y_KEYS_MAX,
  A2UI_WORKFLOW_EDGES_MAX,
  A2UI_WORKFLOW_NODES_MAX,
} from './schema-contracts.js';

function accepts(component: unknown): boolean {
  return a2uiComponentSchema.safeParse(component).success;
}

function mapPoints(count: number, overrides: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `station-${index}`,
    label: `Station ${index}`,
    latitude: 34,
    longitude: -118,
    ...overrides,
  }));
}

function mapWith(points: unknown[]) {
  return { id: 'map', component: 'clio.map.v1', points };
}

function timeSeries(rows: number, yKeys: number) {
  return {
    id: 'plot',
    component: 'clio.time-series.v1',
    xKey: 'time',
    yKeys: Array.from({ length: yKeys }, (_, index) => `series_${index}`),
    series: Array.from({ length: rows }, (_, index) => ({ time: index, series_0: index })),
  };
}

function workflow(nodes: number, edges: number) {
  return {
    id: 'flow',
    component: 'clio.workflow.v1',
    nodes: Array.from({ length: nodes }, (_, index) => ({
      id: `node-${index}`,
      label: `Node ${index}`,
    })),
    edges: Array.from({ length: edges }, (_, index) => ({
      source: 'node-0',
      target: `node-${index}`,
    })),
  };
}

/**
 * These assertions are the anti-drift lock: every cap a renderer restates is
 * proven against the generated contract, so an upstream schema change breaks
 * the constant instead of silently splitting client and wire validation.
 */
describe('A2UI contract limits', () => {
  it('states the map caps the generated schema enforces', () => {
    expect(accepts(mapWith(mapPoints(A2UI_MAP_POINTS_MAX)))).toBe(true);
    expect(accepts(mapWith(mapPoints(A2UI_MAP_POINTS_MAX + 1)))).toBe(false);

    expect(accepts(mapWith(mapPoints(1, { id: 'a'.repeat(A2UI_MAP_POINT_ID_MAX_CHARS) })))).toBe(
      true,
    );
    expect(
      accepts(mapWith(mapPoints(1, { id: 'a'.repeat(A2UI_MAP_POINT_ID_MAX_CHARS + 1) }))),
    ).toBe(false);

    expect(
      accepts(mapWith(mapPoints(1, { label: 'a'.repeat(A2UI_MAP_POINT_LABEL_MAX_CHARS) }))),
    ).toBe(true);
    expect(
      accepts(mapWith(mapPoints(1, { label: 'a'.repeat(A2UI_MAP_POINT_LABEL_MAX_CHARS + 1) }))),
    ).toBe(false);

    expect(
      accepts(mapWith(mapPoints(1, { detail: 'a'.repeat(A2UI_MAP_POINT_DETAIL_MAX_CHARS) }))),
    ).toBe(true);
    expect(
      accepts(mapWith(mapPoints(1, { detail: 'a'.repeat(A2UI_MAP_POINT_DETAIL_MAX_CHARS + 1) }))),
    ).toBe(false);

    expect(
      accepts(mapWith(mapPoints(1, { category: 'a'.repeat(A2UI_MAP_POINT_CATEGORY_MAX_CHARS) }))),
    ).toBe(true);
    expect(
      accepts(
        mapWith(mapPoints(1, { category: 'a'.repeat(A2UI_MAP_POINT_CATEGORY_MAX_CHARS + 1) })),
      ),
    ).toBe(false);
  });

  it('states the time-series caps the generated schema enforces', () => {
    expect(accepts(timeSeries(A2UI_TIME_SERIES_ROWS_MAX, 1))).toBe(true);
    expect(accepts(timeSeries(A2UI_TIME_SERIES_ROWS_MAX + 1, 1))).toBe(false);
    expect(accepts(timeSeries(1, A2UI_TIME_SERIES_Y_KEYS_MAX))).toBe(true);
    expect(accepts(timeSeries(1, A2UI_TIME_SERIES_Y_KEYS_MAX + 1))).toBe(false);
  });

  it('states the workflow caps the generated schema enforces', () => {
    expect(accepts(workflow(A2UI_WORKFLOW_NODES_MAX, 1))).toBe(true);
    expect(accepts(workflow(A2UI_WORKFLOW_NODES_MAX + 1, 1))).toBe(false);
    expect(accepts(workflow(1, A2UI_WORKFLOW_EDGES_MAX))).toBe(true);
    expect(accepts(workflow(1, A2UI_WORKFLOW_EDGES_MAX + 1))).toBe(false);
  });
});
