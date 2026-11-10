import type { ReactNode } from 'react';

const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/gu;

/** One line of JSON in theme syntax colors: keys, strings, numbers and literals. */
export function jsonLine(line: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(JSON_TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(line.slice(last, start));
    const [token, text, colon, number, literal] = match;
    const tone = colon
      ? 'text-[var(--syntax-token-constant)]'
      : text
        ? 'text-[var(--syntax-token-string-expression)]'
        : number || literal
          ? 'text-[var(--syntax-token-function)]'
          : undefined;
    parts.push(
      <span className={tone} key={start}>
        {colon ? text : token}
      </span>,
    );
    if (colon) parts.push(colon);
    last = start + token.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}
