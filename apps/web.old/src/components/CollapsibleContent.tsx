/**
 * TUI-style content COMPACTION (mirror of collapseForPreview + the expand
 * affordance in tui/internal/ui/render_previews.go / execution_observations.go):
 * show the first N lines of long content, then a "+K lines · expand" toggle
 * that reveals the rest. Used for long model prose, tool returns, and any
 * multi-line block that would otherwise dominate the transcript.
 */
import { Show, children, createMemo, createSignal, type JSX } from 'solid-js';
import { Markdown } from './Markdown.js';

/** Default preview budget — matches the TUI's CollapseThreshold sweet spot. */
export const COLLAPSE_THRESHOLD = 6;

/** (visible, hidden): first `n` lines of s + count of lines not shown. Mirrors
 *  collapseForPreview — a trailing empty line never counts toward the budget. */
export function collapseForPreview(s: string, n: number): { visible: string; hidden: number } {
  if (n <= 0) return { visible: '', hidden: lineCount(s) };
  const lines = s.split('\n');
  let total = lines.length;
  if (total > 0 && lines[total - 1] === '') total--;
  if (total <= n) return { visible: s, hidden: 0 };
  return { visible: lines.slice(0, n).join('\n'), hidden: total - n };
}

function lineCount(s: string): number {
  if (s === '') return 0;
  const n = (s.match(/\n/g) ?? []).length;
  return s.endsWith('\n') ? n : n + 1;
}

/**
 * Collapsible markdown body: renders the first `threshold` lines, with an
 * inline "+K lines · expand" / "collapse" toggle when there is more.
 */
export function CollapsibleText(props: {
  text: string;
  threshold?: number;
  /** When true, render the visible prefix as plain text (preserving newlines)
   *  rather than markdown — used for raw tool output. */
  plain?: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const threshold = () => props.threshold ?? COLLAPSE_THRESHOLD;
  const split = createMemo(() => collapseForPreview(props.text, threshold()));
  const shown = () => (open() ? props.text : split().visible);
  return (
    <div class="trx-collapse" data-testid="collapsible-text">
      <Show
        when={!props.plain}
        fallback={<pre class="trx-collapse__pre">{shown()}</pre>}
      >
        <Markdown text={shown()} />
      </Show>
      <Show when={split().hidden > 0}>
        <button
          type="button"
          class="trx-collapse__toggle"
          data-testid="collapsible-toggle"
          aria-expanded={open()}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {open() ? 'collapse' : `+${split().hidden} lines · expand`}
        </button>
      </Show>
    </div>
  );
}

/**
 * Collapsible wrapper for arbitrary JSX content (e.g. a rendered diff or a
 * passthrough part) when its measured line budget is large. Renders the child
 * inside a max-height clamp with a gradient fade + expand toggle. `lines` is
 * the caller's estimate of content height used to decide whether to clamp.
 */
export function CollapsibleBlock(props: {
  lines: number;
  threshold?: number;
  children: JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  const resolved = children(() => props.children);
  const threshold = () => props.threshold ?? COLLAPSE_THRESHOLD;
  const clamps = () => props.lines > threshold();
  return (
    <Show when={clamps()} fallback={<>{resolved()}</>}>
      <div class="trx-collapse-block" data-collapsed={!open()} data-testid="collapsible-block">
        <div
          class="trx-collapse-block__body"
          classList={{ 'is-clamped': !open() }}
          style={!open() ? { 'max-height': `${threshold() * 1.7}em` } : undefined}
        >
          {resolved()}
        </div>
        <button
          type="button"
          class="trx-collapse__toggle"
          data-testid="collapsible-block-toggle"
          aria-expanded={open()}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {open() ? 'collapse' : `+${props.lines - threshold()} lines · expand`}
        </button>
      </div>
    </Show>
  );
}
