import { useLayoutEffect, useRef, type ComponentType, type ReactNode, type RefObject } from 'react';

export interface FrameModesEntry {
  label: string;
  value: string;
  onChange: (value: string) => void;
  modes: readonly {
    value: string;
    label: string;
    icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
    /** Catalog id of the key that switches to this mode from anywhere in the tab. */
    shortcut?: string;
  }[];
}

/**
 * A renderer's own icon in the bar's Format (zoom out, zoom in), offered to the
 * … menu so it can leave the bar with the modes (workbench-lineage step 6: only
 * the name, comments and … remain). Choosing the row clicks the icon itself.
 */
export interface FrameToolEntry {
  label: string;
  icon: ReactNode;
  /** The icon's button, which the menu row clicks. */
  button: HTMLElement;
  disabled?: boolean;
  /** Why it is unavailable, shown after the name. */
  reason?: string;
  /** A toggle's state (`aria-pressed`), shown as the row's check. */
  checked?: boolean;
}

interface Holder<T> {
  anchor: HTMLElement;
  entry: { current: T | null };
}

/**
 * Entries each frame bar's … menu can list, by bar element. Keyed on the DOM
 * rather than React context because a renderer portals its modes and icons
 * into the bar's Format host (a document's Read and Source beside the file's
 * own modes).
 */
type Registry<T> = WeakMap<Element, Set<Holder<T>>>;

const frameModes: Registry<FrameModesEntry> = new WeakMap();
const frameTools: Registry<FrameToolEntry> = new WeakMap();

/** Offers `entry` to the … menu of the bar around `inside` (its Format, when `scope` is given). */
function useBarEntry<T>(
  registry: Registry<T>,
  inside: RefObject<HTMLElement | null>,
  entry: T | null,
  scope?: string,
) {
  const current = useRef<T | null>(entry);
  useLayoutEffect(() => {
    current.current = entry;
  });
  const active = entry !== null;
  useLayoutEffect(() => {
    const anchor = inside.current;
    const bar = anchor?.closest('[data-slot="frame-bar"]');
    if (!anchor || !bar || !active || (scope && !anchor.closest(scope))) return;
    const holder = { anchor, entry: current };
    const groups = registry.get(bar) ?? new Set<Holder<T>>();
    groups.add(holder);
    registry.set(bar, groups);
    return () => {
      groups.delete(holder);
    };
  }, [registry, inside, active, scope]);
}

/** What the … menu inside `element`'s bar lists, in bar order, once the bar has folded to `modes-menu`. */
function barEntries<T>(
  registry: Registry<T>,
  element: HTMLElement | null,
): { anchor: HTMLElement; entry: T }[] {
  const bar = element?.closest('[data-slot="frame-bar"]');
  if (!bar?.hasAttribute('data-fold-modes-menu')) return [];
  return [...(registry.get(bar) ?? [])]
    .filter(({ anchor }) => anchor.isConnected)
    .sort(({ anchor: a }, { anchor: b }) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    .flatMap(({ anchor, entry }) => (entry.current ? [{ anchor, entry: entry.current }] : []));
}

/**
 * Offers a group of modes to the bar's … menu, which lists them once the bar
 * folds to `modes-menu`. `inside` is an element inside the bar.
 */
export function useFrameModes(
  inside: RefObject<HTMLElement | null>,
  entry: FrameModesEntry | null,
) {
  useBarEntry(frameModes, inside, entry);
}

/** The mode groups the … menu inside `element`'s bar should list, when the bar has folded them there. */
export function foldedFrameModes(element: HTMLElement | null): FrameModesEntry[] {
  return barEntries(frameModes, element).map(({ entry }) => entry);
}

/**
 * Offers a Format icon to the bar's … menu, which lists it once the bar folds
 * to `modes-menu` and the icon leaves the bar. `button` is the icon itself;
 * only icons inside the bar's Format register.
 */
export function useFrameTool(
  button: RefObject<HTMLElement | null>,
  entry: Omit<FrameToolEntry, 'button'> | null,
) {
  useBarEntry(frameTools, button, entry, '[data-slot="frame-format"]');
}

/** The Format icons the … menu inside `element`'s bar should list, when the bar has folded them there. */
export function foldedFrameTools(element: HTMLElement | null): FrameToolEntry[] {
  return barEntries(frameTools, element).map(({ anchor, entry }) => ({ ...entry, button: anchor }));
}
