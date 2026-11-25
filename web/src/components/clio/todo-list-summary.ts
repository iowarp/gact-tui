import { ph, t } from '@lingui/core/macro';

/** How far the todo list is: one wording and one number wherever todos are counted. */
export function todoProgressSummary<T>(
  items: readonly T[],
  status: (item: T) => string | undefined,
): string {
  const done = items.filter((item) => status(item) === 'completed').length;
  return t`${ph({ done })} of ${ph({ total: items.length })} done`;
}
