import { memo, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayContainer } from '@/components/ui/overlay-container';
import { useCommandKeyHeld, useKeyPlatform, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import type { ShortcutDefinition } from '@/lib/shortcuts/catalog';
import { heldShortcutText, shortcutLabels, shortcutText } from '@/lib/shortcuts/registry';
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

/** `top-edge` straddles the control's top edge, clear of text just above it (the composer). */
export type HeldKeySide = 'below' | 'above' | 'top-edge' | 'start' | 'inside-end' | 'cover';

const GAP = 4;
const EDGE = 4;
/** Badges on screen now, so a crowded toolbar staggers instead of overlapping. */
const placedBadges = new Map<symbol, DOMRect>();

function overlaps(a: DOMRect, b: DOMRect) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function placeBadge(control: Element, badge: HTMLElement, side: HeldKeySide, slot: symbol) {
  const target = control.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const centreX = target.left + target.width / 2;
  const centreY = target.top + target.height / 2;
  const hit =
    typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(centreX, centreY)
      : null;
  const shown =
    target.width > 0 &&
    target.height > 0 &&
    target.right > 0 &&
    target.bottom > 0 &&
    target.left < viewportWidth &&
    target.top < viewportHeight &&
    (!hit ||
      control.contains(hit) ||
      // A disabled control lets the point through to its own container.
      (hit.contains(control) && getComputedStyle(control).pointerEvents === 'none'));
  if (!shown) {
    badge.style.visibility = 'hidden';
    placedBadges.delete(slot);
    return;
  }
  const width = badge.offsetWidth;
  const height = badge.offsetHeight;
  let left = centreX - width / 2;
  let top = target.bottom + GAP;
  // Above or below flips when the window edge leaves no room.
  const roomAbove = target.top - height - GAP >= EDGE;
  const roomBelow = target.bottom + GAP + height <= viewportHeight - EDGE;
  let vertical = side;
  if (side === 'above' && !roomAbove && roomBelow) vertical = 'below';
  if (side === 'below' && !roomBelow && roomAbove) vertical = 'above';
  if (vertical === 'above') top = target.top - height - GAP;
  if (side === 'start') {
    left = target.left - width - GAP * 2;
    top = centreY - height / 2;
  }
  if (side === 'inside-end') {
    left = target.right - width - GAP * 1.5;
    top = centreY - height / 2;
  }
  if (side === 'cover') top = centreY - height / 2;
  if (side === 'top-edge') top = target.top - height / 2;
  const clamp = () => {
    left = Math.min(Math.max(left, EDGE), viewportWidth - width - EDGE);
    top = Math.min(Math.max(top, EDGE), viewportHeight - height - EDGE);
  };
  clamp();
  const others = [...placedBadges].filter(([key]) => key !== slot).map(([, rect]) => rect);
  for (let step = 0; step < 4; step += 1) {
    const rect = new DOMRect(left, top, width, height);
    if (!others.some((other) => overlaps(rect, other))) break;
    if (vertical === 'above' || vertical === 'top-edge') top -= height + 2;
    else if (vertical === 'below' || vertical === 'cover') top += height + 2;
    else left -= width + 2;
    clamp();
  }
  placedBadges.set(slot, new DOMRect(left, top, width, height));
  badge.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  badge.style.visibility = 'visible';
}

interface HeldKeyBadgeProps {
  /** A catalog id. */
  id?: string;
  /** Ad hoc keys in Windows form, for a key outside the catalog (an ask card's `1`). */
  keys?: readonly string[];
  /** One key of a range shortcut. */
  position?: number;
  /** The other half of a pair, joined into one badge (`Alt ??`). */
  pairId?: string;
  /** Where it sits against the control: under it (default), over it, to its left, inside its right end, or on it. */
  side?: HeldKeySide;
  className?: string;
}

/**
 * The badge a control shows while Ctrl (?) is held: on Windows the key
 * without the held Ctrl (`?B`), on a Mac the whole key (`??B`). Place it
 * inside the control; it takes no space, floats above every clip and stays in
 * the window.
 */
export function HeldKeyBadge({
  id,
  keys,
  position,
  pairId,
  side = 'below',
  className,
}: HeldKeyBadgeProps) {
  const held = useCommandKeyHeld();
  const platform = useKeyPlatform();
  const presentation = useShortcutPresentation(held ? id : undefined, position);
  const pair = useShortcutPresentation(held ? pairId : undefined);
  const container = useOverlayContainer();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const [slot] = useState(() => Symbol('held-key-badge'));
  const definition = presentation?.definition ?? (held && keys ? adHoc(keys) : undefined);
  const text = definition ? heldShortcutText(definition, platform, pair?.definition) : undefined;
  useLayoutEffect(() => {
    const control = anchorRef.current?.parentElement;
    const badge = badgeRef.current;
    if (!text || !control || !badge) return undefined;
    placeBadge(control, badge, side, slot);
    return () => {
      placedBadges.delete(slot);
    };
  }, [text, side, slot]);
  if (!text) return null;
  return (
    <>
      <span ref={anchorRef} hidden />
      {createPortal(
        <span
          ref={badgeRef}
          aria-hidden="true"
          data-slot="held-key-badge"
          data-side={side}
          style={{ visibility: 'hidden' }}
          className={cn(
            'pointer-events-none fixed top-0 left-0 z-[61] rounded-[4px] bg-foreground px-[5px] py-[3px] font-mono text-[10.5px] leading-none font-semibold whitespace-nowrap text-background shadow-sm',
            className,
          )}
        >
          {text}
        </span>,
        container ?? document.body,
      )}
    </>
  );
}

/**
 * While Ctrl (?) is held the app dims behind its key badges. Mount once.
 */
export function HeldKeysScrim() {
  const held = useCommandKeyHeld();
  const container = useOverlayContainer();
  if (!held) return null;
  return createPortal(
    <div
      aria-hidden="true"
      data-slot="held-keys-scrim"
      className="pointer-events-none fixed inset-0 z-[60] bg-scrim motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-100"
    />,
    container ?? document.body,
  );
}
