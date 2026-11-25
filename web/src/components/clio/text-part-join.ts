/**
 * How two text parts of one reply join when nothing visible sits between them.
 *
 * Adjacent stream chunks keep their own spacing. Parts split by an unshown part
 * (an empty thought, a transport note, a turn boundary) stay one sentence when
 * the first ends mid-sentence and the second continues it; otherwise they are
 * separate paragraphs. Code (an open fence, or a part that opens one) is never
 * joined into a sentence.
 */
export function textPartSeparator(previous: string, next: string, adjacent: boolean): string {
  if (adjacent || /\s$/u.test(previous) || /^\s/u.test(next)) return '';
  if (!continuesSentence(previous, next)) return '\n\n';
  return /^[,;:.)\]\u3001\u3002]/u.test(next) || (cjk(previous.at(-1)) && cjk(next[0])) ? '' : ' ';
}

/** Whether `next` reads as the rest of the sentence `previous` left open. */
export function continuesSentence(previous: string, next: string): boolean {
  const before = previous.trimEnd();
  const after = next.trimStart();
  if (!before || !after) return false;
  if (openCodeFence(before) || /^\s*(```|~~~)/u.test(after)) return false;
  // A heading, list item, table row or quote ends its own line.
  const lastLine = before.slice(before.lastIndexOf('\n') + 1);
  if (/^\s*(#|[-*+]\s|\d+[.)]\s|\||>)/u.test(lastLine)) return false;
  if (cjk(before.at(-1)) && cjk(after[0])) return true;
  // A sentence still open: a word, number, comma or connective dash at its end,
  // and the remainder starting with a lower-case word, a number, inline code, a
  // link, or punctuation that only follows a word.
  return /[\p{L}\p{N},\u2013\u2014-]$/u.test(before) && /^[\p{Ll}\p{N},;:.)\]`([]/u.test(after);
}

function cjk(character: string | undefined): boolean {
  return Boolean(
    character && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character),
  );
}

function openCodeFence(text: string): boolean {
  return (text.match(/^\s*(```|~~~)/gmu)?.length ?? 0) % 2 === 1;
}
