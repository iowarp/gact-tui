import { useLayoutEffect, useRef } from 'react';
import {
  useCascaderActions,
  useCascaderHighlight,
  useCascaderState,
} from '@/components/reui/cascader/cascader-context';
import { MODEL_NODE_PREFIX, SEARCH_RESULT_PREFIX } from './model-picker-model';

interface Walk {
  target: string;
  steps: number;
  at: number;
}

/**
 * Keeps a row highlighted in the one-column picker, as the spec's narrow picker
 * does: the last highlighted row while it is listed, else the first match while
 * searching, else the chosen model, else the first model. Base UI's inline list
 * opens with none and has no setter, so this presses the arrow keys, one per
 * committed highlight. Hover and the keyboard move it as usual.
 */
export function ModelPickerHighlightSeed() {
  const anchor = useRef<HTMLSpanElement>(null);
  const last = useRef<string | null>(null);
  const walk = useRef<Walk | null>(null);
  const highlight = useCascaderHighlight();
  const { renderedItems, selectedValues, query } = useCascaderState();
  const { getHighlighted } = useCascaderActions();

  useLayoutEffect(() => {
    const panel = anchor.current?.closest('[data-slot="cascader-panel"]');
    const field = panel?.querySelector<HTMLInputElement>('[data-slot="cascader-input"]');
    if (!panel || !field) return;
    const position = (value: string | null | undefined) =>
      value ? renderedItems.findIndex((node) => node.value === value) : -1;
    const press = (key: 'ArrowDown' | 'ArrowUp') => {
      // Marked so the search field does not treat it as the person moving (which closes Filters).
      field.dataset.seeding = '';
      try {
        field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      } finally {
        delete field.dataset.seeding;
      }
    };

    if (highlight.value !== null) {
      const current = walk.current;
      if (!current) {
        last.current = highlight.value;
        return;
      }
      const here = position(highlight.value);
      const goal = position(current.target);
      // Another dependency changed while the last press is still committing.
      if (here === current.at && here !== -1) return;
      if (here === goal || goal === -1 || here === -1 || current.steps > renderedItems.length) {
        walk.current = null;
        last.current = highlight.value;
        return;
      }
      const next = { ...current, steps: current.steps + 1, at: here };
      walk.current = next;
      // Pressed after Base UI's own effects settle, or it can drop the key.
      requestAnimationFrame(() => {
        if (walk.current !== next) return;
        press(here > goal ? 'ArrowUp' : 'ArrowDown');
        // A press that moves nothing ends the walk, so later moves stay the user's.
        window.setTimeout(() => {
          if (walk.current === next) walk.current = null;
        }, 200);
      });
      return;
    }

    // A press can land in Base UI before its highlight commits; keep that walk.
    const pressed = walk.current?.at === -1;
    walk.current = null;
    const firstModel = renderedItems.findIndex(
      (node) =>
        node.value.startsWith(MODEL_NODE_PREFIX) || node.value.startsWith(SEARCH_RESULT_PREFIX),
    );
    const target = [
      position(last.current),
      query.trim() ? firstModel : -1,
      position(selectedValues[0]),
      firstModel,
    ].find((index) => index >= 0);
    if (target === undefined) return;
    if (pressed) walk.current = { target: renderedItems[target].value, steps: 0, at: -1 };
    // Base UI registers the rows a frame after they mount, so an early press
    // can find none; it is retried, and again when the field takes focus.
    const seed = (): boolean => {
      if (getHighlighted()) return true;
      // Focus on a footer or manage control: the list let go of it on purpose.
      const focused = document.activeElement;
      if (focused && focused !== field && panel.contains(focused)) return true;
      walk.current = { target: renderedItems[target].value, steps: 0, at: -1 };
      press('ArrowDown');
      return false;
    };
    if (seed()) return;
    let frame = 0;
    let tries = 0;
    const retry = () => {
      tries += 1;
      if (!seed() && tries < 8) frame = requestAnimationFrame(retry);
    };
    frame = requestAnimationFrame(retry);
    const onFocus = () => seed();
    field.addEventListener('focus', onFocus);
    return () => {
      cancelAnimationFrame(frame);
      field.removeEventListener('focus', onFocus);
    };
  }, [highlight.value, renderedItems, selectedValues, query, getHighlighted]);

  return <span hidden ref={anchor} />;
}
