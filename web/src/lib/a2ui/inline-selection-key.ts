import { isSelectionValue, type SelectionValue } from '@/components/clio/selection-state';

/** A shared identity for inline views that contain the same unique entities in any order. */
export function inlineSelectionKey(values: readonly unknown[]): string | undefined {
  if (values.length < 2 || values.length > 10_000 || !values.every(isSelectionValue)) {
    return undefined;
  }
  const encoded = (values as SelectionValue[])
    .map((value) => `${typeof value === 'number' ? 'n' : 's'}:${String(value)}`)
    .sort();
  if (encoded.some((value, index) => index > 0 && value === encoded[index - 1])) {
    return undefined;
  }
  return `inline:${JSON.stringify(encoded)}`;
}
