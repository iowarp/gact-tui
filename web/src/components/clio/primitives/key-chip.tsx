import { memo } from 'react';
import { useCommandKeyHeld, useKeyPlatform, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import type { ShortcutDefinition } from '@/lib/shortcuts/catalog';
import { shortcutLabels, shortcutText } from '@/lib/shortcuts/registry';
import { cn } from '@/lib/utils';

export type KeyCapSize = 'md' | 'sm';

/** One key cap: `Ctrl`, `⌘`, `L`. `sm` is the menu footer's and search row's cap. */
export function KeyCap({
  children,
  size = 'md',
  className,
}: {
  children: string;
  size?: KeyCapSize;
  className?: string;
}) {
  return (
    <kbd
      data-slot="key-cap"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[5px] border border-b-2 border-key-border bg-key font-mono leading-none font-normal whitespace-nowrap text-foreground',
        size === 'sm'
          ? 'h-[18px] min-w-[18px] px-1 text-[10px]'
          : 'h-[22px] min-w-[22px] px-1.5 text-[11px]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export type ShortcutKeysVariant = 'caps' | 'text' | 'inline';

interface ShortcutKeysProps {
  /** A catalog id; the key follows the catalog everywhere it is shown. */
  id?: string;
  /** Ad hoc chords in Windows form, for a key that is not in the catalog. */
  keys?: readonly string[];
  /** Hand-written Mac chords for `keys`. */
  mac?: readonly string[];
  /**
   * `caps`: one cap per key (the shortcut sheet). `text`: one quiet line (a
   * menu's right column, a tooltip). `inline`: one small chip inside a button.
   */
  variant?: ShortcutKeysVariant;
  /** Cap size for `caps`. */
  capSize?: KeyCapSize;
  className?: string;
}

function adHoc(keys: readonly string[], mac?: readonly string[]): ShortcutDefinition {
  return { id: '', name: '', group: 'anywhere', keys, mac };
}

/**
 * A keyboard shortcut, shown in the platform's form: `Ctrl Shift L` on
 * Windows and Linux, `⇧⌘L` on a Mac. Renders nothing for an unknown id.
 */
export const ShortcutKeys = memo(function ShortcutKeys({
  id,
  keys,
  mac,
  variant = 'text',
  capSize,
  className,
}: ShortcutKeysProps) {
  const platform = useKeyPlatform();
  const presentation = useShortcutPresentation(id);
  const definition = presentation?.definition ?? (keys ? adHoc(keys, mac) : undefined);
  if (!definition) return null;
  if (variant === 'caps') {
    const chords = shortcutLabels(definition, platform);
    return (
      <span
        data-slot="shortcut-keys"
        className={cn('inline-flex shrink-0 items-center gap-1', className)}
      >
        {chords.map((caps, chordIndex) => (
          <span key={chordIndex} className="inline-flex items-center gap-1">
            {chordIndex > 0 && definition.joiner !== 'pair' ? (
              <span className="px-0.5 text-[11px] text-faint">or</span>
            ) : null}
            {caps.map((cap, capIndex) => (
              <KeyCap key={capIndex} size={capSize}>
                {cap}
              </KeyCap>
            ))}
          </span>
        ))}
      </span>
    );
  }
  const text = shortcutText(definition, platform);
  if (variant === 'inline') {
    return (
      <kbd
        data-slot="shortcut-keys"
        className={cn(
          'inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[4px] border border-key-border px-1 font-mono text-[10.5px] leading-none font-normal whitespace-nowrap opacity-90',
          className,
        )}
      >
        {text}
      </kbd>
    );
  }
  return (
    <kbd
      data-slot="shortcut-keys"
      className={cn(
        'shrink-0 font-sans text-[11.5px] font-normal whitespace-nowrap text-muted-foreground tabular-nums',
        className,
      )}
    >
      {text}
    </kbd>
  );
});

/**
 * The badge a control shows while Ctrl (⌘) is held: the whole key, ⌘
 * included. Place it inside a `relative` control; it does not take space.
 */
export function HeldKeyBadge({ id, className }: { id: string; className?: string }) {
  const held = useCommandKeyHeld();
  const presentation = useShortcutPresentation(held ? id : undefined);
  if (!presentation) return null;
  return (
    <span
      aria-hidden="true"
      data-slot="held-key-badge"
      className={cn(
        'pointer-events-none absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 translate-y-1/2 rounded-[4px] bg-foreground px-1 py-px font-mono text-[10.5px] leading-[14px] font-semibold whitespace-nowrap text-background shadow-sm',
        className,
      )}
    >
      {presentation.text}
    </span>
  );
}
