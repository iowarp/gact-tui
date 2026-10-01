import { describe, expect, it } from 'vitest';
import { withDefaultProjectionFit } from './chart-projection-fit';

const SQUARE = {
  type: 'Polygon',
  coordinates: [
    [
      [-100, 40],
      [-99, 40],
      [-99, 41],
      [-100, 41],
      [-100, 40],
    ],
  ],
};
const OTHER_SQUARE = {
  type: 'Polygon',
  coordinates: [
    [
      [-99, 40],
      [-98, 40],
      [-98, 41],
      [-99, 41],
      [-99, 40],
    ],
  ],
};

const GEOSHAPE_SPEC = {
  data: { name: 'source' },
  mark: 'geoshape',
  encoding: { shape: { field: 'geometry', type: 'geojson' } },
  projection: { type: 'mercator' },
};

describe('withDefaultProjectionFit', () => {
  it('fills a missing fit from the rows geometry column, as a FeatureCollection', () => {
    const rows = [{ geometry: SQUARE }, { geometry: OTHER_SQUARE }];
    const result = withDefaultProjectionFit(GEOSHAPE_SPEC, rows);
    expect(result.projection).toEqual({
      type: 'mercator',
      fit: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: {}, geometry: SQUARE },
          { type: 'Feature', properties: {}, geometry: OTHER_SQUARE },
        ],
      },
    });
  });

  it('never overrides a fit the agent already set', () => {
    const spec = {
      ...GEOSHAPE_SPEC,
      projection: { type: 'mercator', fit: { type: 'Point', coordinates: [0, 0] } },
    };
    const result = withDefaultProjectionFit(spec, [{ geometry: SQUARE }]);
    expect(result.projection).toEqual(spec.projection);
  });

  it('does not mutate the caller spec or rows', () => {
    const spec = { ...GEOSHAPE_SPEC, projection: { type: 'mercator' } };
    const before = JSON.stringify(spec);
    withDefaultProjectionFit(spec, [{ geometry: SQUARE }]);
    expect(JSON.stringify(spec)).toBe(before);
  });

  it('returns the same reference when there is no geoshape unit at all', () => {
    const spec = { mark: 'point', encoding: { x: { field: 't', type: 'quantitative' } } };
    expect(withDefaultProjectionFit(spec, [{ t: 1 }])).toBe(spec);
  });

  it('returns the same reference when a geoshape unit has no projection to default', () => {
    const { projection: _projection, ...spec } = GEOSHAPE_SPEC;
    expect(withDefaultProjectionFit(spec, [{ geometry: SQUARE }])).toBe(spec);
  });

  it('returns the same reference when the existing projection already has a fit', () => {
    const spec = {
      ...GEOSHAPE_SPEC,
      projection: { type: 'mercator', fit: { type: 'Point', coordinates: [0, 0] } },
    };
    expect(withDefaultProjectionFit(spec, [{ geometry: SQUARE }])).toBe(spec);
  });

  it('is unaffected by a lon/lat point map (no geojson shape channel)', () => {
    const spec = {
      data: { name: 'source' },
      mark: 'circle',
      encoding: {
        longitude: { field: 'lon', type: 'quantitative' },
        latitude: { field: 'lat', type: 'quantitative' },
      },
      projection: { type: 'equirectangular' },
    };
    expect(withDefaultProjectionFit(spec, [{ lon: 1, lat: 2 }])).toBe(spec);
  });

  it('finds a geoshape unit nested inside a layer composition', () => {
    const spec = {
      data: { name: 'source' },
      projection: { type: 'mercator' },
      layer: [
        { mark: 'geoshape', encoding: { shape: { field: 'geometry', type: 'geojson' } } },
        { mark: 'point', encoding: { x: { field: 't', type: 'quantitative' } } },
      ],
    };
    const result = withDefaultProjectionFit(spec, [{ geometry: SQUARE }]);
    expect((result.projection as { fit?: unknown }).fit).toEqual({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: SQUARE }],
    });
  });

  it('finds a geoshape unit nested inside a facet composition', () => {
    const spec = {
      data: { name: 'source' },
      projection: { type: 'mercator' },
      facet: { field: 'group', type: 'nominal' },
      spec: { mark: 'geoshape', encoding: { shape: { field: 'geometry', type: 'geojson' } } },
    };
    const result = withDefaultProjectionFit(spec, [{ geometry: SQUARE, group: 'a' }]);
    expect((result.projection as { fit?: unknown }).fit).toBeDefined();
  });

  it('merges geometry from every unit sharing one top-level projection into a single fit', () => {
    const spec = {
      data: { name: 'source' },
      projection: { type: 'mercator' },
      concat: [
        { mark: 'geoshape', encoding: { shape: { field: 'geometryA', type: 'geojson' } } },
        { mark: 'geoshape', encoding: { shape: { field: 'geometryB', type: 'geojson' } } },
      ],
    };
    const rows = [{ geometryA: SQUARE, geometryB: OTHER_SQUARE }];
    const result = withDefaultProjectionFit(spec, rows);
    const fit = (result.projection as { fit: { features: unknown[] } }).fit;
    expect(fit.features).toHaveLength(2);
  });

  it('ignores a unit with its own projection that already has a fit, while still filling a sibling', () => {
    const spec = {
      data: { name: 'source' },
      layer: [
        {
          mark: 'geoshape',
          encoding: { shape: { field: 'geometry', type: 'geojson' } },
          projection: { type: 'mercator', fit: { type: 'Point', coordinates: [0, 0] } },
        },
      ],
    };
    const result = withDefaultProjectionFit(spec, [{ geometry: SQUARE }]);
    const layer = (result.layer as Array<{ projection: { fit: unknown } }>)[0]!;
    expect(layer.projection.fit).toEqual({ type: 'Point', coordinates: [0, 0] });
  });

  it('skips a row whose geometry cell is absent or not an object', () => {
    const rows = [{ geometry: SQUARE }, { geometry: null }, {}];
    const result = withDefaultProjectionFit(GEOSHAPE_SPEC, rows);
    const fit = (result.projection as { fit: { features: unknown[] } }).fit;
    expect(fit.features).toHaveLength(1);
  });
});
