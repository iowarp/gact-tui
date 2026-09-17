import { z } from 'zod';
import { forwardCompatibleEnum } from '../schema-utils.js';

/**
 * Server-truth stages for one surface's most recent action, from the
 * `a2ui.action.received|delivered|consumed|failed|duplicate` events
 * (dispatcher slice S5, `docs/design/a2ui-compat-campaign-2026-09.md`). The
 * footer (`web/src/components/clio/a2ui-action-lifecycle.tsx`) renders words
 * for each of these — never a dot or colour alone.
 */
export type A2UIActionLifecycleStatus =
  | 'received'
  | 'delivered'
  | 'consumed'
  | 'failed'
  | 'duplicate'
  | 'unknown';

export interface A2UIActionLifecycle {
  surface_id: string;
  action_name: string;
  source_component_id?: string;
  action_id?: string;
  status: A2UIActionLifecycleStatus;
  reason?: string;
  occurred_at: string;
}

/**
 * Lenient by design: the live server publishes
 * `{surface_id, action, source_component_id}` today; S5's declared superset
 * adds `action_name` (either name is accepted and normalized to
 * `action_name`), `action_id`, `state`, and `delivery`. Any other unknown key
 * is silently dropped (plain `z.object`, not `.strict()`) and a payload
 * missing BOTH `action_name` and `action` fails `.safeParse` rather than
 * throwing, so the reducer can skip it without a `frame_decode_failed` gap —
 * a lifecycle event is best-effort UI, never load-bearing state.
 */
export const a2uiActionLifecycleSchema = z
  .object({
    surface_id: z.string(),
    action_name: z.string().optional(),
    action: z.string().optional(),
    source_component_id: z.string().optional(),
    action_id: z.string().optional(),
    state: z.string().optional(),
    delivery: z.unknown().optional(),
    status: forwardCompatibleEnum(['received', 'delivered', 'consumed', 'failed', 'duplicate']),
    reason: z.string().optional(),
    occurred_at: z.string(),
  })
  .refine((value) => value.action_name !== undefined || value.action !== undefined, {
    message: 'a2ui action lifecycle payload needs action_name or action',
    path: ['action_name'],
  })
  .transform((value) => ({
    surface_id: value.surface_id,
    action_name: (value.action_name ?? value.action)!,
    source_component_id: value.source_component_id,
    action_id: value.action_id,
    status: value.status,
    reason: value.reason,
    occurred_at: value.occurred_at,
  }));
