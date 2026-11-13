/**
 * A person's message is markdown, and the markdown renderer reads `<word ...>` as an
 * HTML tag and drops it: a prompt template's `<AGREES or DISAGREES>` would vanish from
 * the page. That loses words, and it also breaks every feature that lines the page up
 * with the source text (attention heat is matched against the whole message).
 *
 * This escapes each `<` that would open a tag (`<` before a letter, `/`, `!` or `?`) so
 * it renders as written. Code is left alone, since a backslash would show there: fenced
 * blocks, inline code spans, and indented code blocks.
 */
const TAG_OPEN = /<(?=[A-Za-z/!?])/gu;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const INLINE_CODE = /(`+)[\s\S]*?\1/gu;

function escapeOutsideInlineCode(line: string): string {
  let out = '';
  let last = 0;
  for (const match of line.matchAll(INLINE_CODE)) {
    out += line.slice(last, match.index).replace(TAG_OPEN, '\\<') + match[0];
    last = match.index + match[0].length;
  }
  return out + line.slice(last).replace(TAG_OPEN, '\\<');
}

export function escapeTagLikeText(text: string): string {
  if (!text.includes('<')) return text;
  let fence: string | undefined;
  let previousBlank = true;
  return text
    .split('\n')
    .map((line) => {
      const opener = FENCE.exec(line)?.[1];
      if (fence) {
        if (opener?.startsWith(fence[0] ?? '') && opener.length >= fence.length) fence = undefined;
        return line;
      }
      if (opener) {
        fence = opener;
        return line;
      }
      const blank = line.trim() === '';
      // An indented code block starts after a blank line (otherwise it continues a paragraph).
      const indentedCode = previousBlank && /^(?: {4}|\t)/u.test(line);
      previousBlank = blank || (previousBlank && indentedCode);
      return indentedCode ? line : escapeOutsideInlineCode(line);
    })
    .join('\n');
}
