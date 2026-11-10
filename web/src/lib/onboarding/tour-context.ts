import { createContext, useContext } from 'react';

export interface OnboardingTourControls {
  /** Start (or restart) the tour. Over Settings it waits until the window closes. */
  start: () => void;
  active: boolean;
}

export const OnboardingTourContext = createContext<OnboardingTourControls>({
  start: () => undefined,
  active: false,
});

export function useOnboardingTour(): OnboardingTourControls {
  return useContext(OnboardingTourContext);
}
