import { describe, expect, it } from 'vitest';
import { degreesLabel, graticuleStep, withoutOverlaps } from './layered-map-graticule';

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

  it('draws a name only where it does not cover one already drawn', () => {
    // Nine stations 20 px apart on one line (the O17 plan's section A): names collide.
    const row = Array.from({ length: 9 }, (_, i) => ({
      key: `A${i + 1}`,
      text: `A${i + 1}`,
      x: 100 + 20 * i,
      y: 50,
    }));
    const kept = withoutOverlaps(row);
    expect(kept.length).toBeGreaterThan(1);
    expect(kept.length).toBeLessThan(9);
    expect(kept[0]!.key).toBe('A1');
    // A name on another line is kept.
    expect(withoutOverlaps([...row, { key: 'B5', text: 'B5', x: 100, y: 90 }]).at(-1)!.key).toBe(
      'B5',
    );
  });
});
