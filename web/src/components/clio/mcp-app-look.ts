import {
  decodeEventEnvelope,
  type ClioRepository,
  type McpAppIdentity,
  type McpAppLookEvent,
  type McpAppSnapshot,
  type TransportFrame,
} from '@clio/core/v3';
import {
  mcpAppEnded,
  mcpAppIdentity,
  openMcpAppInTab,
  useMcpAppLiveSetStore,
} from './mcp-app-live-set';
import { trackViewLook } from './mcp-app-look-waiting';

/**
 * The agent looks at a view (CM1). The surface holding a view says so to CLIO
 * (`PUT …/shown`), answers each `mcp_app_look` event with a snapshot that CLIO's own
 * sandbox document takes of the view (`clio/view-snapshot`), and lets the view go when
 * its frame unloads. Comments on the view (CM3) use the same snapshot.
 */

export const MCP_APP_LOOK_EVENT = 'mcp_app_look';
/** The request the sandbox document answers itself; it never reaches the view. */
export const VIEW_SNAPSHOT_METHOD = 'clio/view-snapshot';

export type McpAppLookClient = Pick<ClioRepository, 'setMcpAppShown' | 'postMcpAppLook'>;

export interface SnapshotOptions {
  /** Image pixels per CSS pixel of the view (2 for comment crops). */
  scale?: number;
  /** The longest side of the image, in pixels. */
  maxSide?: number;
}

/** A snapshot in progress, as its mount follows it: whether the frame is on screen, and
 * the end of the listing. */
export interface TrackedLook {
  visible: () => boolean;
  /** Resolves once the frame is on screen (at once when it is). */
  whenVisible: () => Promise<void>;
  end: () => void;
}

/** Ask the sandbox document for a snapshot of the view it hosts. */
export type TakeSnapshot = (options: SnapshotOptions) => Promise<McpAppSnapshot>;

/** How long a look waits for this window's own sandbox document to answer. CLIO waits on
 * the agent's side until a surface answers, so a frame that never replies (hidden, frozen
 * or still loading) must be answered here, typed, rather than hold the agent's turn. */
export const SNAPSHOT_ANSWER_MS = 30_000;

/** The snapshot of each mounted view, by its frame: a capture of a surface or a page that
 * holds the view paints the view from it (CM2), since a sandboxed frame cannot be cloned. */
const viewSnapshots = new WeakMap<Element, TakeSnapshot>();

/** Offer the view in `frame` to captures; returns the withdrawal. */
export function registerViewSnapshot(frame: Element, snapshot: TakeSnapshot): () => void {
  viewSnapshots.set(frame, snapshot);
  return () => {
    if (viewSnapshots.get(frame) === snapshot) viewSnapshots.delete(frame);
  };
}

/** The snapshot of the view in `frame`, when the view is ready. */
export function viewSnapshotFor(frame: Element): TakeSnapshot | undefined {
  return viewSnapshots.get(frame);
}

type LookHandler = (look: McpAppLookEvent) => void;
/** One mount holding a view: how it answers, and whether the person can see it now. */
interface LookMount {
  answer: LookHandler;
  onScreen?: () => boolean;
}
/** Per view, every mount that holds it now. The newest one on screen answers; with none on
 * screen, the newest (a card and a tab overlap while a frame moves between them). */
const lookHandlers = new Map<string, LookMount[]>();

function chosenMount(mounts: LookMount[] | undefined): LookMount | undefined {
  if (!mounts?.length) return undefined;
  for (let index = mounts.length - 1; index >= 0; index -= 1) {
    if (mounts[index]!.onScreen?.()) return mounts[index];
  }
  return mounts.at(-1);
}

/** How often a mount renews its claim on the view; CLIO lets a claim lapse after 60 s. */
export const HOLDER_RENEW_MS = 20_000;

function key(sessionId: string, appInstanceId: string): string {
  return `${sessionId}:${appInstanceId}`;
}

