import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ShortcutKeys } from './key-chip';

export interface PickerHint {
  /** The word before the key: "Open", "Close", "Change type". */
  label: string;
  /** A catalog id; the key follows the catalog and the platform. */
  shortcut: string;
  /** Makes the hint a button that does the same as its key. */
  onSelect?: () => void;
  disabled?: boolean;
  /** Dropped first when the picker is narrow. */
  optional?: boolean;
  /** Shown only on a wide picker (48rem); dropped before any other hint. */
  wide?: boolean;
  /** Sits at the right edge, apart from the hints before it ("Ask"). */
  end?: boolean;
  /** Draws the word in the accent tone: an action this list offers now ("All in Settings"). */
  accent?: boolean;
}

interface PickerFooterProps {
  hints: readonly PickerHint[];
  /** Left of the hints: a provider's state, a reload action. */
  start?: ReactNode;
  /** Right edge: a hidden-items count. */
  end?: ReactNode;
  /** `start`: the hints lead the line (a narrow picker), `end` stays free. */
  hintsAlign?: 'start' | 'end';
  /**
   * Below a 30rem footer the hints keep only their keys (the word stays for
   * assistive tech), so a footer that also holds `start` and `end` shows its
   * last hint whole instead of clipping it.
   */
  keysOnlyNarrow?: boolean;
  className?: string;
}

/**
 * The one-line footer every picker ends with: a word, then its key. It
 * never wraps; optional hints drop out below a 28rem picker, and any hint
 * that still doesn't fit drops from the end.
 */
export const PickerFooter = memo(function PickerFooter({
  hints,
  start,
  end,
  hintsAlign = 'end',
  keysOnlyNarrow = false,
  className,
}: PickerFooterProps) {
  return (
    <div
      className={cn(
        '@container flex h-8 min-w-0 shrink-0 items-center gap-3 overflow-hidden border-t px-3 text-[11.5px] whitespace-nowrap text-muted-foreground',
        className,
      )}
      data-slot="picker-footer"
    >
      {start}
      {/* One line tall: hints that don't fit wrap out of sight, never under `end`. */}
      <span
        className={cn(
          'flex h-5 min-w-0 flex-wrap items-center gap-x-3 gap-y-4 overflow-hidden',
          hintsAlign === 'start' || hints.some((hint) => hint.end)
            ? 'flex-1'
            : 'ml-auto justify-end',
        )}
      >
        {hints.map((hint) => {
          const content = (
            <>
              <span
                className={cn(
                  hint.accent && 'text-accent-foreground',
                  keysOnlyNarrow && '@max-[30rem]:sr-only',
                )}
              >
                {hint.label}
              </span>{' '}
              <ShortcutKeys id={hint.shortcut} variant="inline" />
            </>
          );
          const visibility = cn(
            hint.wide
              ? 'hidden @[48rem]:inline-flex'
              : hint.optional
                ? 'hidden @[28rem]:inline-flex'
                : 'inline-flex',
            hint.end && 'ml-auto',
          );
          return hint.onSelect ? (
            <button
              className={cn(
                visibility,
                'shrink-0 items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
              )}
              disabled={hint.disabled}
              key={hint.label}
              onClick={hint.onSelect}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              {content}
            </button>
          ) : (
            <span className={cn(visibility, 'shrink-0 items-center gap-1')} key={hint.label}>
              {content}
            </span>
          );
        })}
      </span>
      {end}
    </div>
  );
});
