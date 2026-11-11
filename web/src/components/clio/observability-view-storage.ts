export type ObservabilityView = 'activity' | 'relationships' | 'context';

export const OBSERVABILITY_VIEWS = new Set<ObservabilityView>([
  'activity',
  'relationships',
  'context',
]);

export function observabilityViewStorageKey(sessionId: string): string {
  return `clio.observability-view:${sessionId}`;
}

/** A view stored before the Gantt and Evidence views were retired restores to the timeline. */
export function restoredObservabilityView(sessionId: string | undefined): ObservabilityView {
  if (!sessionId || typeof window === 'undefined') return 'activity';
  const stored = window.localStorage.getItem(observabilityViewStorageKey(sessionId));
  return OBSERVABILITY_VIEWS.has(stored as ObservabilityView)
    ? (stored as ObservabilityView)
    : 'activity';
}
