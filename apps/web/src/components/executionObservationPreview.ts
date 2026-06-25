/**
 * Renders a compact, content-typed preview of a tool observation for the
 * execution trace. BACKEND-AGNOSTIC: the preview is chosen by WHAT THE RESULT IS
 * (image / diff / table / structured / text), never by the tool's name
 * (contract/SPEC.md). The `toolName` parameter is retained only so the signature
 * is stable for callers; it is NOT used to special-case any tool.
 */
import { isRedacted } from './executionProjectionHelpers.js';
import { detectToolResultContent } from './toolResultContent.js';

export function observationPreview(_toolName: string, raw: unknown): string {
  const text = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw);
  if (!text || isRedacted(text) || /^(completed|done|ok)$/i.test(text.trim())) return '';

  const content = detectToolResultContent(text);
  switch (content.kind) {
    case 'image':
      return [content.path, 'show full image'].filter(Boolean).join('\n');
    case 'diff': {
      const added = (content.diff.match(/^\+(?!\+\+)/gm) ?? []).length;
      const removed = (content.diff.match(/^-(?!--)/gm) ?? []).length;
      return `diff · +${added} −${removed}\nshow full output`;
    }
    case 'table': {
      const header = content.columns.map((c) => c.name).join(', ');
      const rows = content.rows.slice(0, 3).map((r) => r.join(', '));
      const note = content.rowCount != null ? `${content.rowCount} rows` : '';
      return [header, ...rows, note, 'show full output'].filter(Boolean).join('\n');
    }
    case 'json':
      return content.preview;
    case 'markdown':
    case 'text': {
      const body = content.text;
      return body.length > 240 ? `${body.slice(0, 240)}…\nshow full output` : body;
    }
  }
}
