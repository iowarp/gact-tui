/**
 * A server's error text often ends in its machine code: "There is no scene a-1 here.
 * [unknown_scene]". The sentence is for the person; the code is a technical detail
 * (FP-D5). Only one trailing bracketed snake_case word counts as a code.
 */
const TRAILING_CODE = /\s*\[([a-z][a-z0-9]*(?:_[a-z0-9]+)+|[a-z]+)\]\s*$/u;

export function splitTrailingErrorCode(text: string): { sentence: string; code?: string } {
  const match = TRAILING_CODE.exec(text);
  if (!match || match.index === 0) return { sentence: text };
  return { sentence: text.slice(0, match.index).trimEnd(), code: match[1] };
}
