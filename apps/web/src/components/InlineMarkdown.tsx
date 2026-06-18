import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { getHljs, hljsSync } from '../hljs-lazy.js';

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
        {(b) => {
          if (b.kind === 'code') {
            return <CodeBlock lang={b.lang} body={b.body} />;
          }
          if (b.kind === 'heading') {
            const content = (
              <For each={tokenizeInline(b.body)}>{(t) => renderToken(t)}</For>
            );
            if (b.level === 1) {
              return <h2 class="im__h im__h-1">{content}</h2>;
            }
            if (b.level === 2) {
              return <h3 class="im__h im__h-2">{content}</h3>;
            }
            return <h4 class="im__h im__h-3">{content}</h4>;
          }
          if (b.kind === 'list') {
            // Detect a markdown task list — all items start with
            // `[ ] ` or `[x] `. We render the checkbox glyph + drop
            // the marker from the text so the rest renders normally.
            const taskListRe = /^\[([ xX])\]\s+(.*)$/;
            const isTaskList =
              !b.ordered &&
                b.items.length > 0 &&
                b.items.every((it) => taskListRe.test(it));
            const items = (
              <For each={b.items}>
                {(item) => {
                  if (isTaskList) {
                    const m = item.match(taskListRe)!;
                    const checked = m[1]!.toLowerCase() === 'x';
                    const body = m[2]!;
                    return (
                      <li
                        class={'im__li im__li--task ' + (checked ? 'is-done' : '')}
                      >
                        <span
                          class={'im__check ' + (checked ? 'is-checked' : '')}
                          aria-hidden
                        />
                        <span>
                          <For each={tokenizeInline(body)}>{(t) => renderToken(t)}</For>
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li class="im__li">
                      <For each={tokenizeInline(item)}>{(t) => renderToken(t)}</For>
                    </li>
                  );
                }}
              </For>
            );
            const className =
              'im__list ' +
              (b.ordered ? 'im__list--ol' : 'im__list--ul') +
              (isTaskList ? ' im__list--tasks' : '');
            if (b.ordered) {
              return <ol class={className}>{items}</ol>;
            }
            return (
              <ul class={className}>{items}</ul>
            );
          }
          if (b.kind === 'hr') {
            return <hr class="im__hr" />;
          }
          if (b.kind === 'quote') {
            return (
              <blockquote class="im__quote">
                <For each={splitLines(b.body)}>
                  {(line, i) => (
                    <>
                      {i() > 0 && <br />}
                      <For each={tokenizeInline(line)}>{(t) => renderToken(t)}</For>
                    </>
                  )}
                </For>
              </blockquote>
            );
          }
          if (b.kind === 'table') {
            return (
              <table class="im__table">
                <thead>
                  <tr>
                    <For each={b.header}>
                      {(cell) => (
                        <th>
                          <For each={tokenizeInline(cell)}>{(t) => renderToken(t)}</For>
                        </th>
                      )}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={b.rows}>
                    {(row) => (
                      <tr>
                        <For each={row}>
                          {(cell) => (
                            <td>
                              <For each={tokenizeInline(cell)}>{(t) => renderToken(t)}</For>
                            </td>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            );
          }
          return (
            <p class="im__p">
              <For each={splitLines(b.body)}>
                {(line, i) => (
                  <>
                    {i() > 0 && <br />}
                    <For each={tokenizeInline(line)}>
                      {(t) => renderToken(t)}
                    </For>
                  </>
                )}
              </For>
            </p>
          );
        }}
      </For>
    </div>
  );
}

function normalizeCompactMarkdown(text: string): string {
  if (!/\|[-:\s|]{3,}\|/.test(text)) return text;
  return text.replace(/(\|)\s+(?=\|(?:\s*[-:]{3,}|\s*\d+\s*\||\s*[A-Za-z][^|\n]{0,80}\s*\|))/g, '$1\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Renders a fenced code block with a hover-revealed Copy button, a
 * non-selectable line-number gutter (for multi-line blocks), and
 * syntax highlighting.
 *
 * highlight.js loads on demand (see hljs-lazy): the block first renders
 * HTML-escaped plain source, then re-renders highlighted once hljs
 * resolves. The signal flip drives the re-render. The Copy button always
 * copies the RAW source (props.body) — never the line numbers.
 */
function CodeBlock(props: { lang: string | null; body: string }) {
  const [copied, setCopied] = createSignal(false);
  // Flips once hljs has loaded so the highlight memo re-runs.
  const [hljsReady, setHljsReady] = createSignal(hljsSync() !== null);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    if (hljsSync()) {
      setHljsReady(true);
      return;
    }
    void getHljs().then(() => setHljsReady(true));
  });

  function copy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(props.body).then(() => {
      setCopied(true);
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => setCopied(false), 1600);
    });
  }

  // Syntax-highlight via highlight.js once it has loaded. hljs HTML-escapes
  // the source, so the returned markup is safe to inject. Use the declared
  // fence language when hljs knows it, else auto-detect. Until hljs loads
  // (or if it errors) we fall back to escaped plain text so the code is
  // always visible and never raw-injects user content.
  const highlighted = createMemo(() => {
    const code = props.body;
    // Touch the readiness signal so this memo re-runs when hljs arrives.
    const hljs = hljsReady() ? hljsSync() : null;
    if (!hljs) return escapeHtml(code);
    const lang = (props.lang ?? '').toLowerCase();
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return escapeHtml(code);
    }
  });

  // Split the (possibly highlighted) HTML into per-line rows so the gutter
  // can sit beside each line. hljs output is line-oriented HTML; splitting
  // on \n keeps tokens intact because hljs never emits a token that spans
  // a newline. Only show the gutter for blocks with more than one line.
  const lines = createMemo(() => highlighted().split('\n'));
  const showGutter = () => lines().length > 1;

  return (
    <pre class={'im__code ' + (props.lang ? `im__code--${props.lang}` : '')}>
      <Show when={props.lang}>
        <span class="im__code-lang">{props.lang}</span>
      </Show>
      <button
        type="button"
        class={'im__code-copy ' + (copied() ? 'is-copied' : '')}
        onClick={copy}
        aria-label="Copy code"
        title="Copy code"
      >
        {copied() ? 'copied' : 'copy'}
      </button>
      {/* hljs HTML-escapes the source, so this markup is injection-safe. */}
      <Show
        when={showGutter()}
        fallback={<code class="hljs" innerHTML={highlighted()} />}
      >
        <code class="hljs im__code--numbered">
          <For each={lines()}>
            {(line, i) => (
              <span class="im__code-row">
                <span class="im__code-lineno" aria-hidden="true">
                  {i() + 1}
                </span>
                {/* Per-line highlighted HTML; escaped by hljs / escapeHtml. */}
                <span class="im__code-linecode" innerHTML={line || ' '} />
              </span>
            )}
          </For>
        </code>
      </Show>
    </pre>
  );
}

