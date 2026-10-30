/** Exact phrase matches tolerate rendered whitespace, without treating input as a regex. */
export function searchMatchRanges(
  text: string,
  query: string,
  partial = true,
): Array<[number, number]> {
  const words = query.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return [];
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  const matches = Array.from(text.matchAll(new RegExp(escaped.join('\\s+'), 'giu')));
  if (matches.length) return matches.map((match) => [match.index, match.index + match[0].length]);
  if (!partial) return [];
  const terms = [...new Set(escaped)].sort((left, right) => right.length - left.length);
  return Array.from(text.matchAll(new RegExp(terms.join('|'), 'giu'))).map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
}

export interface FileSearchLocation {
  workspaceId?: string;
  line?: number;
  find?: string;
  /** HDF5 only: the object to open the viewer on, e.g. `/entry/data`. */
  locator?: string;
}

/** Keep the destination's source identities and search text in the message hash. */
export function messageSearchHash(messageId: string, partId?: string, find?: string): string {
  const query = new URLSearchParams();
  if (partId) query.set('part', partId);
  if (find) query.set('find', find);
  return `#message-${encodeURIComponent(messageId)}${query.size ? `?${query}` : ''}`;
}
