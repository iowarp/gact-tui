/**
 * Single switch for the onboarding tour: the fresh-install launch and the
 * Settings "Replay tutorial" row. It is off for releases while the step copy in
 * `tour-script.ts` is a draft. Turn it on once the copy is final.
 *
 * `VITE_CLIO_ONBOARDING_TOUR=1` forces it on in a local build when this is off.
 */
const ONBOARDING_TOUR_RELEASED = false;

export const ONBOARDING_TOUR_ENABLED =
  ONBOARDING_TOUR_RELEASED || import.meta.env.VITE_CLIO_ONBOARDING_TOUR === '1';