type Block =
  | { kind: 'text'; body: string }
  | { kind: 'code'; lang: string | null; body: string }
  | { kind: 'heading'; level: 1 | 2 | 3; body: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'quote'; body: string }
  | { kind: 'hr' };

function splitBlocks(text: string): Block[] {
  const out: Block[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    out.push({ kind: 'text', body: para.join('\n') });
    para = [];
  };

  const headingRe = /^(#{1,3})\s+(.+?)\s*$/;
  const ulRe = /^[-*]\s+(.+)$/;
  const olRe = /^\d+\.\s+(.+)$/;

  while (i < lines.length) {
    const line = lines[i]!;

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushPara();
      const lang = fence[1] || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        body.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++;
      out.push({ kind: 'code', lang, body: body.join('\n') });
      continue;
    }

    // Horizontal rule: a line with only three or more - / * / _.
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushPara();
      out.push({ kind: 'hr' });
      i++;
      continue;
    }

    // Blockquote: contiguous lines starting with `> `. Strip the
    // marker and join with newlines.
    if (line.startsWith('> ') || line === '>') {
      flushPara();
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i]?.startsWith('> ') || lines[i] === '>')) {
        quoteLines.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i++;
      }
      out.push({ kind: 'quote', body: quoteLines.join('\n') });
      continue;
    }

    const head = line.match(headingRe);
    if (head) {
      flushPara();
      const level = head[1]!.length as 1 | 2 | 3;
      out.push({ kind: 'heading', level, body: head[2] ?? '' });
      i++;
      continue;
    }

    // Pipe-delimited tables: at least two lines where line 0 has |
    // cells and line 1 is a `|---|---|` separator. Bail out if either
    // assumption fails so prose with stray | survives unchanged.
    if (line.includes('|') && i + 1 < lines.length) {
      const sep = lines[i + 1] ?? '';
      const sepCells = splitTableRow(sep);
      if (
        sepCells.length > 0 &&
        sepCells.every((c) => /^[-:]+$/.test(c.trim()))
      ) {
        flushPara();
        const header = splitTableRow(line);
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && lines[i]?.includes('|')) {
          rows.push(splitTableRow(lines[i]!));
          i++;
        }
        out.push({ kind: 'table', header, rows });
        continue;
      }
    }

    const ulMatch = line.match(ulRe);
    const olMatch = line.match(olRe);
    if (ulMatch || olMatch) {
      flushPara();
      const ordered = !!olMatch;
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i]!;
        const u = cur.match(ulRe);
        const o = cur.match(olRe);
        if (ordered && o) items.push(o[1]!);
        else if (!ordered && u) items.push(u[1]!);
        else break;
        i++;
      }
      out.push({ kind: 'list', ordered, items });
      continue;
    }

    if (line.trim() === '') {
      flushPara();
    } else {
      para.push(line);
    }
    i++;
  }
  flushPara();
  return out;
}

