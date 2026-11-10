// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import {
  observabilityViewStorageKey,
  restoredObservabilityView,
} from './observability-view-storage';

afterEach(() => localStorage.clear());

it('restores a stored view and sends retired or unknown views to the timeline', () => {
  const restore = (stored: string) => {
    localStorage.setItem(observabilityViewStorageKey('session'), stored);
    return restoredObservabilityView('session');
  };
  expect(restore('context')).toBe('context');
  expect(restore('relationships')).toBe('relationships');
  expect(restore('activity')).toBe('activity');
  for (const retired of ['work', 'evidence', 'unknown']) expect(restore(retired)).toBe('activity');
  expect(restoredObservabilityView(undefined)).toBe('activity');
});
