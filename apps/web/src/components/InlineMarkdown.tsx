import { For } from 'solid-js';

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
 *   - inline `code`
 *   - **bold**
 *   - *italic*
 *
 * Does NOT support: raw HTML, images, links (autolinking can come later
 * with a URL whitelist; for v0.9 we render URLs as plain text to keep
 * the XSS surface zero). All text is inserted via textContent — no
 * dangerouslyInnerHTML, no DOMPurify dependency, no surface for script
 * injection from LM output.
 */
export function InlineMarkdown(props: InlineMarkdownProps) {
  const blocks = () => splitBlocks(props.text);
  return (
    <div class="im">
      <For each={blocks()}>
        {(b) => {
          if (b.kind === 'code') {
            return (
              <pre class={'im__code ' + (b.lang ? `im__code--${b.lang}` : '')}>
                <code>{b.body}</code>
              </pre>
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

type Block =
  | { kind: 'text'; body: string }
  | { kind: 'code'; lang: string | null; body: string };

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
      // Skip the closing fence if we found one
      if (i < lines.length) i++;
      out.push({ kind: 'code', lang, body: body.join('\n') });
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

interface InlineToken {
  kind: 'plain' | 'bold' | 'italic' | 'code';
  text: string;
}

function tokenizeInline(s: string): InlineToken[] {
  const out: InlineToken[] = [];
  // Apply rules in order of priority: inline code → bold → italic.
  // Splitting by regex with capture groups so we keep matched + unmatched
  // chunks in one pass.
  const pattern = /(`[^`\n]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)/g;
  let cur = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(s)) !== null) {
    if (m.index > cur) out.push({ kind: 'plain', text: s.slice(cur, m.index) });
    if (m[1]) out.push({ kind: 'code', text: m[1].slice(1, -1) });
    else if (m[2]) out.push({ kind: 'bold', text: m[2].slice(2, -2) });
    else if (m[3]) out.push({ kind: 'italic', text: m[3].slice(1, -1) });
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
    case 'plain':
    default:
      return <span>{t.text}</span>;
  }
}
