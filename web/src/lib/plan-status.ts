import { t } from '@lingui/core/macro';

const STATUS: Record<string, string> = {
  draft: t`Draft, in plan mode`,
  approved: t`Approved, being worked on`,
  done: t`Done`,
  abandoned: t`Abandoned`,
};

/** The plan's status in words (never only a colour). */
export function planStatusLabel(status: string): string {
  return STATUS[status] ?? status;
}
