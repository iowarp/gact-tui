/**
 * Single switch for the onboarding tour: the fresh-install launch and the
 * Settings "Replay tutorial" row. The step copy in `tour-script.ts` is final
 * and every step was checked against the lifted interface, so it ships on.
 * Set it to `false` only to hold the tour back from a release.
 *
 * `VITE_CLIO_ONBOARDING_TOUR=1` forces it on in a local build when this is off.
 */
const ONBOARDING_TOUR_RELEASED = true;

export const ONBOARDING_TOUR_ENABLED =
  ONBOARDING_TOUR_RELEASED || import.meta.env.VITE_CLIO_ONBOARDING_TOUR === '1';
