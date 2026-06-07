/**
 * Spinner — the ONE thinking-indicator primitive for the desktop (DESIGN.md
 * §primitive inventory). It renders the exact Braille-dots cycle the TUI uses
 * (`tui/internal/ui/spinner.go`: ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ at 125 ms/frame) so the two
 * products feel like one. A single glyph element whose text is advanced on an
 * interval — no per-component ring/dot reinventions.
 *
 * prefers-reduced-motion: the interval is suppressed and a static glyph shown,
 * matching the global motion policy in styles/index.css.
 */
import { createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import './spinner.css';

/** The TUI's Braille spinner frames — kept byte-identical for parity. */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_MS = 125;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function Spinner(props: {
  /** Visual size in px (font-size of the glyph). Defaults to 1em. */
  size?: number;
  /** Accessible label; defaults to "Loading". */
  label?: string;
  class?: string;
}): JSX.Element {
  const [frame, setFrame] = createSignal(0);

  onMount(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(
      () => setFrame((f) => (f + 1) % SPINNER_FRAMES.length),
      FRAME_MS,
    );
    onCleanup(() => clearInterval(id));
  });

  return (
    <span
      class={`spinner${props.class ? ` ${props.class}` : ''}`}
      style={props.size ? { 'font-size': `${props.size}px` } : undefined}
      role="status"
      aria-label={props.label ?? 'Loading'}
    >
      <span class="spinner__glyph" aria-hidden="true">
        {SPINNER_FRAMES[frame()]}
      </span>
    </span>
  );
}
