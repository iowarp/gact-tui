/**
 * Constants/registry for Composer Paste. Key export `PASTE_PLACEHOLDER_RE`.
 */
export const PASTE_PLACEHOLDER_RE = /\[pasted (\d+) lines? · click to expand · #([a-z0-9]+)\]/g;

export interface CompressedPasteInsertion {
  id: string;
  placeholder: string;
  nextText: string;
  caret: number;
}

export interface ExpandedPaste {
  id: string;
  nextText: string;
}

export function expandCompressedPastes(text: string, stash: Record<string, string>): string {
  return text.replace(PASTE_PLACEHOLDER_RE, (whole, _lines, id) => stash[id] ?? whole);
}

export function createCompressedPasteInsertion(args: {
  current: string;
  pasted: string;
  selectionStart: number;
  selectionEnd: number;
  id: string;
}): CompressedPasteInsertion {
  const lines = args.pasted.split(/\r?\n/).length;
  const placeholder = `[pasted ${lines} lines · click to expand · #${args.id}]`;
  const before = args.current.slice(0, args.selectionStart);
  const after = args.current.slice(args.selectionEnd);
  const nextText = before + placeholder + after;
  return {
    id: args.id,
    placeholder,
    nextText,
    caret: (before + placeholder).length,
  };
}

export function expandLatestCompressedPaste(
  current: string,
  stash: Record<string, string>,
): ExpandedPaste | null {
  let lastIdx = -1;
  let lastId = '';
  let lastWhole = '';
  let match: RegExpExecArray | null;
  const re = new RegExp(PASTE_PLACEHOLDER_RE.source, 'g');
  while ((match = re.exec(current)) !== null) {
    if (match.index > lastIdx) {
      lastIdx = match.index;
      lastId = match[2] ?? '';
      lastWhole = match[0];
    }
  }
  if (lastIdx < 0 || !lastId) return null;
  const expansion = stash[lastId] ?? '';
  return {
    id: lastId,
    nextText: current.slice(0, lastIdx) + expansion + current.slice(lastIdx + lastWhole.length),
  };
}
