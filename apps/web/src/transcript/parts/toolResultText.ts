const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

/**
 * A tool_result's `content` is a LIST OF PARTS on the wire, never a string.
 *
 * This is the FULL text, never truncated — the caller decides how much of it
 * to show (a collapsed preview line vs. the opened well). Truncating here
 * would cut a real error mid-token with no way for the reader to see the
 * rest, which is exactly the bug this helper replaces (gact-tui#333 E6).
 */
export function extractToolResultText(part: Record<string, unknown>): string {
  const content = part['content'];
  if (Array.isArray(content)) {
    const text = content
      .map((child) =>
        child && typeof child === 'object' ? str((child as Record<string, unknown>)['text']) : str(child),
      )
      .filter((chunk) => chunk.length > 0)
      .join('\n');
    if (text) return text;
    // Content present but carrying no text: say so rather than render blank.
    return content.length > 0 ? `${content.length} non-text result part(s)` : '';
  }
  return str(content ?? part['output'] ?? part['text']);
}
