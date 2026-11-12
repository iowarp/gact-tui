import type { SourceProviderId } from '@clio/core/v3';

/**
 * Globus and NDP allow only their full horizontal artwork, at least 54 px wide
 * (Globus logo policy; NDP publishes no smaller mark). A list showing either one
 * widens its icon column to this width on every row, so names stay aligned.
 */
export const SOURCE_WORDMARK_WIDTH = 56;

export function sourceProviderUsesWordmark(provider: SourceProviderId): boolean {
  return provider === 'globus' || provider === 'ndp';
}
