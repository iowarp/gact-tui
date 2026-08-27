import type { Degradation } from '@clio/core/v3';

/** Preserve every server-reported limitation in its authoritative order. */
export function materialConnectionDegradations(
  degradations: readonly Degradation[],
): Degradation[] {
  return [...degradations];
}

/** Present the exact server-owned limitation instead of rewriting its meaning. */
export function connectionDegradationLabel(degradation: Degradation): string {
  return degradation.reason;
}
