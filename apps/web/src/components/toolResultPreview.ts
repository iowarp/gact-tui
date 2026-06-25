/**
 * BACKEND-AGNOSTIC tool-result analysis.
 *
 * GACT renders a tool result by WHAT THE CONTENT IS, never by the tool's NAME
 * (contract/SPEC.md: "Unknown names MUST render as a generic row without special
 * handling"). This module classifies the result via {@link detectToolResultContent}
 * (see toolResultContent.ts) and exposes the detected content plus a short
 * collapsed preview line and the full raw body for the expand affordance.
 *
 * Mirrors the TUI's content-type previews (executionSpecificObservationPreview /
 * collapseForPreview in tui/internal/ui). No tool name, expert name, or backend
 * workflow vocabulary appears here.
 */

import { detectToolResultContent, type ToolResultContent } from './toolResultContent.js';

/** Result of analysing a tool result string. */
export interface ToolResultAnalysis {
  /** The detected content type + its render data. */
  content: ToolResultContent;
  /** Short, human-readable collapsed preview line. */
  preview: string;
  /** The full, pretty-printed result body for the expand affordance. */
  full: string;
  /** When the result references an image artifact, its path (for inline render). */
  imagePath?: string;
}

/**
 * Analyse a tool result into its content type + a collapsed preview + the full
 * raw body. Backend-agnostic: the result is classified by content, not by tool
 * name.
 */
export function analyzeToolResult(raw: string): ToolResultAnalysis {
  const text = (raw ?? '').trim();
  if (!text) return { content: { kind: 'text', text: '' }, preview: '', full: '' };

  const content = detectToolResultContent(text);
  const full = fullBody(content, text);
  const preview = previewLine(content);

  const analysis: ToolResultAnalysis = { content, preview, full };
  if (content.kind === 'image') analysis.imagePath = content.path;
  return analysis;
}

/** The full body shown behind "show raw" — the pretty JSON for structured
 *  results, the diff/text/table source otherwise. */
function fullBody(content: ToolResultContent, raw: string): string {
  switch (content.kind) {
    case 'json':
      return content.full;
    case 'diff':
      return content.diff;
    case 'markdown':
    case 'text':
      return content.text || raw.trim();
    case 'image':
      return raw.trim();
    case 'table':
      return raw.trim();
  }
}

/** A short collapsed preview line for the content type. */
function previewLine(content: ToolResultContent): string {
  switch (content.kind) {
    case 'image':
      return baseName(content.path);
    case 'diff': {
      const added = (content.diff.match(/^\+(?!\+\+)/gm) ?? []).length;
      const removed = (content.diff.match(/^-(?!--)/gm) ?? []).length;
      return `diff · +${added} −${removed}`;
    }
    case 'table': {
      const cols = content.columns.map((c) => c.name).join(', ');
      const rows = content.rowCount != null ? ` · ${content.rowCount} rows` : '';
      return `${content.columns.length} columns${rows}\n${clip(cols, 120)}`;
    }
    case 'json':
      return content.preview;
    case 'markdown':
    case 'text':
      return firstLines(content.text, 6);
  }
}

function baseName(path: string): string {
  const cleaned = path.replace(/[/\\]+$/, '');
  const idx = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** First n lines, hard-clamped so a single giant line can never become a wall. */
function firstLines(s: string, n: number, maxChars = 360): string {
  const lines = s.split('\n').slice(0, n).join('\n');
  if (lines.length <= maxChars) return lines;
  return lines.slice(0, maxChars).replace(/\s+\S*$/, '') + ' …';
}
