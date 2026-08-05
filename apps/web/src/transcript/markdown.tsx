/**
 * Minimal markdown for transcript prose and MD artifact previews.
 *
 * The ported render contract (web.old RENDERING_SPEC:338, "Markdown
 * everywhere… NEVER literal **asterisks**") in the transcript's own type
 * system: ONE mono font at body size, differentiation by weight + color only
 * (headings bold, links cyan) — see `markdown.css`, lifted from
 * web.old/src/components/inline-markdown.css.
 *
 * Deliberately small: headings, bold/italic, inline + fenced code, lists,
 * links, GFM tables, paragraphs with preserved newlines. Anything else renders
 * as plain text — never dropped, never HTML-injected (no
 * dangerouslySetInnerHTML anywhere; every node is a React element).
 */
import type { ReactNode } from 'react';
import './markdown.css';

const INLINE_TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const key = `${keyBase}:${n++}`;
    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else {
      const split = token.indexOf('](');
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);
      // External links open away from the app; artifact:// and other
      // non-http schemes render as plain code — a dead link is worse.
      if (href.startsWith('http://') || href.startsWith('https://')) {
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>,
        );
      } else {
        nodes.push(<code key={key}>{label}</code>);
      }
    }
    last = at + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'para'; lines: string[] };

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length > 2;
}

function isTableSeparator(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|$/.test(line.trim());
}

function splitRow(line: string): string[] {
  return line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed === '') {
      i++;
      continue;
    }
    if (trimmed.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) {
        code.push(lines[i]!);
        i++;
      }
      i++; // closing fence (or end of input)
      blocks.push({ kind: 'code', lines: code });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]! });
      i++;
      continue;
    }
    const unordered = /^[-*]\s+/.test(trimmed);
    const ordered = /^\d+[.)]\s+/.test(trimmed);
    if (unordered || ordered) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i]!.trim();
        if (unordered && /^[-*]\s+/.test(item)) items.push(item.replace(/^[-*]\s+/, ''));
        else if (ordered && /^\d+[.)]\s+/.test(item)) items.push(item.replace(/^\d+[.)]\s+/, ''));
        else break;
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      const rows: string[][] = [splitRow(trimmed)];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]!)) {
        rows.push(splitRow(lines[i]!));
        i++;
      }
      blocks.push({ kind: 'table', rows });
      continue;
    }
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i]!;
      const nextTrim = next.trim();
      if (
        nextTrim === '' ||
        nextTrim.startsWith('```') ||
        /^#{1,6}\s+/.test(nextTrim) ||
        /^[-*]\s+/.test(nextTrim) ||
        /^\d+[.)]\s+/.test(nextTrim) ||
        isTableRow(nextTrim)
      ) {
        break;
      }
      para.push(next);
      i++;
    }
    blocks.push({ kind: 'para', lines: para });
  }
  return blocks;
}

export interface MarkdownProps {
  text: string;
}

export function Markdown({ text }: MarkdownProps) {
  const blocks = parseBlocks(text);
  return (
    <div className="md" data-testid="markdown">
      {blocks.map((block, bi) => {
        const key = `b${bi}`;
        switch (block.kind) {
          case 'heading': {
            // Weight+color-only scale: every heading is the SAME size, bold.
            // Semantic level survives as data for tests and future styling.
            return (
              <p key={key} className="md-h" data-level={block.level} role="heading" aria-level={block.level}>
                {renderInline(block.text, key)}
              </p>
            );
          }
          case 'code':
            return (
              <pre key={key}>
                <code>{block.lines.join('\n')}</code>
              </pre>
            );
          case 'list': {
            const items = block.items.map((item, ii) => (
              <li key={`${key}:${ii}`}>{renderInline(item, `${key}:${ii}`)}</li>
            ));
            return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
          }
          case 'table':
            return (
              <table key={key}>
                <thead>
                  <tr>
                    {block.rows[0]!.map((cell, ci) => (
                      <th key={ci}>{renderInline(cell, `${key}:h${ci}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.slice(1).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{renderInline(cell, `${key}:${ri}:${ci}`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          default:
            return <p key={key}>{renderInline(block.lines.join('\n'), key)}</p>;
        }
      })}
    </div>
  );
}