/** Hand a streamed `mcp_app_look` to the surface holding that view, if one does. */
export function dispatchMcpAppLookFrame(frame: TransportFrame): void {
  if (frame.eventName !== MCP_APP_LOOK_EVENT) return;
  let payload: unknown;
  try {
    payload = decodeEventEnvelope(frame.data).payload;
  } catch {
    return; // Frame reduction owns malformed-envelope reporting.
  }
  const look = lookEvent(payload);
  if (!look) return;
  const mount = chosenMount(lookHandlers.get(key(look.session_id, look.app_instance_id)));
  if (mount) {
    unheldLooks.get(look.call_id)?.();
    mount.answer(look);
  } else waitUnheld(look);
}

/** The words a look gets when the view stayed out of sight for the whole wait (DOCS-F2). */
const NOT_VISIBLE = (seconds: number) =>
  // i18n-ignore: error returned to the agent's look_at_view result
  `The view was not on screen for ${seconds} s (its card scrolled out of sight, its tab not shown, or it is not open in this window), so it could not be seen. Ask the person to show the view, then look again.`;

/** Looks at a view this window knows but no mount here holds, by call: their end. */
const unheldLooks = new Map<string, () => void>();

/**
 * CLIO thinks the view is shown (a window that closed without unloading it may still hold
 * it), but no mount in this window holds it: say the agent is waiting, offer to open the
 * view in its tab (its mount then answers), and answer view_not_visible after the same
 * 30 s if none did. Another window that holds it answers first; this answer then 404s.
 */
function waitUnheld(look: McpAppLookEvent): void {
  const entry = useMcpAppLiveSetStore.getState().apps[look.app_instance_id];
  const repository = entry?.repository as Partial<McpAppLookClient> | undefined;
  if (
    !entry ||
    unheldLooks.has(look.call_id) ||
    entry.placement === 'ended' ||
    entry.sessionId !== look.session_id ||
    !repository?.postMcpAppLook
  )
    return;
  const tracked = trackViewLook(
    {
      callId: look.call_id,
      sessionId: look.session_id,
      appInstanceId: look.app_instance_id,
      reveal: () => openMcpAppInTab(entry, entry.repository),
    },
    null,
    true,
  );
  const end = () => {
    clearTimeout(timer);
    tracked.end();
    unheldLooks.delete(look.call_id);
  };
  const timer = setTimeout(() => {
    end();
    void repository.postMcpAppLook!(mcpAppIdentity(entry), look.call_id, {
      error: { reason: 'view_not_visible', message: NOT_VISIBLE(SNAPSHOT_ANSWER_MS / 1000) },
    }).catch(() => undefined);
  }, SNAPSHOT_ANSWER_MS);
  unheldLooks.set(look.call_id, end);
}

function lookEvent(value: unknown): McpAppLookEvent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { session_id, app_instance_id, call_id, max_side } = value as Record<string, unknown>;
  if (
    typeof session_id !== 'string' ||
    typeof app_instance_id !== 'string' ||
    typeof call_id !== 'string'
  )
    return undefined;
  return {
    session_id,
    app_instance_id,
    call_id,
    max_side: typeof max_side === 'number' && max_side > 0 ? max_side : 1568,
  };
}

/** Normalize what the sandbox document answered into a snapshot or a typed refusal. */
export function snapshotAnswer(value: unknown): McpAppSnapshot {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const error = row.error as { reason?: unknown; message?: unknown } | undefined;
  if (error && typeof error === 'object')
    return {
      error: {
        reason: typeof error.reason === 'string' ? error.reason : 'snapshot_failed',
        message: typeof error.message === 'string' ? error.message : '',
      },
    };
  if (typeof row.image !== 'string' || !row.image.startsWith('data:image/png'))
    // i18n-ignore: error returned to the agent's look_at_view result
    return { error: { reason: 'snapshot_failed', message: 'The sandbox returned no image.' } };
  return {
    image: row.image,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    scale: Number(row.scale) || 1,
    painted: (row.painted as Record<string, number>) ?? {},
    skipped: Array.isArray(row.skipped) ? (row.skipped as never) : [],
  };
}

/** One mount of a view: it holds the view for the agent's looks while it is loaded. */
export class McpAppLooks {
  private readonly holder = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  private readonly handled = new Set<string>();
  private stopped = false;
  private started = false;
  private renewal: ReturnType<typeof setInterval> | undefined;
  private readonly mount: LookMount;

