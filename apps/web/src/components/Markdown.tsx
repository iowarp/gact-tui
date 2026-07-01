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
import { sanitizeEmphasis } from './sanitizeEmphasis.js';
import './inline-markdown.css';

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
    const text = sanitizeEmphasis(props.text ?? '');
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
