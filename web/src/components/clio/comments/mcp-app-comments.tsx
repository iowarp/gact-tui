import type { DocumentAnchor, McpAppSnapshot } from '@clio/core/v3';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SnapshotOptions } from '../mcp-app-look';
import type { CommentSurface, DraftMark } from './comment-model';
import { CommentRegionLayer, type Rect } from './comment-region-layer';
import { appViewImages, type Capture } from './mcp-app-comment-images';
import { CommentSessionProvider, useCommentSession } from './comment-session';
import { FrameCommentsIcon } from './frame-comments';

/**
 * Comments on an MCP App view (CM3): regions dragged, or points clicked, over the view.
 * Each mark keeps the snapshot CLIO's sandbox document took of the view when the mark was
 * made (the same snapshot the agent's `look_at_view` gets, CM1) and the context the view
 * had last reported then. The marks travel as a `comment_session` attachment of the next
 * message: the overview with every mark drawn, a crop per mark at twice its size, and
 * per mark the view's identity and context, which the server renders as readable entries.
 * A mark whose snapshot was refused carries the typed reason instead of a crop.
 */

export interface McpAppCommentTarget {
  appInstanceId: string;
  server: string;
  tool: string;
  title: string;
  resourceUri: string;
}

/** A clicked point becomes a box this many CSS pixels wide, centred on it. */
const POINT_BOX = 64;

type Snap = (options: SnapshotOptions) => Promise<McpAppSnapshot>;

const CaptureContext = createContext<
  | {
      captures: Map<string, Capture>;
      snapshot: () => Snap | undefined;
      context: () => unknown;
      target: McpAppCommentTarget;
    }
  | undefined
>(undefined);

/** The comment session of one app view; its marks attach to the next message. */
export function McpAppCommentSession({
  target,
  snapshot,
  context,
  children,
}: {
  target: McpAppCommentTarget;
  /** The view's snapshot through CLIO's sandbox document, once the view is ready. */
  snapshot: () => Snap | undefined;
  /** The context the view last reported (`ui/update-model-context` params). */
  context: () => unknown;
  children: ReactNode;
}) {
  const [captures] = useState(() => new Map<string, Capture>());
  const surface = useMemo<CommentSurface>(
    () => ({
      title: target.title,
      modes: ['region'],
      defaultMode: 'region',
      destination: { kind: 'attachment', surface: 'mcp-app' },
    }),
    [target.title],
  );
  const prepareImages = useCallback(
    (marks: readonly DraftMark[]) => appViewImages(marks, captures),
    [captures],
  );
  return (
    <CommentSessionProvider
      onSent={() => captures.clear()}
      prepareImages={prepareImages}
      surface={surface}
    >
      <CaptureContext.Provider value={{ captures, snapshot, context, target }}>
        {children}
      </CaptureContext.Provider>
    </CommentSessionProvider>
  );
}

/** The view's one Comments icon, for its frame header. */
export function McpAppCommentsIcon({ disabledReason }: { disabledReason?: string }) {
  const session = useCommentSession();
  if (!session) return null;
  return (
    <FrameCommentsIcon
      count={session.marks.length}
      disabledReason={disabledReason}
      onClick={() => (session.open ? session.stop() : session.start())}
      pressed={session.open}
    />
  );
}

/** The drag layer over the view, and the session's marks pinned on it while it is open. */
export function McpAppRegionLayer() {
  const session = useCommentSession();
  const capture = useContext(CaptureContext);
  const host = useRef<HTMLDivElement>(null);
  if (!session || !capture || !session.open) return null;
  const capturing = session.active && session.mode === 'region';
  const add = (rect: Rect, point?: [number, number]) => {
    const box = host.current?.getBoundingClientRect();
    const take = capture.snapshot();
    const anchor: DocumentAnchor = {
      profile: 'region',
      rect,
      natural_width: box ? Math.round(box.width) : undefined,
      natural_height: box ? Math.round(box.height) : undefined,
      source: {
        app: {
          app_instance_id: capture.target.appInstanceId,
          server: capture.target.server,
          tool: capture.target.tool,
          title: capture.target.title,
          resource_uri: capture.target.resourceUri,
        },
        ...(point ? { point } : {}),
        context: capture.context() ?? null,
        captured_at: new Date().toISOString(),
      },
    };
    const label = session.addMark(anchor, {
      view: rect,
      box: box
        ? {
            left: box.left + rect[0] * box.width,
            top: box.top + rect[1] * box.height,
            width: rect[2] * box.width,
            height: rect[3] * box.height,
          }
        : undefined,
    });
    const refuse = (reason: string, message: string) =>
      session.updateMark(label, {
        anchor: { ...anchor, source: { ...anchor.source, snapshot_refused: { reason, message } } },
        note: `No picture of this mark: ${message}`,
      });
    if (!take) {
      refuse('view_not_ready', 'The view has not finished loading.');
      return;
    }
    void take({ scale: 2, maxSide: 4096 }).then(
      (snapshot) => {
        capture.captures.set(label, { snapshot });
        if ('error' in snapshot) refuse(snapshot.error.reason, snapshot.error.message);
        else if (snapshot.skipped.length)
          session.updateMark(label, {
            anchor: {
              ...anchor,
              source: { ...anchor.source, snapshot_skipped: snapshot.skipped },
            },
          });
      },
      (error: unknown) =>
        refuse('snapshot_failed', error instanceof Error ? error.message : String(error)),
    );
  };
  return (
    <div className="absolute inset-0" ref={host} style={{ pointerEvents: 'none' }}>
      <CommentRegionLayer
        capturing={capturing}
        label="Drag over the view to mark a region, or click a point"
        marks={session.marks.flatMap((mark) =>
          mark.anchor.rect?.length === 4
            ? [{ label: mark.label, rect: mark.anchor.rect as Rect }]
            : [],
        )}
        onOpenMark={session.setEditing}
        onPoint={(x, y) => {
          const box = host.current?.getBoundingClientRect();
          const w = box?.width ? Math.min(1, POINT_BOX / box.width) : 0.08;
          const h = box?.height ? Math.min(1, POINT_BOX / box.height) : 0.08;
          const left = Math.min(Math.max(0, x - w / 2), 1 - w);
          const top = Math.min(Math.max(0, y - h / 2), 1 - h);
          add([left, top, w, h], [x, y]);
        }}
        onRegion={(rect) => add(rect)}
        openByBadge
      />
    </div>
  );
}
