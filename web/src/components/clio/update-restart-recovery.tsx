import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { vocab } from '@/lib/brand-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  clearPendingUpdateMarker,
  readPendingUpdateMarker,
  useUpdateFlowStore,
} from '@/store/update-flow-store';

/** How long the settled "Updated to vX" store state lingers before resetting
 * to idle. Purely presentational bookkeeping (nothing waits on this timer to
 * know the update finished — that already happened via `finish()`); it only
 * stops a stale `done` step from outliving its one toast. Unit: ms. */
const DONE_STATE_LINGER_MS = 4_000;

/**
 * Bridges the update flow across the one gap React state cannot survive: an
 * agent or desktop update ends by replacing the whole process
 * (`app.restart()` / `relaunch()`), which destroys every in-memory store,
 * including `useUpdateFlowStore`. This component resumes the flow from the
 * persisted marker (`readPendingUpdateMarker`) as soon as the app boots back
 * up, and watches the SAME connection signals `ConnectionProvider` already
 * computes (`credentialsReady`/`managedConnectionReady`/`credentialError`) —
 * no second polling loop — to learn when the managed backend answers again.
 *
 * Mount once, inside `ConnectionProvider`'s subtree. Renders nothing; pair it
 * with `UpdateRestartOverlay` for the visible blocking state.
 */
export function UpdateRestartRecovery(): null {
  const { credentialsReady, managedConnectionReady, credentialError } = useConnectionSettings();
  const resumedRef = useRef(false);
  const settledRef = useRef(false);

  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const marker = readPendingUpdateMarker();
    if (marker) useUpdateFlowStore.getState().resume(marker.action, marker.version);
  }, []);

  useEffect(() => {
    if (settledRef.current || !credentialsReady) return;
    const marker = readPendingUpdateMarker();
    if (!marker) return;
    if (managedConnectionReady) {
      settledRef.current = true;
      useUpdateFlowStore.getState().finish(marker.version);
      clearPendingUpdateMarker();
      toast.success(marker.version ? `Updated to v${marker.version}` : `${vocab.agent} is up to date`);
      setTimeout(() => useUpdateFlowStore.getState().reset(), DONE_STATE_LINGER_MS);
    } else if (credentialError) {
      settledRef.current = true;
      useUpdateFlowStore.getState().fail(credentialError);
      clearPendingUpdateMarker();
    }
  }, [credentialError, credentialsReady, managedConnectionReady]);

  return null;
}
