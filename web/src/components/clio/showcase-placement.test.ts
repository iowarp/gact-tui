import { describe, expect, it } from 'vitest';
import { showcaseGutter } from './showcase-placement';

describe('showcase free-space placement', () => {
  it('protects the larger composer edge and rejects crowded or short viewports', () => {
    const surface = { top: 40, bottom: 840, left: 240, right: 1920 };
    const transcript = { top: 40, bottom: 840, left: 570, right: 1466 };
    const composer = { top: 720, bottom: 824, left: 570, right: 1520 };
    const placement = showcaseGutter(surface, transcript, composer)!;
    expect(placement.left).toBeGreaterThan(transcript.right);
    expect(placement.left).toBeGreaterThan(composer.right);
    expect(placement.left + placement.width).toBeLessThan(surface.right);
    expect(placement.top).toBeGreaterThan(surface.top);
    expect(placement.top + placement.height).toBeLessThan(surface.bottom);
    expect(placement.height).toBe(776);
    expect(showcaseGutter({ ...surface, right: 1800 }, transcript, composer)).toBeUndefined();
    expect(showcaseGutter({ ...surface, bottom: 250 }, transcript, composer)).toBeUndefined();
  });
});
