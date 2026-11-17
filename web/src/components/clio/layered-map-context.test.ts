import { describe, expect, it } from 'vitest';
import { degreesLabel, graticuleStep } from './layered-map-graticule';

describe('layered map context', () => {
  it('spaces lines for about four to eight across the view', () => {
    expect(graticuleStep(1.5)).toBe(0.25);
    expect(graticuleStep(4)).toBe(0.5);
    expect(graticuleStep(40)).toBe(5);
    expect(graticuleStep(360)).toBe(30);
  });

  it('labels coordinates with their hemisphere', () => {
    expect(degreesLabel(27.5, 'lat')).toBe('27.5°N');
    expect(degreesLabel(-87.6, 'lon')).toBe('87.6°W');
    expect(degreesLabel(-64.25, 'lat')).toBe('64.25°S');
    expect(degreesLabel(0, 'lon')).toBe('0°');
  });
});
