/**
 * W3 Tier-1 — first-run onboarding tour.
 */
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { brand } from '@brand';
import {
  ONBOARDING_KEY,
  OnboardingTour,
  markOnboardingDone,
  shouldShowOnboarding,
} from '../../src/components/OnboardingTour.js';

afterEach(cleanup);

describe('onboarding gating', () => {
  beforeEach(() => localStorage.removeItem(ONBOARDING_KEY));

  it('shows on a fresh profile, never again after markOnboardingDone', () => {
    expect(shouldShowOnboarding()).toBe(true);
    markOnboardingDone();
    expect(shouldShowOnboarding()).toBe(false);
  });
});

describe('OnboardingTour', () => {
  it('walks through all steps and calls onFinish at the end', () => {
    let finished = false;
    render(() => (
      <OnboardingTour open={true} onFinish={() => (finished = true)} />
    ));
    expect(screen.getByTestId('onboarding-tour')).toBeTruthy();
    expect(screen.getByTestId('onboarding-title').textContent).toContain('Welcome');

    const next = screen.getByTestId('onboarding-next');
    // 5 steps total → 4 Next clicks reach the last, the 5th finishes.
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(screen.getByTestId('onboarding-next').textContent).toContain(`Start using ${brand.name}`);
    expect(finished).toBe(false);
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(finished).toBe(true);
  });

  it('Skip finishes immediately from any step', () => {
    let finished = false;
    render(() => (
      <OnboardingTour open={true} onFinish={() => (finished = true)} />
    ));
    fireEvent.click(screen.getByTestId('onboarding-skip'));
    expect(finished).toBe(true);
  });

  it('Back returns to the previous step', () => {
    render(() => <OnboardingTour open={true} onFinish={() => undefined} />);
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByTestId('onboarding-title').textContent).toContain('Ask anything');
    fireEvent.click(screen.getByTestId('onboarding-back'));
    expect(screen.getByTestId('onboarding-title').textContent).toContain('Welcome');
  });

  it('renders nothing when closed', () => {
    render(() => <OnboardingTour open={false} onFinish={() => undefined} />);
    expect(screen.queryByTestId('onboarding-tour')).toBeNull();
  });
});
