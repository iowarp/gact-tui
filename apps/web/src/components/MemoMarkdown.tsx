/**
 * Markdown renderer that memoizes its parsed block list per text value.
 *
 * During streaming, the assistant turn re-renders on every SSE delta. Without
 * memoization every InlineMarkdown re-runs `splitBlocks(normalizeCompactMarkdown(…))`
 * for *every* visible block on *every* token — quadratic parse cost that the
 * owner felt as scroll/stream lag. Here the parsed blocks are derived via a
 * `createMemo` keyed on the raw text, so an unchanged block's markdown is parsed
 * exactly once and reused until its text actually changes.
 */
import { For, createMemo } from 'solid-js';
import { MarkdownBlock } from './InlineMarkdownBlocks.js';
import { normalizeCompactMarkdown, splitBlocks } from './InlineMarkdownModel.js';

export function MemoMarkdown(props: { text: string }) {
  // createMemo only recomputes when props.text changes; Solid's <For> with the
  // stable block list then leaves untouched blocks in the DOM as-is.
  const blocks = createMemo(() => splitBlocks(normalizeCompactMarkdown(props.text)));
  return (
    <div class="im">
      <For each={blocks()}>{(block) => <MarkdownBlock block={block} />}</For>
    </div>
  );
}
