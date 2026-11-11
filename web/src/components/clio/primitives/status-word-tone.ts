import type { StatusTone } from './status-indicator';

/** The word itself carries an error or warning (the spec's .xst.err / .xst.warn); others stay muted. */
const WORD_TONE: Partial<Record<StatusTone, string>> = {
  error: 'text-destructive-text',
  warning: 'text-warning',
};

/** The status word's colour for a tone, or undefined when it stays muted. */
export function statusWordClass(tone: StatusTone): string | undefined {
  return WORD_TONE[tone];
}
