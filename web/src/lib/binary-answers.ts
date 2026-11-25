import { t } from '@lingui/core/macro';

/**
 * Which asks are binary: two answers, one of them the way out (No, Decline, Deny, Cancel…).
 * Every such ask renders through `BinaryAsk`, whose two answers are its buttons.
 */

export interface BinaryOption<V> {
  value: V;
  label: string;
}

export interface BinaryPair<O> {
  accept: O;
  decline: O;
}

// Matched on the option's value and its label, in English: producers send their wire values
// in English even when the label is translated.
const DECLINE =
  /^(no|nope|false|decline[ds]?|deny|denied|reject(ed)?|refuse[ds]?|cancel(led)?|abort|stop|skip|dismiss|disallow|not now|don'?t|do not|never)\b/iu;

function declines(option: BinaryOption<unknown>): boolean {
  return DECLINE.test(String(option.value).trim()) || DECLINE.test(option.label.trim());
}

/** Two options where exactly one declines: the other accepts. Otherwise not binary. */
export function binaryPair<O extends BinaryOption<unknown>>(
  options: readonly O[],
): BinaryPair<O> | undefined {
  if (options.length !== 2) return undefined;
  const [first, second] = options as [O, O];
  const firstDeclines = declines(first);
  const secondDeclines = declines(second);
  if (firstDeclines === secondDeclines) return undefined;
  return firstDeclines ? { accept: second, decline: first } : { accept: first, decline: second };
}

/**
 * A producer's stock answer word ("Approve", "Decline") in the interface language.
 * Only the label changes; the value sent back is the producer's own.
 */
export function answerWord(label: string): string {
  switch (label.trim().toLocaleLowerCase('en')) {
    case 'approve':
      return t({ message: 'Approve', context: 'answer to an ask' });
    case 'decline':
      return t({ message: 'Decline', context: 'answer to an ask' });
    case 'allow':
      return t({ message: 'Allow', context: 'answer to an ask' });
    case 'deny':
      return t({ message: 'Deny', context: 'answer to an ask' });
    case 'yes':
      return t({ message: 'Yes', context: 'answer to an ask' });
    case 'no':
      return t({ message: 'No', context: 'answer to an ask' });
    case 'accept':
      return t({ message: 'Accept', context: 'answer to an ask' });
    case 'reject':
      return t({ message: 'Reject', context: 'answer to an ask' });
    case 'cancel':
      return t({ message: 'Cancel', context: 'answer to an ask' });
    case 'continue':
      return t({ message: 'Continue', context: 'answer to an ask' });
    case 'skip':
      return t({ message: 'Skip', context: 'answer to an ask' });
    default:
      return label;
  }
}
