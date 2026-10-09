import { describe, expect, it } from 'vitest';
import { sessionSectionHeights } from './session-section-layout';

const expanded = (height: number) => ({ height, collapsed: false });

describe('Session column allocation', () => {
  it('gives an enabled section the entire column when it is the only view', () => {
    expect(sessionSectionHeights(800, expanded(200), undefined)).toEqual({ data: 800 });
    expect(sessionSectionHeights(800, undefined, expanded(200))).toEqual({ work: 800 });
  });
  it('fits sparse inventories to their contents with room between their anchors', () => {
    expect(sessionSectionHeights(800, expanded(180), expanded(220))).toEqual({
      data: 180,
      work: 220,
    });
  });
  it('shares the height between two dense inventories', () => {
    expect(sessionSectionHeights(800, expanded(1000), expanded(1000))).toEqual({
      data: 394,
      work: 394,
    });
  });
  it('lends the space not needed by an empty Data inventory to Work', () => {
    expect(sessionSectionHeights(800, expanded(80), expanded(1000))).toEqual({
      data: 80,
      work: 708,
    });
  });
  it('reclaims the collapsed view while keeping its header reachable', () => {
    expect(sessionSectionHeights(800, { height: 36, collapsed: true }, expanded(1000))).toEqual({
      data: 36,
      work: 752,
    });
    expect(sessionSectionHeights(800, expanded(1000), { height: 36, collapsed: true })).toEqual({
      data: 752,
      work: 36,
    });
    expect(sessionSectionHeights(800, undefined, { height: 36, collapsed: true })).toEqual({
      work: 36,
    });
  });
  it('does not produce negative allocations in a disappearing gutter', () => {
    expect(sessionSectionHeights(0, expanded(100), expanded(100))).toEqual({ data: 0, work: 0 });
    expect(sessionSectionHeights(-1, expanded(100), undefined)).toEqual({ data: 0 });
  });
});
