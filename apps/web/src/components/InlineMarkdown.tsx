/**
 * UI component: Inline Markdown. Renders `InlineMarkdown` from `InlineMarkdownProps`.
 */
import { For } from 'solid-js';
import { MarkdownBlock } from './InlineMarkdownBlocks.js';
import { normalizeCompactMarkdown, splitBlocks } from './InlineMarkdownModel.js';

export interface InlineMarkdownProps {
  text: string;
}

/**
 * Minimal, XSS-safe inline-markdown renderer for assistant text parts.
 *
 * Supports:
 *   - paragraph breaks (blank lines split into separate <p>)
 *   - line breaks (single \n inside a paragraph → <br>)
 *   - fenced code blocks (```lang\n…\n```)
 *   - headings (# / ## / ###)
 *   - bullet (-, *) and ordered (1.) lists
 *   - inline `code`, **bold**, *italic*
 *   - autolinks for bare http/https URLs (target=_blank, noopener)
 *
 * Does NOT support: raw HTML, images, arbitrary <a href>. All user
 * content is inserted via textContent (no dangerouslySetInnerHTML, no
 * DOMPurify dependency). Links are restricted to http/https URLs that
 * the regex matches verbatim — no markdown link syntax means no chance
 * for `[click](javascript:…)` smuggling.
 */
export function InlineMarkdown(props: InlineMarkdownProps) {
  const blocks = () => splitBlocks(normalizeCompactMarkdown(props.text));
  return (
    <div class="im">
      <For each={blocks()}>
        {(block) => <MarkdownBlock block={block} />}
      </For>
    </div>
  );
}
