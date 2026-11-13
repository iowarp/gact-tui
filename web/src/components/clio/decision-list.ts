import { t } from '@lingui/core/macro';

/**
 * A short list in the interface language: "a, b, c" (Japanese "a、b、c"). It uses
 * the shared list message; switch to `formatList` from `@/lib/locale-format` once
 * that lands.
 */
export function decisionList(items: readonly string[]): string {
  return items.length
    ? items.reduce((list, item) =>
        t({ message: `${list}, ${item}`, comment: 'A short list, one more item' }),
      )
    : '';
}
