import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ph, t } from '@lingui/core/macro';
import { vocab } from '@/lib/brand-vocabulary';
import { verifyClioUpdate } from '@/tauri/clio-update-verification';
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
 * up. Verification observes the native supervisor's local runtime directly;
 * a selected remote connection cannot complete or fail a local update.
 *
 * Mount once, inside `ConnectionProvider`'s subtree. Renders nothing; pair it
 * with `UpdateRestartOverlay` for the visible blocking state.
 */
export function UpdateRestartRecovery(): null {
  const resumedRef = useRef(false);
  const settledRef = useRef(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!resumedRef.current) {
      resumedRef.current = true;
      const marker = readPendingUpdateMarker();
      if (marker) useUpdateFlowStore.getState().resume(marker.action, marker.version);
    }
    return () => clearTimeout(doneTimer.current);
  }, []);

  useEffect(() => {
    if (settledRef.current) return;
    const marker = readPendingUpdateMarker();
    if (!marker) return;
    const controller = new AbortController();
    let finished = false;
    settledRef.current = true;
    useUpdateFlowStore.getState().setStep('verifying');
    void verifyClioUpdate(marker, controller.signal).then(
      () => {
        if (controller.signal.aborted) return;
        finished = true;
        useUpdateFlowStore.getState().finish(marker.version);
        clearPendingUpdateMarker();
        toast.success(
          t`${ph({ product: vocab.product })} updated to v${ph({ version: marker.version ?? '' })}`,
        );
        doneTimer.current = setTimeout(() => {
          const flow = useUpdateFlowStore.getState();
          if (flow.step === 'done' && flow.version === marker.version) flow.reset();
        }, DONE_STATE_LINGER_MS);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        finished = true;
        useUpdateFlowStore.getState().fail(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      controller.abort();
      if (!finished) settledRef.current = false;
    };
  }, []);

  return null;
}
