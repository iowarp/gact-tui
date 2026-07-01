/**
 * The ONE markdown renderer for the transcript.
 *
 * Replaces the two prior renderers — the plain-while-streaming `StreamingMarkdown`
 * (which flipped plain->formatted on finalize) and the finalize-only `MemoMarkdown`
 * (which re-split every block on every token: O(n^2)). This uses
 * `streaming-markdown` (smd): a true INCREMENTAL parser that only APPENDS DOM nodes
 * as new characters arrive — never re-parsing prior content. Streaming and settled
 * render through the SAME path, so there is no plain->formatted flip and no
 * quadratic re-parse.
 *
 * Contract: feed the growing `text` as it streams; when `streaming` goes false (or
 * for already-settled text) the parser is ended once to close any open token. The
 * output is wrapped in `<div class="im">` so the existing `.im` descendant CSS
 * (headings, lists, code, links, …) styles smd's plain tag output unchanged.
 */
import { createEffect } from 'solid-js';
import * as smd from 'streaming-markdown';
import './inline-markdown.css';

/**
 * Escape underscores that sit INSIDE a word (a word char on both sides).
 * CommonMark does not treat intraword underscores as emphasis (`shell_bash`,
 * `time_s`, `temperature_c` are literal), but smd doesn't enforce that rule — a
 * lone `_` opens an <em> that cascades everything after it into italics until the
 * next `_` (e.g. the next `shell_bash` or a `foo_bar` column name). smd honors
 * backslash escapes, so `\_` renders as a literal underscore. This is the exact
 * case the prior InlineMarkdown renderer guarded (its `time_s`/`temperature_c`
 * test). Emphasis via `*…*` / `**…**` and boundary `_…_` is unaffected.
 */
export function escapeIntrawordUnderscores(text: string): string {
  // Split out fenced ```blocks``` and `inline code` (kept at odd indices by the
  // capture group) and transform ONLY the prose segments. Inside code, underscores
  // are already literal AND backslash-escapes are not processed — escaping there
  // would leak a visible `\` (e.g. `geo_geocode` -> `geo\_geocode`).
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((seg, i) => (i % 2 === 0 ? seg.replace(/(?<=\w)_(?=\w)/g, '\\_') : seg))
    .join('');
}

export function Markdown(props: { text: string; streaming?: boolean }) {
  let el!: HTMLDivElement;
  let parser: ReturnType<typeof smd.parser> | null = null;
  let fed = '';
  let ended = false;

  const rebuild = () => {
    el.replaceChildren();
    parser = smd.parser(smd.default_renderer(el));
    fed = '';
    ended = false;
  };

  createEffect(() => {
    const text = escapeIntrawordUnderscores(props.text ?? '');
    const streaming = props.streaming ?? false;
    // Append-only fast path when the text grew from what we already fed; otherwise
    // (text shrank, diverged, or the parser was already ended) rebuild from scratch.
    if (!parser || ended || !text.startsWith(fed)) rebuild();
    if (text.length > fed.length) {
      smd.parser_write(parser!, text.slice(fed.length));
      fed = text;
    }
    if (!streaming && !ended) {
      smd.parser_end(parser!);
      ended = true;
    }
  });

  return <div class="im" ref={el!} />;
}
