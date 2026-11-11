import type { StreamState } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useConnectionIndicatorState } from '@/hooks/use-connection-indicator-state';
import { vocab } from '@/lib/brand-vocabulary';
import { serviceUnreachable } from '@/lib/connection-attempt';
import { queryKeys } from '@/lib/query-keys';
import {
  CONNECTION_ANNOUNCE_SETTLE_MS,
  CONNECTION_UNREACHABLE_RECHECK_MS,
} from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';

type Heard = 'offline' | 'resuming' | 'live';

function heardAs(state: StreamState): Heard | undefined {
  if (state === 'offline') return 'offline';
  if (state === 'reconnecting' || state === 'gapped') return 'resuming';
  if (state === 'live') return 'live';
  return undefined;
}

const SPOKEN: Readonly<Record<Heard, string>> = {
  offline: `Can't reach ${vocab.agent}, retrying`,
  resuming: 'Resuming updates',
  live: `Connected to ${vocab.agent} again`,
};

/**
 * Reads the connection line's changes aloud, politely, wherever the app is open: the
 * line itself lives in the left bar, which a phone only mounts while it is open. The
 * first connection is not announced; a state must hold briefly before it is, so a
 * momentary gap is not read out.
 *
 * Without an open stream the line follows a slow probe, so a request that found nothing
 * answering re-checks it at once instead of leaving the line on "connected".
 */
export function ConnectionAnnouncer() {
  const state = useConnectionIndicatorState({ poll: false });
  const [message, setMessage] = useState('');
  const heard = useRef<Heard | undefined>(undefined);
  useEffect(() => {
    const next = heardAs(state);
    if (!next) return;
    const timer = window.setTimeout(() => {
      const previous = heard.current;
      heard.current = next;
      if (previous === next || (previous === undefined && next === 'live')) return;
      setMessage(SPOKEN[next]);
    }, CONNECTION_ANNOUNCE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  useEffect(() => {
    const probeKey = queryKeys.capabilities(settings.endpoint);
    let lastRecheck = 0;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      if (event.query.queryKey[0] === probeKey[0]) return;
      if (useLiveStore.getState().streamOwners > 0) return;
      if (!serviceUnreachable(event.action.error)) return;
      // Already known unreachable: the probe's own failed-state poll finds the way back.
      if (queryClient.getQueryState(probeKey)?.status === 'error') return;
      const now = Date.now();
      if (now - lastRecheck < CONNECTION_UNREACHABLE_RECHECK_MS) return;
      lastRecheck = now;
      void queryClient.invalidateQueries({ queryKey: probeKey, exact: true });
    });
  }, [queryClient, settings.endpoint]);

  return (
    <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
      {message}
    </div>
  );
}
