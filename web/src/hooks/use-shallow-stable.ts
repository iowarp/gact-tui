import { useState } from 'react';

/**
 * The previous record while every entry is the same, so a record rebuilt on
 * each render (a spread of two sources) does not re-render a memoized child.
 */
export function useShallowStable<Value extends object | undefined>(value: Value): Value {
  const [box] = useState(() => ({ value }));
  if (!sameEntries(box.value, value)) {
    // oxlint-disable-next-line react/immutability -- an idempotent per-mount cache of the last distinct value.
    box.value = value;
  }
  return box.value;
}

function sameEntries(a: object | undefined, b: object | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key])
  );
}
