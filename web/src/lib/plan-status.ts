import { t } from '@lingui/core/macro';

/** The plan's status in words (never only a colour). */
export function planStatusLabel(status: string): string {
  if (status === 'draft') return t`Draft, in plan mode`;
  if (status === 'approved') return t`Approved, being worked on`;
  if (status === 'active') return t`Being worked on`;
  if (status === 'done') return t`Done`;
  if (status === 'abandoned') return t`Abandoned`;
  return status;
}

type PlanOrigin = 'plan_mode' | 'outside_plan_mode';

/**
 * The plan's name as a person reads it: its first Markdown heading (code marks kept for
 * inline code), else the file's name. Never the slug when the plan names itself.
 */
export function planDocumentTitle(text: string | undefined, path?: string): string | undefined {
  const heading = /^#{1,3}\s+(.+?)\s*#*\s*$/mu.exec(text ?? '')?.[1]?.trim();
  if (heading) return heading;
  const file = path?.split(/[\\/]/).pop();
  return file || undefined;
}

/**
 * Where the plan document came from: plan mode (a planning phase) or written without it.
 * The status reads beside it, once, so this never repeats it. Null when neither the plan
 * nor its status says, rather than guessing.
 */
export function planOriginLabel(plan: { status: string; origin?: PlanOrigin }): string | null {
  const origin =
    plan.origin ??
    (plan.status === 'draft' || plan.status === 'approved'
      ? 'plan_mode'
      : plan.status === 'active'
        ? 'outside_plan_mode'
        : undefined);
  if (origin === 'plan_mode') return t`Written in plan mode.`;
  if (origin === 'outside_plan_mode')
    return t`Written by the agent without plan mode. Nobody approved it.`;
  return null;
}
