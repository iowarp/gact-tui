import { describe, expect, it } from 'vitest';
import { parseMapGeoJson } from './map-geojson';

const mixed = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'west', properties: { name: 'West', group: 'region', measure: 4 }, geometry: { type: 'Polygon', coordinates: [[[-120, 36], [-116, 36], [-116, 40], [-120, 40], [-120, 36]]] } },
    { type: 'Feature', id: 'site', properties: { name: 'Site', group: 'point', measure: 9 }, geometry: { type: 'Point', coordinates: [-114, 35] } },
  ],
});

describe('registered GeoJSON map data', () => {
  it('retains shape, source ids, values, and full geometry bounds', () => {
    const result = parseMapGeoJson(mixed, { labelField: 'name', categoryField: 'group', valueField: 'measure', selectionField: 'id' });
    expect(result.bounds).toEqual([[-120, 35], [-114, 40]]);
    expect(result.collection.features.map((feature) => feature.geometry.type)).toEqual(['Polygon', 'Point']);
    expect(result.points.map((point) => [point.id, point.label, point.category, point.value, point.selectionValue])).toEqual([
      ['west', 'West', 'region', 4, 'west'], ['site', 'Site', 'point', 9, 'site'],
    ]);
  });

  it('names a malformed feature and a missing bound key instead of silently losing selection', () => {
    expect(() => parseMapGeoJson('{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[200,35]}}]}', {}))
      .toThrow(/feature 1: longitude\/latitude is outside valid bounds/iu);
    expect(() => parseMapGeoJson(mixed, { selectionField: 'missing' }))
      .toThrow(/feature 1: selectionField missing needs a string or number property/iu);
  });
});
