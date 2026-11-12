import type { ThemedToken } from 'shiki';

/** The browser's default `tab-size`, which source views keep. */
const TAB_COLUMNS = 8;

export interface SourceIndent {
  /** The line's leading whitespace, rendered unbreakable so a wrap never starts inside it. */
  lead: string;
  /** Its width in character columns, so continuation rows can hang at that column. */
  columns: number;
  /** The rest of the line's tokens, without the leading whitespace. */
  rest: ThemedToken[];
}

/** Columns that `lead` occupies, counting tabs to the next tab stop. */
export function indentColumns(lead: string): number {
  let columns = 0;
  for (const char of lead)
    columns = char === '\t' ? (Math.floor(columns / TAB_COLUMNS) + 1) * TAB_COLUMNS : columns + 1;
  return columns;
}

/**
 * Split a highlighted line into its indentation and the rest. A wrapped source
 * line keeps its indent: the indent cannot break, and continuation rows hang
 * at the indent's column instead of restarting at the code's column 0.
 */
export function splitIndent(tokens: readonly ThemedToken[]): SourceIndent {
  let lead = '';
  const rest: ThemedToken[] = [];
  for (const [index, token] of tokens.entries()) {
    const whitespace = /^[ \t]*/u.exec(token.content)?.[0] ?? '';
    if (whitespace.length < token.content.length) {
      lead += whitespace;
      rest.push(
        whitespace
          ? {
              ...token,
              content: token.content.slice(whitespace.length),
              offset: token.offset + whitespace.length,
            }
          : token,
        ...tokens.slice(index + 1),
      );
      return { lead, columns: indentColumns(lead), rest };
    }
    lead += token.content;
  }
  // A whitespace-only line has nothing to wrap.
  return { lead: '', columns: 0, rest: [...tokens] };
}

/** The leading whitespace of plain text. */
export function leadingWhitespace(text: string): string {
  return /^[ \t]*/u.exec(text)?.[0] ?? '';
}
