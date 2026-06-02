/**
 * Detached-session registry. Mirrors the TUI's "walked-away" list:
 * the user explicitly steps away from a running session (via Ctrl+
 * Shift+D in the desktop, Ctrl+Z in the TUI) and the next time the
 * app starts, the palette surfaces it for quick re-entry.
 *
 * Persisted per backend URL so two different clio backends don't
 * pollute each other's lists. The stored shape is intentionally a
 * superset of the SidebarSession row so the palette can render a
 * preview without re-fetching anything.
 */

const KEY_PREFIX = 'clio.detached.';

export interface DetachedSession {
  id: string;
  title: string;
  detachedAt: number;
  preview?: string;
  workspace?: string;
}

function keyFor(backendUrl: string): string {
  return `${KEY_PREFIX}${backendUrl.replace(/\/+$/, '')}`;
}

function safeRead(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Returns the detached list for a backend, newest first. */
export function listDetached(backendUrl: string): DetachedSession[] {
  const ls = safeRead();
  if (!ls) return [];
  try {
    const raw = ls.getItem(keyFor(backendUrl));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (v): v is DetachedSession =>
          !!v && typeof v === 'object' && typeof (v as DetachedSession).id === 'string',
      )
      .sort((a, b) => b.detachedAt - a.detachedAt);
  } catch {
    return [];
  }
}

/** Adds (or refreshes) a detached entry. Caps the list at 20 to keep
 * the palette tidy. */
export function addDetached(
  backendUrl: string,
  entry: Omit<DetachedSession, 'detachedAt'>,
): void {
  const ls = safeRead();
  if (!ls) return;
  const cur = listDetached(backendUrl).filter((d) => d.id !== entry.id);
  const next = [{ ...entry, detachedAt: Date.now() }, ...cur].slice(0, 20);
  try {
    ls.setItem(keyFor(backendUrl), JSON.stringify(next));
  } catch {
    /* quota / private mode — best effort */
  }
}

/** Removes an entry — fires when the user re-attaches the session or
 * explicitly dismisses it from the palette. */
export function removeDetached(backendUrl: string, sessionId: string): void {
  const ls = safeRead();
  if (!ls) return;
  const cur = listDetached(backendUrl).filter((d) => d.id !== sessionId);
  try {
    if (cur.length === 0) ls.removeItem(keyFor(backendUrl));
    else ls.setItem(keyFor(backendUrl), JSON.stringify(cur));
  } catch {
    /* ignore */
  }
}

/** Humanizes "walked away N ago" for the palette hint. */
export function detachedAgo(detachedAt: number): string {
  const delta = Date.now() - detachedAt;
  const min = Math.round(delta / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
