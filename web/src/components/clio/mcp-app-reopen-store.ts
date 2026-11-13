import type { ClioRepository, McpAppReopenedView, McpAppSavedCall } from '@clio/core/v3';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

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

/**
 * A view was reopened again (a restored tab replayed `from`): every card that
 * showed `from` now shows `view`, and so does a card whose own view was `from`.
 */
export function replaceReopenedMcpApp(
  sessionId: string,
  from: string,
  view: McpAppReopenedView,
): void {
  const next: Record<string, McpAppReopenedView> = {};
  for (const [id, current] of Object.entries(views)) {
    next[id] = id.startsWith(`${sessionId}\n`) && current.appInstanceId === from ? view : current;
  }
  next[key(sessionId, from)] = view;
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

/**
 * Whether CLIO still holds a card's own view. Asked before mounting so that a
 * closed view reads as closed rather than as a failed descriptor request.
 */
export function useMcpAppHeld(
  repository: Pick<ClioRepository, 'mcpAppLive'> | undefined,
  sessionId: string,
  appInstanceId: string,
  dataRef: string,
  wanted: boolean,
): boolean | undefined {
  const [held, setHeld] = useState<{ key: string; value: boolean }>();
  const key = `${sessionId}\n${appInstanceId}\n${dataRef}`;
  useEffect(() => {
    if (!wanted || !repository) return;
    const controller = new AbortController();
    void repository
      .mcpAppLive({ sessionId, appInstanceId, dataRef }, controller.signal)
      // An unreachable CLIO lets the surface mount and report its own error.
      .catch(() => true)
      .then((value) => {
        if (!controller.signal.aborted) setHeld({ key, value });
      });
    return () => controller.abort();
  }, [appInstanceId, dataRef, key, repository, sessionId, wanted]);
  return held?.key === key ? held.value : undefined;
}

/** A saved call's arguments as a person reads them. */
export function formatArguments(call: McpAppSavedCall): string {
  if (!call.arguments) return 'arguments not saved';
  const entries = Object.entries(call.arguments);
  if (!entries.length) return 'no arguments';
  const text = entries.map(([name, value]) => `${name}: ${JSON.stringify(value)}`).join(', ');
  return text.length > 240 ? `${text.slice(0, 239)}…` : text;
}
