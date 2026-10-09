import { useCallback, useState } from 'react';
import type { ObservabilityView } from '@/components/clio/observability-view-storage';

/** A summary link selects a full view without leaking that request into another session. */
export function useObservabilityNavigation(sessionId: string, reveal: () => void) {
  const [request, setRequest] = useState<{
    sessionId: string;
    key: string;
    view: ObservabilityView;
  }>();
  const openObservability = useCallback(
    (view?: ObservabilityView) => {
      if (view) setRequest({ sessionId, key: crypto.randomUUID(), view });
      reveal();
    },
    [sessionId, reveal],
  );
  return {
    openObservability,
    requestedView: request?.sessionId === sessionId ? request : undefined,
  };
}
