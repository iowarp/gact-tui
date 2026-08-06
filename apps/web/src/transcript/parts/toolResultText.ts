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

/**
 * A command's OWN exit status — read off `structured_content.exit_code`
 * (the shell tool server's own field name, e.g. `shell_server.py`'s
 * `{"exit_code": completed.returncode, "stdout": ..., "stderr": ...}`) when
 * it is a NUMBER and non-zero.
 *
 * `is_error` on the wire tracks MCP-PROTOCOL success only — the tool call
 * itself ran and returned — never the command's own outcome. A shell
 * command that ran fine but exited non-zero still carries `is_error`
 * absent/false, with the failure carried here instead (A3, diagnosed
 * live: session sess_cda96b286e4f, call call_79f8fbdc63f7 — `is_error`
 * absent, `exit_code: 1`, a real `UnauthorizedAccessException` in
 * `stderr` — the row rendered a green success glyph). Both wire facts are
 * honest and stay untouched; this only reads the second one so the
 * renderer can react to it.
 *
 * `null` when `structured_content` is not an object, `exit_code` is
 * absent or not a finite number (never guessed from a string/other type),
 * or it is exactly `0` (success).
 */
export function commandExitCodeFailure(part: Record<string, unknown>): number | null {
  const structured = extractStructuredContent(part);
  if (!isRecord(structured)) return null;
  const exitCode = structured['exit_code'];
  if (typeof exitCode !== 'number' || !Number.isFinite(exitCode) || exitCode === 0) return null;
  return exitCode;
}

/**
 * One entry of a tool_result's OPTIONAL top-level `content_blocks` array
 * (clio-agent 285434f5, landing alongside kit 2.7.1's plot tools) — a
 * showcase a tool can declare ALONGSIDE its `structured_content`/`content`,
 * not instead of them: `{type, mimeType?, data?|uri?, text?, elided?,
 * bytes?}`. Distinct from the legacy MCP `content` array's own blocks
 * ({@link extractImageBlock}/{@link extractCsvBlock} read that field) — this
 * is a separate, newer wire field with its own shape (`uri` rather than
 * `url`; an `elided`/`bytes` pair for an oversize block the server declined
 * to inline, e.g. a >512KiB plot PNG).
 */
export interface WireContentBlock {
  type: string;
  mimeType?: string;
  data?: string;
  uri?: string;
  text?: string;
  /** A typed reason the payload was withheld (e.g.
   *  `content_block_oversize`) — `type`/`mimeType`/`bytes` still describe
   *  what was elided, so the reader sees an honest marker, never a broken
   *  `<img>` or a silently missing block. */
  elided?: string;
  bytes?: number;
}

/**
 * Reads and validates `content_blocks` off a tool_result part. Absent field
 * (every session before 285434f5, or a tool that simply has nothing to show)
 * -> `[]`, zero change from before. Each entry only keeps fields whose wire
 * type actually matches the declared shape — a malformed entry's `type` is
 * required (it drives every downstream dispatch), everything else is
 * optional and read defensively.
 */
export function extractContentBlocks(part: Record<string, unknown>): WireContentBlock[] {
  const raw = part['content_blocks'];
  if (!Array.isArray(raw)) return [];
  const blocks: WireContentBlock[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const type = item['type'];
    if (typeof type !== 'string' || type.length === 0) continue;
    const block: WireContentBlock = { type };
    if (typeof item['mimeType'] === 'string') block.mimeType = item['mimeType'];
    if (typeof item['data'] === 'string') block.data = item['data'];
    if (typeof item['uri'] === 'string') block.uri = item['uri'];
    if (typeof item['text'] === 'string') block.text = item['text'];
    if (typeof item['elided'] === 'string') block.elided = item['elided'];
    if (typeof item['bytes'] === 'number') block.bytes = item['bytes'];
    blocks.push(block);
  }
  return blocks;
}
