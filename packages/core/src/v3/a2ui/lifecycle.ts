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
  status: A2UIActionLifecycleStatus;
  reason?: string;
  occurred_at: string;
}
