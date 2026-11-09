import { memo, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCommandKeyHeld, useKeyPlatform, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import type { ShortcutDefinition } from '@/lib/shortcuts/catalog';
import { detectHost, shortcutLabels, shortcutText } from '@/lib/shortcuts/registry';
import { cn } from '@/lib/utils';

/** One key cap: `Ctrl`, `⌘`, `L`. */
export function KeyCap({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      data-slot="key-cap"
      className={cn(
        'inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-[5px] border border-b-2 border-key-border bg-key px-1.5 font-mono text-[11px] leading-none font-normal whitespace-nowrap text-foreground',
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
              <KeyCap key={capIndex}>{cap}</KeyCap>
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
 * The badge a control shows while Ctrl (\u2318) is held: the rest of the key,
 * since the held key is already down. Place it inside the control; it takes no
 * space and is drawn above the dimmed page at the control's bottom edge.
 */
export function HeldKeyBadge({ id, className }: { id: string; className?: string }) {
  const held = useCommandKeyHeld();
  const platform = useKeyPlatform();
  const presentation = useShortcutPresentation(held ? id : undefined);
  const anchor = useRef<HTMLSpanElement>(null);
  const badge = useRef<HTMLSpanElement>(null);
  const definition = presentation?.definition;
  const text =
    definition && (!definition.host || definition.host === detectHost())
      ? heldKeyText(presentation.labels[0] ?? [], platform)
      : undefined;
  useLayoutEffect(() => {
    const control = anchor.current?.parentElement;
    const node = badge.current;
    if (!control || !node) return;
    const rect = control.getBoundingClientRect();
    if (!rect.width) {
      node.hidden = true;
      return;
    }
    node.style.left = `${Math.max(4, Math.min(window.innerWidth - 4, rect.left + rect.width / 2))}px`;
    node.style.top = `${Math.min(window.innerHeight - 10, rect.bottom)}px`;
  }, [text]);
  return (
    <span aria-hidden="true" className="hidden" ref={anchor}>
      {text
        ? createPortal(
            <span
              data-slot="held-key-badge"
              ref={badge}
              className={cn(
                'pointer-events-none fixed z-[91] -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-foreground px-[5px] py-[3px] font-mono text-[10.5px] leading-none font-semibold whitespace-nowrap text-background shadow-sm',
                className,
              )}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

/** A chord's caps without the held command key: `Shift O`, `\u21e7O`, `B`. */
function heldKeyText(caps: readonly string[], platform: 'mac' | 'windows'): string {
  const command = platform === 'mac' ? '\u2318' : 'Ctrl';
  const rest = caps.includes(command) ? caps.filter((cap) => cap !== command) : caps;
  return rest.join(platform === 'mac' ? '' : ' ');
}
