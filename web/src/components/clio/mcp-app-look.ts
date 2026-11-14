import {
  decodeEventEnvelope,
  type ClioRepository,
  type McpAppIdentity,
  type McpAppLookEvent,
  type McpAppSnapshot,
  type TransportFrame,
} from '@clio/core/v3';
import { mcpAppEnded } from './mcp-app-live-set';

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

/** Ask the sandbox document for a snapshot of the view it hosts. */
export type TakeSnapshot = (options: SnapshotOptions) => Promise<McpAppSnapshot>;

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
/** Per view, every mount that holds it now; the newest answers (a card and a tab overlap
 * while a frame moves between them). */
const lookHandlers = new Map<string, LookHandler[]>();

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
  if (look) lookHandlers.get(key(look.session_id, look.app_instance_id))?.at(-1)?.(look);
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
  private readonly handler: LookHandler = (look) => void this.answer(look);

  constructor(
    private readonly repository: Partial<McpAppLookClient>,
    private readonly identity: McpAppIdentity,
    private readonly snapshot: TakeSnapshot,
  ) {}

  /** The view finished initializing: this mount holds it. */
  start(): void {
    if (this.stopped || this.started || !this.repository.setMcpAppShown) return;
    this.started = true;
    const handlerKey = key(this.identity.sessionId, this.identity.appInstanceId);
    lookHandlers.set(handlerKey, [...(lookHandlers.get(handlerKey) ?? []), this.handler]);
    void this.repository
      .setMcpAppShown(this.identity, this.holder, true)
      .catch((error: unknown) =>
        console.warn('The view could not be offered to the agent:', error),
      );
  }

  /** The frame is going: let the view go, unless a newer mount took it. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (!this.started) return;
    // Another mount of the same view (card to tab) may hold it too: only this one goes.
    const handlerKey = key(this.identity.sessionId, this.identity.appInstanceId);
    const rest = (lookHandlers.get(handlerKey) ?? []).filter((handler) => handler !== this.handler);
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
    try {
      const scale = (globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1;
      answer = await this.snapshot({ scale, maxSide: look.max_side });
    } catch (error) {
      answer = {
        error: {
          reason: 'snapshot_failed',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    await this.repository
      .postMcpAppLook(this.identity, look.call_id, answer)
      .catch((error: unknown) => console.warn('The view snapshot was not delivered:', error));
  }
}
