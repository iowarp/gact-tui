import { describe, expect, it } from 'vitest';
import {
  buildOnboardingSteps,
  createTourSteps,
  markOnboardingDone,
  ONBOARDING_KEY,
  shouldShowOnboarding,
} from '../../src/components/OnboardingTourModel.js';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
}

describe('OnboardingTourModel', () => {
  it('uses storage to decide whether onboarding should show', () => {
    const storage = memoryStorage();
    expect(shouldShowOnboarding(storage)).toBe(true);
    markOnboardingDone(storage);
    expect(storage.getItem(ONBOARDING_KEY)).toBe('1');
    expect(shouldShowOnboarding(storage)).toBe(false);
  });

  it('builds brand-aware default steps', () => {
    const steps = createTourSteps('Clio', true);
    expect(steps.map((step) => step.id)).toEqual([
      'welcome',
      'composer',
      'sessions',
      'rail',
      'palette',
    ]);
    expect(steps[0]!.title).toBe('Welcome to Clio Desktop');
    expect(steps[2]!.body).toContain('Clio TUI');
  });

  it('inserts provider setup immediately after welcome when a client exists', () => {
    const baseSteps = createTourSteps('Clio', false);
    expect(buildOnboardingSteps(false, baseSteps).map((step) => step.id)).toEqual([
      'welcome',
      'composer',
      'sessions',
      'rail',
      'palette',
    ]);
    expect(buildOnboardingSteps(true, baseSteps).map((step) => step.id)).toEqual([
      'welcome',
      'provider-setup',
      'composer',
      'sessions',
      'rail',
      'palette',
    ]);
  });
});
