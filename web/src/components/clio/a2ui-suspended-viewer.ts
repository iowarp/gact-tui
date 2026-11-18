import { useEffect, type RefObject } from 'react';
import type { A2uiCaptureRequest, A2uiViewerReport, A2UISurface } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { captureVisualRequest, displayed, runCaptureBudget } from './a2ui-visual-viewer';
import type { A2uiViewerLease } from './a2ui-viewer-lease';

/**
 * What a suspended surface reports: it is in the person's conversation, scrolled far
 * enough away that its renderer is unmounted. Like an off-screen gated viewer inside a
 * surface, it is ready for a capture, which mounts it out of sight and waits for its
 * maps, charts and meshes before taking pixels.
 */
export const SUSPENDED_VIEW_STATE = {
  suspended: true,
  readiness: { ready: true, detail: '' },
} as const;

const SURFACE_ROOT = '[data-slot="a2ui-surface-root"]';
const SUSPENDED_CONTROL_REFUSAL =
  // i18n-ignore: returned to the agent, kept in English like other text sent to the agent
  'This view is scrolled out of the conversation, so its controls are not loaded. ' +
  // i18n-ignore: returned to the agent, kept in English like other text sent to the agent
  'Capture it to look at it, or revise the surface.';
// i18n-ignore: returned to the agent, kept in English like other text sent to the agent
const CHANGED_BEFORE_CAPTURE = 'The view changed before its capture could start.';

/** The surface's renderer, once the capture mount has committed it. */
async function mountedSurfaceRoot(host: HTMLElement, matches: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const root = host.querySelector<HTMLElement>(SURFACE_ROOT);
    if (root) return root;
    if (!matches()) break;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  if (!matches()) throw new Error('The definition or viewer state changed before capture.');
  throw new Error(
    host.querySelector('[role="alert"]')?.textContent ||
      'The surface did not render when it was mounted for the capture.',
  );
}

/**
 * Keep a suspended transcript surface capturable. While the renderer is unmounted
 * (scrolled away), this viewer holds the surface's lease; a capture request mounts the
 * renderer off screen through `mountForCapture`, without moving the person's scroll
 * position or opening anything, captures it, and releases it again.
 */
export function useSuspendedA2uiViewer(
  host: RefObject<HTMLDivElement | null>,
  surface: A2UISurface,
  lease: A2uiViewerLease,
  suspended: boolean,
  mountForCapture: (mounted: boolean) => void,
): void {
  const repository = useRepository();
  useEffect(() => {
    const node = host.current;
    if (!suspended || !node || !repository.reportA2uiViewer) return;
    const abort = new AbortController();
    let timer = 0;
    let unsupported = false;
    // A new epoch: the renderer's own state is no longer what this viewer reports.
    const epoch = lease.advance();
    const report = (): A2uiViewerReport => ({
      viewer_id: lease.viewerId,
      surface_id: surface.id,
      revision: surface.revision,
      view_revision: epoch,
      artifact_id: '',
      state: SUSPENDED_VIEW_STATE,
      visible: displayed(node) && document.visibilityState === 'visible',
      ready: true,
    });
    // As the mounted viewer: a request any report claims is kept until answered.
    const claimed: A2uiCaptureRequest[] = [];
    const send = async () => {
      claimed.push(
        ...(await repository.reportA2uiViewer(surface.session_id, report(), abort.signal)),
      );
    };
    const capture = async (request: A2uiCaptureRequest) => {
      const matches = () =>
        !abort.signal.aborted &&
        lease.epoch === epoch &&
        request.revision === surface.revision &&
        request.view_revision === epoch;
      if (request.data_model_update)
        return {
          error: SUSPENDED_CONTROL_REFUSAL,
          view_revision: epoch,
          previous_view_revision: request.view_revision,
        };
      if (!matches()) return { error: CHANGED_BEFORE_CAPTURE };
      mountForCapture(true);
      try {
        const { png, error } = await runCaptureBudget(
          async () =>
            captureVisualRequest(await mountedSurfaceRoot(node, matches), request, matches),
          () => void send().catch(() => undefined),
        );
        return error ? { error } : { png_base64: png };
      } finally {
        mountForCapture(false);
      }
    };
    const cycle = async () => {
      try {
        await send();
        for (let request = claimed.shift(); request; request = claimed.shift()) {
          const outcome = await capture(request);
          await send();
          await repository.completeA2uiCapture(
            surface.session_id,
            {
              request_id: request.request_id,
              viewer_id: lease.viewerId,
              revision: request.revision,
              view_revision: request.view_revision,
              ...outcome,
            },
            abort.signal,
          );
        }
      } catch (error) {
        // As the mounted viewer: an older server has no capture capability, and a
        // network failure lets the lease expire rather than deliver a stale image.
        if (
          !abort.signal.aborted &&
          error instanceof Error &&
          'status' in error &&
          error.status === 404
        )
          unsupported = true;
      } finally {
        if (!abort.signal.aborted && !unsupported)
          timer = window.setTimeout(() => void cycle(), 750);
      }
    };
    void cycle();
    return () => {
      abort.abort();
      window.clearTimeout(timer);
      lease.advance();
    };
  }, [host, lease, mountForCapture, repository, surface, suspended]);
}
