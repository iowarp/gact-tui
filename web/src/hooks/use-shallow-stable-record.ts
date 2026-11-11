import { useState } from 'react';

function sameEntries<T>(left: Readonly<Record<string, T>>, right: Readonly<Record<string, T>>) {
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(right, key) || !Object.is(left[key], right[key])) return false;
  }
  return true;
}

/**
 * Keep a record's identity while its entries are the same objects. A merged
 * entity map rebuilt for an unrelated change (a session-list refresh during
 * streaming) would otherwise invalidate every memoized transcript row.
 * Adjust-state-during-render, not a ref.
 */
export function useShallowStableRecord<T>(
  value: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> {
  const [stable, setStable] = useState(value);
  if (value === stable || sameEntries(value, stable)) return stable;
  setStable(value);
  return value;
}
