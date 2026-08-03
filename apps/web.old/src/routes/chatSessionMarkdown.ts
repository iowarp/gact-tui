/**
 * Serialises a message/session to Markdown for export. Exports
 * {@link messageToText} and {@link sessionToMarkdown}.
 */
import { brand } from '@brand';
import type { Message } from '@clio/core';

export function messageToText(msg: Message): string {
  return msg.parts
    .map((p) => {
      if (p.type === 'text') return p.text;
      if (p.type === 'thinking') return p.thinking ?? p.text ?? '';
      if (p.type === 'tool_call') return `[tool] ${p.tool_name}(${JSON.stringify(p.input ?? {})})`;
      if (p.type === 'tool_result')
        return typeof p.output === 'string' ? p.output : '[tool_result]';
      if (p.type === 'file_diff') return `[diff] ${p.path}`;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Convert a backend session-export payload to a readable Markdown
 * document. Best-effort: we mirror the shape exporter currently
 * returns: `{session: {...}, messages: [...]}` with each message
 * carrying `role` + `parts[]`.
 */
export function sessionToMarkdown(payload: unknown): string {
  const root = payload as {
    session?: { title?: string; id?: string; created_at?: string };
    messages?: Message[];
  };
  const sess = root.session ?? {};
  const messages = root.messages ?? [];
  const lines: string[] = [];
  lines.push(`# ${sess.title ?? `${brand.name} session`}`);
  if (sess.id) lines.push(`*Session* \`${sess.id}\``);
  if (sess.created_at) lines.push(`*Started* ${sess.created_at}`);
  lines.push('');
  for (const m of messages) {
    const role = m.role ? m.role.toUpperCase() : 'MESSAGE';
    lines.push(`---`);
    lines.push(`### ${role}`);
    const text = messageToText(m);
    if (text) lines.push('', text, '');
  }
  return lines.join('\n');
}
