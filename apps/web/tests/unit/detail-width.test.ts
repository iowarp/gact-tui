/**
 * The right detail column's width model (owner defect 4): drag-resizable
 * within the prototype's [320, 720] band, default 480. The clamp is pure so
 * pointer math can never push a bad width into a CSS style.
 */
import { describe, expect, it } from 'vitest';
import {
  clampDetailWidth,
  DETAIL_WIDTH_DEFAULT,
  DETAIL_WIDTH_MAX,
  DETAIL_WIDTH_MIN,
} from '../../src/shell/detailWidth';

describe('clampDetailWidth', () => {
  it('carries the prototype constants', () => {
    expect(DETAIL_WIDTH_MIN).toBe(320);
    expect(DETAIL_WIDTH_MAX).toBe(720);
    expect(DETAIL_WIDTH_DEFAULT).toBe(480);
  });

  it('passes an in-band width through unchanged', () => {
    expect(clampDetailWidth(480)).toBe(480);
    expect(clampDetailWidth(320)).toBe(320);
    expect(clampDetailWidth(720)).toBe(720);
  });

  it('clamps below the band to the minimum', () => {
    expect(clampDetailWidth(319)).toBe(320);
    expect(clampDetailWidth(0)).toBe(320);
    expect(clampDetailWidth(-500)).toBe(320);
  });

  it('clamps above the band to the maximum', () => {
    expect(clampDetailWidth(721)).toBe(720);
    expect(clampDetailWidth(10_000)).toBe(720);
  });

  it('resolves non-finite pointer math to the default, never NaN-in-CSS', () => {
    expect(clampDetailWidth(Number.NaN)).toBe(DETAIL_WIDTH_DEFAULT);
    expect(clampDetailWidth(Number.POSITIVE_INFINITY)).toBe(DETAIL_WIDTH_DEFAULT);
    expect(clampDetailWidth(Number.NEGATIVE_INFINITY)).toBe(DETAIL_WIDTH_DEFAULT);
  });
});
