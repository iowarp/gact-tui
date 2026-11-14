import { type RefObject, useLayoutEffect, useState } from 'react';

const px = (value: string) => Number.parseFloat(value) || 0;

/**
 * The first of `choices` (longest first) whose text fits whole in `room(element)`,
 * in the element's font, else none: a narrow control shows a shorter word, or
 * none, instead of one cut mid-word. Re-measures when the element or the window
 * resizes, the choices change or web fonts load. Pass a stable (module-level)
 * `room` function.
 */
export function useFittingText<T extends HTMLElement>(
  ref: RefObject<T | null>,
  choices: readonly string[],
  room: (element: T) => number,
): string {
  const key = choices.join('\u0000');
  const [fitting, setFitting] = useState(choices[0] ?? '');
  useLayoutEffect(() => {
    const element = ref.current;
    const options = key.split('\u0000');
    if (!element) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const space = room(element);
      // Not laid out yet (or a test DOM): nothing to choose between.
      if (!(space > 0)) {
        setFitting(options[0] ?? '');
        return;
      }
      const style = getComputedStyle(element);
      const probe = document.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText =
        'position:absolute;visibility:hidden;white-space:pre;pointer-events:none';
      for (const property of [
        'fontFamily',
        'fontSize',
        'fontStyle',
        'fontWeight',
        'fontStretch',
        'letterSpacing',
      ] as const) {
        probe.style[property] = style[property];
      }
      (element.parentElement ?? document.body).append(probe);
      const next =
        options.find((text) => {
          probe.textContent = text;
          return probe.getBoundingClientRect().width <= space + 0.5;
        }) ?? '';
      probe.remove();
      setFitting(next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    observer?.observe(document.documentElement);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [ref, key, room]);
  return fitting;
}

/** A text input's content box. */
export function inputTextRoom(input: HTMLInputElement): number {
  const style = getComputedStyle(input);
  return input.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
}

/**
 * What a capped flex button leaves for its `[data-fitting-text]` label: its
 * max-width less padding, border and its other children with their gaps.
 */
export function cappedLabelRoom(button: HTMLElement): number {
  const style = getComputedStyle(button);
  if (!style.maxWidth.endsWith('px')) return Number.POSITIVE_INFINITY;
  const others = [...button.children].filter(
    (child) => !(child as HTMLElement).hasAttribute('data-fitting-text'),
  );
  return (
    px(style.maxWidth) -
    px(style.paddingLeft) -
    px(style.paddingRight) -
    px(style.borderLeftWidth) -
    px(style.borderRightWidth) -
    others.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) -
    px(style.columnGap) * others.length
  );
}
