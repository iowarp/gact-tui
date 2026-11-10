import { memo, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayContainer } from '@/components/ui/overlay-container';
import { useCommandKeyHeld, useKeyPlatform, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import type { ShortcutDefinition } from '@/lib/shortcuts/catalog';
import {
  heldShortcutText,
  shortcutChords,
  shortcutLabels,
  shortcutText,
} from '@/lib/shortcuts/registry';
import { cn } from '@/lib/utils';

export type KeyCapSize = 'md' | 'row' | 'sm';

/**
 * One key cap: `Ctrl`, `⌘`, `L`. `row` is the ↵ on a menu's highlighted row
 * (the spec's `.lr .ret .kk`); `sm` is the menu footer's and search row's cap.
 */
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
          : size === 'row'
            ? 'h-5 min-w-5 px-1.5 text-[11px]'
            : 'h-[22px] min-w-[22px] px-1.5 text-[11px]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export type ShortcutKeysVariant = 'caps' | 'text' | 'inline' | 'row' | 'menu';

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
   * `row`: one full cap at the end of a menu's highlighted row. `menu`: a menu's
   * key column, 10.5px mono and faint (workbench-keyboard, "Menus show the key").
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
  // A key this platform leaves to the OS (`mac: []`) shows nothing.
  if (!definition || !shortcutChords(definition, platform).length) return null;
  if (variant === 'caps') {
    const labels = shortcutLabels(definition, platform);
    // A `cap` pair of single keys reads as one cap, as the spec's `↑↓`.
    const chords = definition.joiner === 'cap' ? [[labels.flat().join('')]] : labels;
    return (
      <span
        data-slot="shortcut-keys"
        className={cn('inline-flex shrink-0 items-center gap-1', className)}
      >
        {chords.map((caps, chordIndex) => (
          <span key={chordIndex} className="inline-flex items-center gap-1">
            {chordIndex > 0 && (definition.joiner ?? 'or') === 'or' ? (
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
  if (variant === 'menu') {
    return (
      <kbd
        data-slot="shortcut-keys"
        className={cn(
          'shrink-0 font-mono text-[10.5px] font-normal whitespace-nowrap text-faint',
          className,
        )}
      >
        {text}
      </kbd>
    );
  }
  if (variant === 'row') {
    return (
      <KeyCap size="row" className={className}>
        {text}
      </KeyCap>
    );
  }
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
 * `top-edge` straddles the control's top edge, clear of text just above it (the composer).
 * `start` sits left of the control unless another small control is there (a rail beside a
 * toolbar); then it covers its own control. `under-icon` sits just under the control's
 * icon, centred on it, inside a tight column (the pocket rail) where left would cover the
 * pocket and below the button would reach the next icon. `above-icon` sits just over the
 * icon at the control's centre line, so a toolbar row's badges share one baseline (the
 * composer, in the gap between the text and its toolbar). `end` sits just right of the
 * control, outside it (the collapsed left rail, whose icons leave no room inside).
 */
export type HeldKeySide =
  | 'below'
  | 'above'
  | 'top-edge'
  | 'start'
  | 'inside-end'
  | 'end'
  | 'cover'
  | 'under-icon'
  | 'above-icon';

const GAP = 4;
/** The toolbar glyph size `above-icon` clears. */
const ICON = 14;
const EDGE = 4;
/** Badges on screen now, so a crowded toolbar staggers instead of overlapping. */
const placedBadges = new Map<symbol, DOMRect>();

/** Neighbouring badges keep a gap, so two never read as one chord (Cmd+Return beside Esc). */
function overlaps(a: DOMRect, b: DOMRect) {
  return (
    a.left < b.right + GAP &&
    b.left < a.right + GAP &&
    a.top < b.bottom + GAP &&
    b.top < a.bottom + GAP
  );
}

/** Another small control (an icon button) under the rectangle, which a badge would hide. */
function coversOtherControl(control: Element, rect: DOMRect) {
  if (typeof document.elementFromPoint !== 'function') return false;
  const y = rect.top + rect.height / 2;
  return [0.2, 0.5, 0.8].some((at) => {
    const hit = document.elementFromPoint(rect.left + rect.width * at, y);
    const other = hit?.closest('button, a, input, select, [role="button"], [role="tab"]');
    if (!other || other === control || other.contains(control) || control.contains(other))
      return false;
    return other.getBoundingClientRect().width <= 48;
  });
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
  // Below an icon button it hugs the icon, so it stays clear of text under the button.
  const icon = control.querySelector(':scope > svg, :scope > span > svg')?.getBoundingClientRect();
  let top = Math.min(target.bottom + GAP, icon && icon.height > 0 ? icon.bottom + 5 : Infinity);
  // Above or below flips when the window edge leaves no room.
  const roomAbove = target.top - height - GAP >= EDGE;
  const roomBelow = target.bottom + GAP + height <= viewportHeight - EDGE;
  let vertical = side;
  if (side === 'above' && !roomAbove && roomBelow) vertical = 'below';
  if (side === 'below' && !roomBelow && roomAbove) vertical = 'above';
  if (vertical === 'above') top = target.top - height - GAP;
  let placement = side;
  if (side === 'start') {
    left = target.left - width - GAP * 2;
    top = centreY - height / 2;
    if (coversOtherControl(control, new DOMRect(left, top, width, height))) placement = 'cover';
  }
  if (side === 'inside-end') {
    left = target.right - width - GAP * 1.5;
    top = centreY - height / 2;
  }
  if (side === 'end') {
    left = target.right + GAP * 2;
    top = centreY - height / 2;
  }
  if (placement === 'cover') {
    left = centreX - width / 2;
    top = centreY - height / 2;
  }
  if (side === 'under-icon') {
    const glyph = icon && icon.height > 0 ? icon : target;
    left = glyph.left + glyph.width / 2 - width / 2;
    top = glyph.bottom + 1;
  }
  if (side === 'above-icon') {
    const glyph = icon && icon.height > 0 ? icon : target;
    left = glyph.left + glyph.width / 2 - width / 2;
    top = centreY - ICON / 2 - height - 1;
  }
  // Mostly above the edge, clear of the label inside the control and the text above it.
  if (side === 'top-edge') top = target.top - height / 2 - 3;
  const clamp = () => {
    left = Math.min(Math.max(left, EDGE), viewportWidth - width - EDGE);
    top = Math.min(Math.max(top, EDGE), viewportHeight - height - EDGE);
  };
  clamp();
  const others = [...placedBadges].filter(([key]) => key !== slot).map(([, rect]) => rect);
  const clear = (rect: DOMRect) => !others.some((other) => overlaps(rect, other));
  // First slide sideways, at most half the badge, so it still sits on its control's column.
  const blocking = others.find((other) => overlaps(new DOMRect(left, top, width, height), other));
  // A top-edge pair (Esc beside Cmd+Return) stacks instead, one badge per control.
  if (
    blocking &&
    !['start', 'inside-end', 'end', 'top-edge', 'under-icon', 'above-icon'].includes(placement)
  ) {
    const slid =
      blocking.left + blocking.width / 2 <= left + width / 2
        ? blocking.right + GAP
        : blocking.left - GAP - width;
    if (Math.abs(slid - left) <= width / 2 && clear(new DOMRect(slid, top, width, height)))
      left = slid;
  }
  for (let step = 0; step < 4; step += 1) {
    if (clear(new DOMRect(left, top, width, height))) break;
    // A covering badge never steps onto the next control (a rail's next icon).
    if (placement === 'cover') break;
    if (vertical === 'above' || vertical === 'top-edge' || vertical === 'above-icon')
      top -= height + GAP + 1;
    else if (vertical === 'below' || vertical === 'under-icon') top += height + GAP + 1;
    else if (vertical === 'end') left += width + GAP + 1;
    else left -= width + GAP + 1;
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
  /** The other half of a pair, joined into one badge (`Alt ←→`). */
  pairId?: string;
  /** Where it sits against the control: under it (default), over it, to its left, inside its right end, or on it. */
  side?: HeldKeySide;
  className?: string;
}

/**
 * The badge a control shows while Ctrl (⌘) is held: on Windows the key
 * without the held Ctrl (`⇧B`), on a Mac the whole key (`⇧⌘B`). Place it
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
  // A key this platform leaves to the OS (`mac: []`) has no badge.
  const text =
    definition && shortcutChords(definition, platform).length
      ? heldShortcutText(definition, platform, pair?.definition)
      : undefined;
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
 * While Ctrl (⌘) is held the app dims behind its key badges. Mount once.
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
