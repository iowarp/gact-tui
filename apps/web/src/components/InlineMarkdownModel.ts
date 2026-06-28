/**
 * View-model / pure logic for Inline Markdown: state shaping and helpers, no DOM. Key export `normalizeCompactMarkdown`.
 */
import type { Block } from './InlineMarkdownTypes.js';

export { tokenizeInline } from './InlineMarkdownInlineTokens.js';
export type { Block, InlineToken } from './InlineMarkdownTypes.js';

export function normalizeCompactMarkdown(text: string): string {
  if (!/\|[-:\s|]{3,}\|/.test(text)) return text;
  return text.replace(
    /(\|)\s+(?=\|(?:\s*[-:]{3,}|\s*\d+\s*\||\s*[A-Za-z][^|\n]{0,80}\s*\|))/g,
    '$1\n',
  );
}

export function splitBlocks(text: string): Block[] {
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
      if (sepCells.length > 0 && sepCells.every((c) => /^[-:]+$/.test(c.trim()))) {
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

export function splitLines(s: string): string[] {
  return s.split(/\r?\n/);
}

function splitTableRow(row: string): string[] {
  // Strip optional leading/trailing pipes then split on |. Cells are
  // trimmed for whitespace.
  const trimmed = row.trim().replace(/^\||\|$/g, '');
  return trimmed.split('|').map((c) => c.trim());
}
