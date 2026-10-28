import type { AttentionProfile } from '@clio/core/v3';

/**
 * The SPOTTER semantics (spotter-ai-genesis/experiments `attn_analytics.py`):
 * an item scores `sum_i 0.5^i * val_all_max[step_i]`, weights unnormalized,
 * blocks take their max token. clio-agent's default profile.
 */
export const SPOTTER_PROFILE = {
  name: 'attn-analytics',
  metric: 'max',
  weighting: 'exponential',
  direction: 'forward',
  decay_base: 0.5,
  weight_normalization: 'none',
  block_reduction: 'max',
  display_scaling: 'max',
} as const satisfies Partial<AttentionProfile>;
