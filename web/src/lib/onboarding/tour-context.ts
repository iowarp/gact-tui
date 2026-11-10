import { createContext, useContext } from 'react';

export interface OnboardingTourControls {
  /** Start (or restart) the tour. Over Settings it waits until the window closes. */
  start: () => void;
  active: boolean;
  /**
   * The tour is running, about to start, or a fresh install is still being
   * checked: other first-run prompts (notifications) wait, so nothing covers it.
   */
  holdPrompts: boolean;
}

export const OnboardingTourContext = createContext<OnboardingTourControls>({
  start: () => undefined,
  active: false,
  holdPrompts: false,
});

export function useOnboardingTour(): OnboardingTourControls {
  return useContext(OnboardingTourContext);
}
