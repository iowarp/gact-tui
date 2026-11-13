import type { McpAppReopenedView } from '@clio/core/v3';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Which transcript cards were reopened, and the fresh view each now shows
 * (plan MA19). Kept per browser so a reload remounts the reopened view while
 * CLIO still holds it; when CLIO no longer does, the card offers reopen again.
 */
const STORAGE_KEY = 'clio.mcp-app.reopened.v1';
const listeners = new Set<() => void>();
let views: Record<string, McpAppReopenedView> = readStored();

function key(sessionId: string, appInstanceId: string): string {
  return `${sessionId}\n${appInstanceId}`;
}

function readStored(): Record<string, McpAppReopenedView> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, McpAppReopenedView>)
      : {};
  } catch {
    return {};
  }
}

function writeStored(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // Storage full or blocked: the reopened view still shows until reload.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Record (or clear) the view a card reopened. */
export function setReopenedMcpApp(
  sessionId: string,
  appInstanceId: string,
  view: McpAppReopenedView | undefined,
): void {
  const id = key(sessionId, appInstanceId);
  const next = { ...views };
  if (view) next[id] = view;
  else delete next[id];
  views = next;
  writeStored();
  for (const listener of listeners) listener();
}

/** The fresh view the card for `appInstanceId` reopened, if any. */
export function useReopenedMcpApp(
  sessionId: string,
  appInstanceId: string,
): McpAppReopenedView | undefined {
  const snapshot = useCallback(
    () => views[key(sessionId, appInstanceId)],
    [appInstanceId, sessionId],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
