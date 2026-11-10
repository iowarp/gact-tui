// Building a formatter is costly; every row's hover time shares this one.
const FULL = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** "Nov 9, 2026, 3:04 PM": the full local time a compact label stands for. */
export function formatFullTimestamp(time: Date): string {
  return FULL.format(time);
}