  constructor(
    private readonly repository: Partial<McpAppLookClient>,
    private readonly identity: McpAppIdentity,
    private readonly snapshot: TakeSnapshot,
    /** Lists a snapshot in progress and tells whether its frame is on screen (DOCS-F2). */
    private readonly track?: (callId: string) => TrackedLook,
    /** Whether this mount's frame is on screen; a look prefers a mount the person sees. */
    onScreen?: () => boolean,
  ) {
    this.mount = { answer: (look) => void this.answer(look), onScreen };
  }

  /** The view finished initializing: this mount holds it. */
  start(): void {
    if (this.stopped || this.started || !this.repository.setMcpAppShown) return;
    this.started = true;
    const handlerKey = key(this.identity.sessionId, this.identity.appInstanceId);
    lookHandlers.set(handlerKey, [...(lookHandlers.get(handlerKey) ?? []), this.mount]);
    const offer = () =>
      void this.repository
        .setMcpAppShown?.(this.identity, this.holder, true)
        .catch((error: unknown) =>
          console.warn('The view could not be offered to the agent:', error),
        );
    offer();
    // The claim is a lease CLIO lets lapse unless renewed, so a window that goes away
    // without unloading its frames does not leave the agent's looks waiting on it.
    this.renewal = setInterval(offer, HOLDER_RENEW_MS);
  }

  /** The frame is going: let the view go, unless a newer mount took it. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.renewal);
    if (!this.started) return;
    // Another mount of the same view (card to tab) may hold it too: only this one goes.
    const handlerKey = key(this.identity.sessionId, this.identity.appInstanceId);
    const rest = (lookHandlers.get(handlerKey) ?? []).filter((mount) => mount !== this.mount);
    if (rest.length) lookHandlers.set(handlerKey, rest);
    else lookHandlers.delete(handlerKey);
    // A view CLIO closed left the look table with its record, which now answers 404.
    if (mcpAppEnded(this.identity.appInstanceId)) return;
    void this.repository.setMcpAppShown?.(this.identity, this.holder, false).catch(() => undefined);
  }

  private async answer(look: McpAppLookEvent): Promise<void> {
    if (this.stopped || this.handled.has(look.call_id) || !this.repository.postMcpAppLook) return;
    this.handled.add(look.call_id);
    let answer: McpAppSnapshot;
    const tracked = this.track?.(look.call_id);
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A frame that never answers is answered here, typed. A view off screen is the usual
    // cause (the browser does not draw it): the answer says so in words, so the agent can
    // ask the person to show it; meanwhile its row and card offered to (DOCS-F2).
    const unanswered = new Promise<McpAppSnapshot>((resolve) => {
      timer = setTimeout(
        () =>
          resolve(
            tracked && !tracked.visible()
              ? {
                  error: {
                    reason: 'view_not_visible',
                    message: NOT_VISIBLE(SNAPSHOT_ANSWER_MS / 1000),
                  },
                }
              : {
                  error: {
                    reason: 'snapshot_unanswered',
                    // i18n-ignore: error returned to the agent's look_at_view result
                    message: `The view's frame did not answer within ${SNAPSHOT_ANSWER_MS / 1000} s; it may be hidden or still loading.`,
                  },
                },
          ),
        SNAPSHOT_ANSWER_MS,
      );
    });
    try {
      const scale = (globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1;
      // A frame off screen is not drawn (or has no size): wait, within the same 30 s, for
      // the person to show it, as the row and card ask; then take the snapshot.
      const taken = (async () => {
        if (tracked && !tracked.visible()) await tracked.whenVisible();
        return this.snapshot({ scale, maxSide: look.max_side });
      })();
      answer = await Promise.race([taken, unanswered]);
    } catch (error) {
      answer = {
        error: {
          reason: 'snapshot_failed',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    } finally {
      clearTimeout(timer);
      tracked?.end();
    }
    await this.repository
      .postMcpAppLook(this.identity, look.call_id, answer)
      .catch((error: unknown) => console.warn('The view snapshot was not delivered:', error));
  }
}
