import { describe, expect, it } from 'vitest';
import { mapClickSelectionValues } from './map-points';
import type { ScientificMapPoint } from './scientific-map-view';

const points: ScientificMapPoint[] = [
  { id: 'a1', label: 'Aster 1', latitude: 1, longitude: 1, track: 'Aster', selectionValue: 10 },
  { id: 'a2', label: 'Aster 2', latitude: 2, longitude: 2, track: 'Aster', selectionValue: 11 },
  { id: 'b1', label: 'Boreal 1', latitude: 3, longitude: 3, track: 'Boreal', selectionValue: 20 },
];

describe('map trajectory selection', () => {
  it('selects every observation of a clicked track', () => {
    expect(mapClickSelectionValues(points, 'a2', '__row', [], false)).toEqual([10, 11]);
  });

  it('Shift-click adds and then removes a whole track', () => {
    expect(mapClickSelectionValues(points, 'b1', '__row', [10, 11], true)).toEqual([10, 11, 20]);
    expect(mapClickSelectionValues(points, 'a1', '__row', [10, 11, 20], true)).toEqual([20]);
  });

  it('keeps individual points individual when no track is supplied', () => {
    expect(mapClickSelectionValues([{ ...points[0]!, track: undefined }], 'a1', '__row', [], false))
      .toEqual([10]);
  });
});
