import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { connectionScope } from '@/lib/connection-scope';
import { SESSION_CACHE_POLICY, SessionCacheRetainer } from '@/lib/session-cache-retention';
import { dropReloadTranscript, touchReloadTranscript } from '@/lib/session-reload-cache';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';

const owners = new WeakMap<QueryClient, Map<string, SessionCacheRetainer>>();

/** Pin the active session, with timed/LRU/byte-bounded retention when it is left. */
export function useSessionCacheRetention(sessionId: string): void {
  const client = useQueryClient();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const owner = useMemo(() => {
    let scopes = owners.get(client);
    if (!scopes) {
      scopes = new Map();
      owners.set(client, scopes);
    }
    let retained = scopes.get(scope);
    if (!retained) {
      retained = new SessionCacheRetainer(
        client,
        [settings.endpoint, scope],
        SESSION_CACHE_POLICY,
        (id) => {
          useLiveStore.getState().dropSessionData(id);
          dropReloadTranscript(settings.endpoint, id);
        },
      );
      scopes.set(scope, retained);
    }
    return retained;
  }, [client, scope, settings.endpoint]);
  useEffect(() => {
    if (!sessionId) return;
    owner.visit(sessionId);
    const touch = () => touchReloadTranscript(settings.endpoint, sessionId);
    window.addEventListener('pagehide', touch);
    return () => {
      touch();
      owner.leave(sessionId);
      window.removeEventListener('pagehide', touch);
    };
  }, [owner, sessionId, settings.endpoint]);
}
