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
 *
 * Mid-stream tail: smd keeps the last un-tokenizable characters in its
 * `pending`/`text` buffers (a trailing digit could open an ordered list, a `*`
 * could open emphasis, …) so they are NOT yet in the DOM. Left unflushed, the
 * freshest streamed characters lag by a token — the last line of a delta shows
 * as "Pinned live line 1" instead of "…12" until the next chunk or completion.
 * We surface those buffered characters as a DISPOSABLE tail text node so the
 * newest characters are visible immediately, and remove it before the next real
 * write — smd stays the single source of truth for actual parsing.
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
  let tailNode: Text | null = null;

  const clearTail = () => {
    if (tailNode) {
      tailNode.remove();
      tailNode = null;
    }
  };

  const rebuild = () => {
    tailNode = null;
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
    // Drop the prior render's throwaway tail before feeding real characters so
    // smd's own pending/text buffers remain the source of truth.
    clearTail();
    if (text.length > fed.length) {
      smd.parser_write(parser!, text.slice(fed.length));
      fed = text;
    }
    if (!streaming) {
      if (!ended) {
        smd.parser_end(parser!);
        ended = true;
      }
      return;
    }
    // Surface smd's buffered tail so the freshest streamed characters are visible.
    const buffers = parser as unknown as { text?: string; pending?: string };
    const tail = (buffers.text ?? '') + (buffers.pending ?? '');
    if (tail) {
      tailNode = document.createTextNode(tail);
      deepestLastElement(el).appendChild(tailNode);
    }
  });

  return <div class="im" ref={el!} />;
}

/** Deepest last-child element under `root` (the currently open smd block). */
function deepestLastElement(root: HTMLElement): HTMLElement {
  let node: HTMLElement = root;
  while (node.lastElementChild) node = node.lastElementChild as HTMLElement;
  return node;
}