function splitLines(s: string): string[] {
  return s.split(/\r?\n/);
}

function splitTableRow(row: string): string[] {
  // Strip optional leading/trailing pipes then split on |. Cells are
  // trimmed for whitespace.
  const trimmed = row.trim().replace(/^\||\|$/g, '');
  return trimmed.split('|').map((c) => c.trim());
}

interface InlineToken {
  kind: 'plain' | 'bold' | 'italic' | 'code' | 'link' | 'strike' | 'highlight';
  text: string;
  /** Only set for kind === 'link'. The same URL is used for href + text. */
  href?: string;
}

function tokenizeInline(s: string): InlineToken[] {
  const out: InlineToken[] = [];
  // Order matters: inline code (literal) wins over emphasis so a
  // backticked URL doesn't get autolinked. Then bold > italic > link.
  // Autolinks match bare http/https URLs only; markdown link syntax
  // is intentionally not parsed to keep the href whitelist tight.
  const pattern =
    /(`[^`\n]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(~~[^~]+~~)|(==[^=]+==)|(https?:\/\/[^\s)>\]"']+)/g;
  let cur = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(s)) !== null) {
    if (m.index > cur) out.push({ kind: 'plain', text: s.slice(cur, m.index) });
    if (m[1]) out.push({ kind: 'code', text: m[1].slice(1, -1) });
    else if (m[2]) out.push({ kind: 'bold', text: m[2].slice(2, -2) });
    else if (m[3]) {
      // *italic*. Underscore emphasis is intentionally unsupported because
      // scientific identifiers such as time_s and temperature_c are common
      // CLIO output and must never be reformatted into "times".
      out.push({ kind: 'italic', text: m[3].slice(1, -1) });
    } else if (m[4]) out.push({ kind: 'strike', text: m[4].slice(2, -2) });
    else if (m[5]) out.push({ kind: 'highlight', text: m[5].slice(2, -2) });
    else if (m[6]) {
      // Strip a trailing punctuation char that the regex greedily ate
      // so "see https://example.com." renders as a clean link.
      let url = m[6];
      let trailing = '';
      while (url.length > 0 && /[.,;:!?)]/.test(url.slice(-1))) {
        trailing = url.slice(-1) + trailing;
        url = url.slice(0, -1);
      }
      out.push({ kind: 'link', text: url, href: url });
      if (trailing) out.push({ kind: 'plain', text: trailing });
    }
    cur = pattern.lastIndex;
  }
  if (cur < s.length) out.push({ kind: 'plain', text: s.slice(cur) });
  return out;
}

function renderToken(t: InlineToken) {
  switch (t.kind) {
    case 'bold':
      return <strong>{t.text}</strong>;
    case 'italic':
      return <em>{t.text}</em>;
    case 'code':
      return <code class="im__inline-code">{t.text}</code>;
    case 'strike':
      return <s class="im__strike">{t.text}</s>;
    case 'highlight':
      return <mark class="im__highlight">{t.text}</mark>;
    case 'link':
      return (
        <a
          class="im__link"
          href={t.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.text}
        </a>
      );
    case 'plain':
    default:
      return <span>{t.text}</span>;
  }
}
