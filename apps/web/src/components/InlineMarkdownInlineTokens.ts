/**
 * Inline Markdown Inline Tokens: helpers. Key export `tokenizeInline`.
 */
import type { InlineToken } from './InlineMarkdownTypes.js';

export function tokenizeInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  const pattern =
    /(`[^`\n]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(~~[^~]+~~)|(==[^=]+==)|(https?:\/\/[^\s)>\]"']+)/g;
  let cur = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cur) out.push({ kind: 'plain', text: text.slice(cur, match.index) });
    if (match[1]) out.push({ kind: 'code', text: match[1].slice(1, -1) });
    else if (match[2]) out.push({ kind: 'bold', text: match[2].slice(2, -2) });
    else if (match[3]) out.push({ kind: 'italic', text: match[3].slice(1, -1) });
    else if (match[4]) out.push({ kind: 'strike', text: match[4].slice(2, -2) });
    else if (match[5]) out.push({ kind: 'highlight', text: match[5].slice(2, -2) });
    else if (match[6]) appendLinkToken(out, match[6]);
    cur = pattern.lastIndex;
  }
  if (cur < text.length) out.push({ kind: 'plain', text: text.slice(cur) });
  return out;
}

function appendLinkToken(out: InlineToken[], rawUrl: string) {
  let url = rawUrl;
  let trailing = '';
  while (url.length > 0 && /[.,;:!?)]/.test(url.slice(-1))) {
    trailing = url.slice(-1) + trailing;
    url = url.slice(0, -1);
  }
  out.push({ kind: 'link', text: url, href: url });
  if (trailing) out.push({ kind: 'plain', text: trailing });
}
