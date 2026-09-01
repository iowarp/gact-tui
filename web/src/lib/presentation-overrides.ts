import type { PresentationOverrideKind } from './presentation-override-registry';

const GLOBAL_SCOPE = 'global';

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
  if (import.meta.env.DEV) console.warn('[clio:presentation-override]', record);
  queueNotification();
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
