import { isRecord } from '../../wire/presentationUtils';

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

/**
 * A content block's mime type, tolerating both MCP-native camelCase
 * `mimeType` (a tool_result's `content` mirrors the raw MCP CallToolResult
 * shape) and this wire's own snake_case `mime_type`/`media_type` spellings
 * used elsewhere on the wire (PartResourceLink, PartImage) — never guessed,
 * only read off whichever spelling is actually present.
 */
function blockMimeType(block: Record<string, unknown>): string {
  return str(block['mimeType'] ?? block['mime_type'] ?? block['media_type']);
}

/** An inline-renderable image resolved from a tool_result content block. */
export interface ContentImageBlock {
  mimeType: string;
  data?: string;
  url?: string;
}

/**
 * The FIRST tool_result content block that resolves to an inline-renderable
 * image: `type: 'image'`, or any block whose mime type starts with
 * `image/`, carrying either base64 `data` or a `url`. `null` when `content`
 * is absent or carries no such block — image detection never guesses from
 * the tool name.
 */
export function extractImageBlock(part: Record<string, unknown>): ContentImageBlock | null {
  const content = part['content'];
  if (!Array.isArray(content)) return null;
  for (const child of content) {
    if (!isRecord(child)) continue;
    const mimeType = blockMimeType(child);
    const looksLikeImage = child['type'] === 'image' || mimeType.startsWith('image/');
    if (!looksLikeImage) continue;
    const data = str(child['data']);
    const url = str(child['url']);
    if (!data && !url) continue;
    return { mimeType: mimeType || 'image/*', ...(data ? { data } : {}), ...(url ? { url } : {}) };
  }
  return null;
}

/**
 * The FIRST tool_result content block explicitly marked `text/csv`. Returns
 * its raw text, or `null` when `content` is absent or carries no block with
 * that mime type — CSV detection is mime-type-driven, never a filename or
 * shape guess.
 */
export function extractCsvBlock(part: Record<string, unknown>): string | null {
  const content = part['content'];
  if (!Array.isArray(content)) return null;
  for (const child of content) {
    if (!isRecord(child)) continue;
    if (blockMimeType(child) !== 'text/csv') continue;
    const text = str(child['text']);
    if (text) return text;
  }
  return null;
}

/**
 * A tool_result's `structured_content` field — a typed payload some tools
 * attach alongside (or instead of) `content` (MCP `structuredContent`, or
 * this wire's own snake_case `structured_content`). This only reads the raw
 * value off the wire; classifying its shape (object vs. uniform array vs.
 * anything else) is the renderer's job.
 */
export function extractStructuredContent(part: Record<string, unknown>): unknown {
  return part['structured_content'] ?? part['structuredContent'];
}
