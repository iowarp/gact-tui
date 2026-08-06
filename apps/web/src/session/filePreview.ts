/**
 * Pure decoder from a workspace file-read result to a rendered preview shape
 * (owner defect A1: FilesLayer parsed the read route's body as JSON — the
 * route (`clio-agent routes/workspaces.py::read_workspace_file`) serves text
 * files decoded raw and binary files as raw bytes with a real content type,
 * never a JSON envelope. `client.readWorkspaceFile` already fetches through
 * `client.response()`/`arrayBuffer()` instead of `client.get()`'s forced
 * `res.json()` (the same pattern `detail/preview.ts` uses for artifact
 * bytes) and normalizes to base64 + a sniffed `media_type`; this module
 * turns that into what the tree/content pane renders — raw text stays raw,
 * CSV becomes a bounded table, anything non-text becomes an honest "binary
 * file (N bytes)" notice instead of a parse error.
 */

const CSV_ROW_LIMIT = 200;

export type FilePreview =
  | { kind: 'text'; text: string }
  | { kind: 'csv'; header: string[]; rows: string[][]; totalRows: number }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'binary'; size: number; mediaType: string };

/** The subset of ReadWorkspaceFileResult (@clio/core) this module needs. */
export interface WorkspaceFileReadResult {
  data: string;
  media_type: string;
  size: number;
}

function isTextMediaType(mediaType: string): boolean {
  return mediaType.startsWith('text/') || mediaType === 'application/json';
}

/** Decode a base64 payload as UTF-8 text (the inverse of `bytesToBase64`). */
export function base64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Shape a workspace file-read result for rendering. Never throws on
 * non-text bytes — a binary payload becomes a `binary` preview rather than
 * an attempted (and corrupting) UTF-8 decode.
 */
export function decodeWorkspaceFilePreview(
  result: WorkspaceFileReadResult,
  path: string,
): FilePreview {
  const mediaType = result.media_type || 'application/octet-stream';
  if (mediaType.startsWith('image/')) {
    return { kind: 'image', dataUrl: `data:${mediaType};base64,${result.data}` };
  }
  if (!isTextMediaType(mediaType)) {
    return { kind: 'binary', size: result.size, mediaType };
  }
  const text = base64ToUtf8(result.data);
  if (mediaType === 'text/csv' || /\.csv$/i.test(path)) {
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    const header = (lines[0] ?? '').split(',');
    const rows = lines.slice(1, 1 + CSV_ROW_LIMIT).map((line) => line.split(','));
    return { kind: 'csv', header, rows, totalRows: Math.max(lines.length - 1, 0) };
  }
  return { kind: 'text', text };
}

export interface FrontmatterSplit {
  /**
   * The raw block between the delimiters, or `null` when the text doesn't
   * open with a *closed* frontmatter block. An opening `---` with no
   * matching close is left alone (frontmatter stays `null`, `body` is the
   * whole input) rather than guessed at — a bare `---` is also valid
   * markdown (a horizontal rule / setext heading underline) and misreading
   * one as an unclosed frontmatter open would silently eat real content.
   */
  frontmatter: string | null;
  /** Everything after the closing delimiter, or the whole input verbatim
   * when there's no frontmatter block — never truncated, never re-flowed. */
  body: string;
}

/**
 * Split a LEADING YAML-frontmatter block (bp blueprint `experts/*.md`,
 * `AGENT.md`) off the markdown body that follows it.
 *
 * Root cause this exists for (round-7 finding, blueprint explorer):
 * `experts/main.md` opens with `---\nid: main\n...\n---` before its real
 * `# heading`, and that frontmatter block itself contains YAML *comment*
 * lines (`# Small-model-friendly pack: ...`) that collide with the
 * transcript Markdown module's block grammar — `# ` at the start of a line
 * is a first-class markdown heading token there, so those comments were
 * misparsed as extra headings while the raw `key: value` lines and both
 * `---` delimiters leaked into the rendered body as unstyled prose. Neither
 * half is dropped by this split: the frontmatter is returned separately for
 * an honest raw (dimmed, non-parsed) render, and only the real body is fed
 * to the markdown block parser.
 */
export function splitFrontmatter(text: string): FrontmatterSplit {
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') {
    return { frontmatter: null, body: text };
  }
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] ?? '').trim() === '---') {
      return {
        frontmatter: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
      };
    }
  }
  return { frontmatter: null, body: text };
}
