import { describe, expect, it } from 'vitest';
import {
  buildTourCalloutStyle,
  buildTourRingStyle,
  type TourRect,
} from '../../src/components/OnboardingTourController.js';

const rect: TourRect = {
  left: 100,
  right: 220,
  top: 180,
  bottom: 240,
  width: 120,
  height: 60,
};

describe('OnboardingTourController', () => {
  it('positions callouts relative to target rects', () => {
    expect(buildTourCalloutStyle(rect, 'right', { width: 1000, height: 800 })).toEqual({
      left: '236px',
      top: '100px',
    });
    expect(buildTourCalloutStyle(rect, 'top', { width: 1000, height: 800 })).toEqual({
      left: '24px',
      top: '24px',
    });
    expect(buildTourCalloutStyle(rect, 'bottom', { width: 1000, height: 800 })).toEqual({
      left: '24px',
      top: '256px',
    });
  });

  it('centers missing or explicit center targets', () => {
    expect(buildTourCalloutStyle(null, 'right', { width: 1000, height: 800 })).toEqual({});
    expect(buildTourCalloutStyle(rect, 'center', { width: 1000, height: 800 })).toEqual({});
  });

  it('builds the spotlight ring style', () => {
    expect(buildTourRingStyle(null)).toEqual({ display: 'none' });
    expect(buildTourRingStyle(rect)).toEqual({
      left: '94px',
      top: '174px',
      width: '132px',
      height: '72px',
    });
  });
});
