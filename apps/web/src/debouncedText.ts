/**
 * Debounced text accessor (`createDebouncedText`) for search/filter inputs
 * that should not re-run work on every keystroke.
 */
import { createSignal, onCleanup } from 'solid-js';

export function createDebouncedText(delayMs = 250) {
  const [raw, setRaw] = createSignal('');
  const [debounced, setDebounced] = createSignal('');
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
  };

  const set = (value: string) => {
    setRaw(value);
    clearTimer();
    timer = setTimeout(() => {
      setDebounced(value.trim());
      timer = undefined;
    }, delayMs);
  };

  const reset = () => {
    clearTimer();
    setRaw('');
    setDebounced('');
  };

  onCleanup(clearTimer);

  return {
    raw,
    debounced,
    set,
    reset,
  };
}
