import type { Session } from '@clio/core/v3';
import { sessionInteractionAt } from '@/lib/recent-sessions';
import { t } from '@lingui/core/macro';

/** A day bucket's stable id; `DAY_LABEL_TEXT` words it for display. */
export type DayLabel = 'Today' | 'Yesterday' | 'Past week' | 'Older';

/** What a day bucket reads as in the interface language. */
export const DAY_LABEL_TEXT: Record<DayLabel, string> = {
  Today: t`Today`,
  Yesterday: t`Yesterday`,
  'Past week': t`Past week`,
  Older: t`Older`,
};

/** The calendar-day bucket a conversation's last activity falls in. */
export function conversationDay(iso: string, now = new Date()): DayLabel {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'Older';
  const day = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset).getTime();
  if (at >= day(0)) return 'Today';
  if (at >= day(1)) return 'Yesterday';
  // i18n-ignore: day bucket id, worded by DAY_LABEL_TEXT
  if (at >= day(6)) return 'Past week';
  return 'Older';
}

/** Splits nested rows into day groups; a fork stays in its parent's group. */
export function groupConversationsByDay<T extends Session>(
  rows: readonly { session: T; depth: number }[],
  now = new Date(),
): { label: DayLabel; rows: { session: T; depth: number }[] }[] {
  const groups = new Map<DayLabel, { session: T; depth: number }[]>();
  let current: DayLabel = 'Today';
  for (const row of rows) {
    if (row.depth === 0) current = conversationDay(sessionInteractionAt(row.session), now);
    const group = groups.get(current);
    if (group) group.push(row);
    else groups.set(current, [row]);
  }
  return [...groups].map(([label, grouped]) => ({ label, rows: grouped }));
}
