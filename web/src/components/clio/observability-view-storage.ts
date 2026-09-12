export type ObservabilityView = 'evidence' | 'activity' | 'work' | 'context';

export const OBSERVABILITY_VIEWS = new Set<ObservabilityView>(['evidence', 'activity', 'work', 'context']);

export function observabilityViewStorageKey(sessionId: string): string {
  return `clio.observability-view:${sessionId}`;
}

export function restoredObservabilityView(sessionId: string | undefined): ObservabilityView {
  if (!sessionId || typeof window === 'undefined') return 'evidence';
  const stored = window.localStorage.getItem(observabilityViewStorageKey(sessionId));
  return OBSERVABILITY_VIEWS.has(stored as ObservabilityView)
    ? (stored as ObservabilityView)
    : 'evidence';
}
