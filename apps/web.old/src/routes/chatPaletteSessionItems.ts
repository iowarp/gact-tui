/**
 * Builds the session-category slash-palette items (jump to session, detached
 * session entries).
 */
import type { SlashCommand } from '../components/SlashPalette.js';
import type { SessionRow } from '../components/SessionsColumn.js';
import { detachedAgo, type DetachedSession } from '../detached.js';

export function sessionJumpItems(sessions: readonly SessionRow[]): SlashCommand[] {
  return sessions.slice(0, 12).map((session) => ({
    id: `jump:${session.id}`,
    trigger: `> ${session.title}`,
    description: session.workspace
      ? `Switch to session in ${session.workspace}`
      : 'Switch to session',
    category: 'jump',
  }));
}

export function detachedSessionItems(
  detachedSessions: readonly DetachedSession[] | undefined,
  sessions: readonly SessionRow[],
): SlashCommand[] {
  const attached = new Set(sessions.map((session) => session.id));
  return (detachedSessions ?? [])
    .filter((detached) => !attached.has(detached.id))
    .map((detached) => ({
      id: `detached:${detached.id}`,
      trigger: `↶ ${detached.title}`,
      description: `Walked away ${detachedAgo(detached.detachedAt)} — Ctrl+. to dismiss`,
      category: 'jump',
    }));
}
