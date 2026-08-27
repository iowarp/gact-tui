import type { PresentationOverrideKind } from './presentation-override-registry';

export interface PresentationOverrideInput {
  kind: PresentationOverrideKind;
  entityId: string;
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
  const sessionId = currentSessionId();
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

export function getPresentationOverrideCount(sessionId?: string): number {
  return overridesBySession.get(sessionId || currentSessionId())?.size ?? 0;
}

export function subscribePresentationOverrides(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function currentSessionId(): string {
  if (typeof window === 'undefined') return 'global';
  return /\/sessions\/([^/]+)/u.exec(window.location.pathname)?.[1] ?? 'global';
}

function queueNotification(): void {
  if (notificationQueued) return;
  notificationQueued = true;
  queueMicrotask(() => {
    notificationQueued = false;
    for (const listener of listeners) listener();
  });
}
