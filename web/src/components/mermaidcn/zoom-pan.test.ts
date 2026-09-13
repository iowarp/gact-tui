import { describe, expect, it } from 'vitest';
import { fitAspectRatioViewport } from './zoom-pan';

describe('fitAspectRatioViewport', () => {
  it('uses the available height for a square image in a landscape stage', () => {
    expect(
      fitAspectRatioViewport({ height: 600, width: 900 }, { height: 1200, width: 1200 }),
    ).toEqual({ height: 600, width: 600 });
  });

  it('uses the available width for a landscape image', () => {
    expect(
      fitAspectRatioViewport({ height: 700, width: 800 }, { height: 900, width: 1600 }),
    ).toEqual({ height: 450, width: 800 });
  });

  it('preserves a portrait image ratio', () => {
    expect(
      fitAspectRatioViewport({ height: 600, width: 900 }, { height: 1600, width: 900 }),
    ).toEqual({ height: 600, width: 337.5 });
  });

  it('does not produce invalid geometry before either surface is measurable', () => {
    expect(
      fitAspectRatioViewport({ height: 0, width: 900 }, { height: 1200, width: 1200 }),
    ).toEqual({ height: 0, width: 0 });
  });
});
