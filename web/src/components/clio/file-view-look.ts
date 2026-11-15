import {
  decodeEventEnvelope,
  type ClioRepository,
  type FileViewFile,
  type FileViewLookEvent,
  type TransportFrame,
} from '@clio/core/v3';
import { answerWithin, HOLDER_RENEW_MS, type TakeSnapshot } from './mcp-app-look';

/**
 * The agent looks at a client-rendered file view (FV-D3), as it looks at an app view
 * (`mcp-app-look.ts`, CM1): each mount of the view tells CLIO it holds the view
 * (`PUT …/file-views/{view_id}`), with the file and its view state, and answers each
 * `file_view_look` event with a snapshot and the state at that moment. The view is let go
 * when the mount unloads, so a look at a file that is not on screen is refused at once.
 * The claim is a lease CLIO lets lapse unless renewed, as an app view's is: a mounted file
 * view renews it every {@link HOLDER_RENEW_MS}.
 */

export const FILE_VIEW_LOOK_EVENT = 'file_view_look';

export type FileViewLookClient = Pick<ClioRepository, 'setFileViewShown' | 'postFileViewLook'>;

/** A stable id for the view of one workspace file (two 32-bit FNV-1a halves). */
export function fileViewId(workspaceId: string, path: string): string {
  const text = `${workspaceId}\u0000${path}`;
  const half = (seed: number) => {
    let hash = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };
  return `fv_${half(0x811c9dc5)}${half(0x9747b28c)}`;
}

type LookHandler = (look: FileViewLookEvent) => void;
/** Per view, every mount that holds it now; the newest answers. */
const handlers = new Map<string, LookHandler[]>();

function key(sessionId: string, viewId: string): string {
  return `${sessionId}:${viewId}`;
}

/** Hand a streamed `file_view_look` to the mount holding that view, if one does. */
export function dispatchFileViewLookFrame(frame: TransportFrame): void {
  if (frame.eventName !== FILE_VIEW_LOOK_EVENT) return;
  let payload: unknown;
  try {
    payload = decodeEventEnvelope(frame.data).payload;
  } catch {
    return; // Frame reduction owns malformed-envelope reporting.
  }
  const row = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const { session_id, view_id, call_id, max_side } = row;
  if (typeof session_id !== 'string' || typeof view_id !== 'string' || typeof call_id !== 'string')
    return;
  const look = {
    session_id,
    view_id,
    call_id,
    max_side: typeof max_side === 'number' && max_side > 0 ? max_side : 1568,
  };
  handlers.get(key(session_id, view_id))?.at(-1)?.(look);
}

/** One mount of a file view: it holds the view for the agent's looks while it is loaded. */
export class FileViewLooks {
  private readonly holder = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  private readonly handled = new Set<string>();
  private started = false;
  private stopped = false;
  private renewal: ReturnType<typeof setInterval> | undefined;
  private readonly handler: LookHandler = (look) => void this.answer(look);

  constructor(
    private readonly repository: Partial<FileViewLookClient>,
    private readonly sessionId: string,
    private readonly viewId: string,
    private readonly file: FileViewFile,
    private readonly snapshot: TakeSnapshot,
    private readonly state: () => string[],
  ) {}

  /** The view is drawn: this mount holds it (and reports its state). */
  start(): void {
    if (this.stopped || this.started || !this.repository.setFileViewShown) return;
    this.started = true;
    const handlerKey = key(this.sessionId, this.viewId);
    handlers.set(handlerKey, [...(handlers.get(handlerKey) ?? []), this.handler]);
    this.report();
    // Renewed while mounted, so a window that goes away without unloading lets the view go.
    this.renewal = setInterval(() => this.report(), HOLDER_RENEW_MS);
  }

  /** The view state changed: say so, so the agent's context follows the view. */
  report(): void {
    if (!this.started || this.stopped) return;
    void this.repository
      .setFileViewShown?.(this.sessionId, this.viewId, {
        holder: this.holder,
        shown: true,
        file: this.file,
        state: this.state(),
      })
      .catch((error: unknown) =>
        console.warn('The file view could not be offered to the agent:', error),
      );
  }

  /** The mount is going: let the view go, unless another mount holds it. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.renewal);
    if (!this.started) return;
    const handlerKey = key(this.sessionId, this.viewId);
    const rest = (handlers.get(handlerKey) ?? []).filter((handler) => handler !== this.handler);
    if (rest.length) handlers.set(handlerKey, rest);
    else handlers.delete(handlerKey);
    void this.repository
      .setFileViewShown?.(this.sessionId, this.viewId, { holder: this.holder, shown: false })
      .catch(() => undefined);
  }

  private async answer(look: FileViewLookEvent): Promise<void> {
    if (this.stopped || this.handled.has(look.call_id) || !this.repository.postFileViewLook) return;
    this.handled.add(look.call_id);
    const scale = (globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1;
    const answer = await answerWithin(this.snapshot, { scale, maxSide: look.max_side });
    const body = 'image' in answer ? { ...answer, state: this.state() } : answer;
    await this.repository
      .postFileViewLook(this.sessionId, this.viewId, look.call_id, body)
      .catch((error: unknown) => console.warn('The file view snapshot was not delivered:', error));
  }
}
