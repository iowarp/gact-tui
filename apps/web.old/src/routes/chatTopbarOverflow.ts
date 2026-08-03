/**
 * Solid controller that measures topbar crumb overflow and exposes whether
 * items must collapse into a menu. Exports {@link createTopbarOverflow}.
 */
import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
  type Setter,
} from 'solid-js';

export interface TopbarOverflowController {
  narrow: Accessor<boolean>;
  overflowOpen: Accessor<boolean>;
  setOverflowOpen: Setter<boolean>;
  setTopbarRef: (el: HTMLElement) => void;
  setMetaRef: (el: HTMLDivElement) => void;
  setCrumbsRef: (el: HTMLDivElement) => void;
  setActionsRef: (el: HTMLDivElement) => void;
  setSecondaryRef: (el: HTMLDivElement) => void;
}

export function createTopbarOverflow(watch: () => readonly unknown[]): TopbarOverflowController {
  const [narrow, setNarrow] = createSignal(false);
  const [overflowOpen, setOverflowOpen] = createSignal(false);

  let topbarRef: HTMLElement | undefined;
  let metaRef: HTMLDivElement | undefined;
  let crumbsRef: HTMLDivElement | undefined;
  let actionsRef: HTMLDivElement | undefined;
  let secondaryRef: HTMLDivElement | undefined;

  const evaluateOverflow = () => {
    if (!topbarRef || !secondaryRef) return;
    const topbarW = topbarRef.clientWidth;
    const crumbsW = crumbsRef?.getBoundingClientRect().width ?? 0;
    const actionsW = actionsRef?.getBoundingClientRect().width ?? 0;
    const metaW = metaRef?.getBoundingClientRect().width ?? 0;
    const secondaryW = secondaryRef.scrollWidth;
    const stripFlowW = secondaryRef.getBoundingClientRect().width;
    const statusW = Math.max(0, metaW - (narrow() ? 0 : stripFlowW));
    const overflowButtonReserve = 36;
    const layoutSlack = 24;
    const available = topbarW - crumbsW - actionsW - statusW - overflowButtonReserve - layoutSlack;
    const shouldCollapse = secondaryW > available;
    if (shouldCollapse !== narrow()) {
      setNarrow(shouldCollapse);
      if (!shouldCollapse) setOverflowOpen(false);
    }
  };

  onMount(() => {
    if (typeof ResizeObserver === 'undefined' || !topbarRef) return;
    const ro = new ResizeObserver(evaluateOverflow);
    ro.observe(topbarRef);
    if (metaRef) ro.observe(metaRef);
    queueMicrotask(evaluateOverflow);
    onCleanup(() => ro.disconnect());
  });

  createEffect(() => {
    for (const value of watch()) void value;
    queueMicrotask(evaluateOverflow);
  });

  return {
    narrow,
    overflowOpen,
    setOverflowOpen,
    setTopbarRef: (el) => {
      topbarRef = el;
    },
    setMetaRef: (el) => {
      metaRef = el;
    },
    setCrumbsRef: (el) => {
      crumbsRef = el;
    },
    setActionsRef: (el) => {
      actionsRef = el;
    },
    setSecondaryRef: (el) => {
      secondaryRef = el;
    },
  };
}
