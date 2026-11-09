import { useLayoutEffect, useRef, type ComponentType, type RefObject } from 'react';

export interface FrameModesEntry {
  label: string;
  value: string;
  onChange: (value: string) => void;
  modes: readonly {
    value: string;
    label: string;
    icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  }[];
}

interface FrameModesHolder {
  anchor: HTMLElement;
  entry: { current: FrameModesEntry | null };
}

/**
 * Each frame bar's mode groups, by bar element. Keyed on the DOM rather than
 * React context because a renderer portals its modes into the bar's Format host
 * (a document's Read and Source beside the file's own modes).
 */
const frameModes = new WeakMap<Element, Set<FrameModesHolder>>();

/**
 * Offers a group of modes to the bar's … menu, which lists them once the bar
 * folds to `modes-menu`. `inside` is an element inside the bar.
 */
export function useFrameModes(
  inside: RefObject<HTMLElement | null>,
  entry: FrameModesEntry | null,
) {
  const current = useRef<FrameModesEntry | null>(entry);
  useLayoutEffect(() => {
    current.current = entry;
  });
  const active = entry !== null;
  useLayoutEffect(() => {
    const anchor = inside.current;
    const bar = anchor?.closest('[data-slot="frame-bar"]');
    if (!anchor || !bar || !active) return;
    const holder = { anchor, entry: current };
    const groups = frameModes.get(bar) ?? new Set<FrameModesHolder>();
    groups.add(holder);
    frameModes.set(bar, groups);
    return () => {
      groups.delete(holder);
    };
  }, [inside, active]);
}

/**
 * The mode groups the … menu inside `element`'s bar should list, in bar order,
 * when the bar has folded them there.
 */
export function foldedFrameModes(element: HTMLElement | null): FrameModesEntry[] {
  const bar = element?.closest('[data-slot="frame-bar"]');
  if (!bar?.hasAttribute('data-fold-modes-menu')) return [];
  return [...(frameModes.get(bar) ?? [])]
    .filter(({ anchor }) => anchor.isConnected)
    .sort(({ anchor: a }, { anchor: b }) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    .flatMap(({ entry }) => (entry.current ? [entry.current] : []));
}
