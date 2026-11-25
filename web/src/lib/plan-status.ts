import { t } from '@lingui/core/macro';

const STATUS: Record<string, string> = {
  draft: t`Draft, in plan mode`,
  approved: t`Approved, being worked on`,
  active: t`Being worked on`,
  done: t`Done`,
  abandoned: t`Abandoned`,
};

/** The plan's status in words (never only a colour). */
export function planStatusLabel(status: string): string {
  return STATUS[status] ?? status;
}

/** Where the plan came from: a planning session the person approves, or the agent's own. */
export function planOriginLabel(status: string): string {
  if (status === 'draft') return t`Written in plan mode. It waits for your approval.`;
  if (status === 'approved') return t`Written in plan mode and approved by you.`;
  if (status === 'active')
    return t`The agent's own working plan for this conversation. It came from no planning session and nobody approved it.`;
  return t`The plan the agent kept for this conversation.`;
}
