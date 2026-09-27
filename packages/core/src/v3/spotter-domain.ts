import { z } from 'zod';

/**
 * Whether the connected service can arm SPOTTER review (`spotter-ai`) for a
 * session or workspace, and if not, the typed reason and what to enable.
 *
 * Served by clio-agent's `GET /v1/spotter/availability`, from the same check
 * that refuses the transition with a 422 — so a picker that honours it never
 * offers a choice the service would refuse.
 */
export interface SpotterAvailability {
  available: boolean;
  /** Stable reason code; empty when available. */
  reason: string;
  /** What is wrong, operator-facing. */
  message: string;
  /** What to enable or fix, operator-facing. */
  remedy: string;
}

export const spotterAvailabilitySchema = z
  .object({
    available: z.boolean(),
    reason: z.string().default(''),
    message: z.string().default(''),
    remedy: z.string().default(''),
  })
  .passthrough()
  .transform(
    (value): SpotterAvailability => ({
      available: value.available,
      reason: value.reason,
      message: value.message,
      remedy: value.remedy,
    }),
  );
