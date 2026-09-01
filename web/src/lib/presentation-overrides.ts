import type { PresentationOverrideKind } from './presentation-override-registry';

const GLOBAL_SCOPE = 'global';

/**
 * Sessions whose overrides are kept. Unit: sessions.
 * The registry lives for the tab's lifetime, so without a bound a long browsing
 * run accumulates one map per visited session. Eviction follows insertion order
 * and never drops the session-independent scope. Raise it only if a diagnosis
 * needs overrides from further back than the last few dozen sessions.
 */
const MAX_TRACKED_SESSIONS = 32;

export interface PresentationOverrideInput {
  kind: PresentationOverrideKind;
  entityId: string;
  /** Session that owns the overridden entity. Omitted for session-independent surfaces. */
  sessionId?: string;
  serverValue: unknown;
  rendered: unknown;
  issue: string;
}

export interface PresentationOverrideRecord extends PresentationOverrideInput {
  sessionId: string;
}

const overridesBySession = new Map<string, Map<string, PresentationOverrideRecord>>();
const listeners = new Set<() => void>();
let notificationQueued = false;

/** Records a deliberate presentation-layer departure from authoritative server data. */
export function reportPresentationOverride(input: PresentationOverrideInput): void {
  if (Object.is(input.serverValue, input.rendered)) return;
  const sessionId = input.sessionId ?? GLOBAL_SCOPE;
  const sessionOverrides = overridesBySession.get(sessionId) ?? new Map();
  const key = `${input.kind}:${input.entityId}`;
  const previous = sessionOverrides.get(key);
  if (previous && Object.is(previous.rendered, input.rendered)) return;

  const record = { ...input, sessionId };
  sessionOverrides.set(key, record);
  overridesBySession.set(sessionId, sessionOverrides);
  evictOldestSessions();
  if (import.meta.env.DEV) console.warn('[clio:presentation-override]', record);
  queueNotification();
}

/** Drops the longest-held sessions once the registry passes its bound. */
function evictOldestSessions(): void {
  while (overridesBySession.size > MAX_TRACKED_SESSIONS) {
    const oldest = [...overridesBySession.keys()].find((key) => key !== GLOBAL_SCOPE);
    if (oldest === undefined) return;
    overridesBySession.delete(oldest);
  }
}

/** Counts overrides recorded for one session; session-independent ones never land here. */
export function getPresentationOverrideCount(sessionId?: string): number {
  return overridesBySession.get(sessionId || GLOBAL_SCOPE)?.size ?? 0;
}

export function subscribePresentationOverrides(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function queueNotification(): void {
  if (notificationQueued) return;
  notificationQueued = true;
  queueMicrotask(() => {
    notificationQueued = false;
    for (const listener of listeners) listener();
  });
}
