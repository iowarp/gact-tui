import type { CommentSurfaceKind, DocumentAnchor, McpAppSnapshot } from '@clio/core/v3';
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
import { t } from '@lingui/core/macro';

/**
 * Region comments on a view whose pixels only the browser has: an MCP App view (CM3) or a
 * client-rendered file view such as a 3D model (FV-D2). A drag marks a region, a click a
 * point (a 64 px box). Each mark keeps the snapshot of the view taken when it was made (the
 * one the agent's `look_at_view` gets) and what the view says about itself then (`source`:
 * an app view's identity and reported context, a file view's file and view state). The
 * marks travel as a `comment_session` attachment of the next message: the overview with
 * every mark drawn, a crop per mark at twice its size, and per mark its `source`, which the
 * server renders as readable entries. A mark whose snapshot was refused carries the typed
 * reason instead of a crop.
 */

/** A clicked point becomes a box this many CSS pixels wide, centred on it. */
const POINT_BOX = 64;

export type TakeViewSnapshot = (options: SnapshotOptions) => Promise<McpAppSnapshot>;

export interface SnapshotCommentTarget {
  kind: Extract<CommentSurfaceKind, 'mcp-app' | 'file-view'>;
  title: string;
  /** What each mark carries in `anchor.source`, read when the mark is made. */
  source: () => Record<string, unknown>;
  /** The view's snapshot, once the view is ready. */
  snapshot: () => TakeViewSnapshot | undefined;
}

const CaptureContext = createContext<
  { captures: Map<string, Capture>; target: SnapshotCommentTarget } | undefined
>(undefined);

/** The comment session of one view; its marks attach to the next message. */
export function SnapshotCommentSession({
  target,
  children,
}: {
  target: SnapshotCommentTarget;
  children: ReactNode;
}) {
  const [captures] = useState(() => new Map<string, Capture>());
  const surface = useMemo<CommentSurface>(
    () => ({
      title: target.title,
      modes: ['region'],
      defaultMode: 'region',
      destination: { kind: 'attachment', surface: target.kind },
    }),
    [target.kind, target.title],
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
      <CaptureContext.Provider value={{ captures, target }}>{children}</CaptureContext.Provider>
    </CommentSessionProvider>
  );
}

/** The view's one Comments icon, for its frame header. */
export function SnapshotCommentsIcon({ disabledReason }: { disabledReason?: string }) {
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
export function SnapshotRegionLayer() {
  const session = useCommentSession();
  const capture = useContext(CaptureContext);
  const host = useRef<HTMLDivElement>(null);
  if (!session || !capture || !session.open) return null;
  const capturing = session.active && session.mode === 'region';
  const add = (rect: Rect, point?: [number, number]) => {
    const box = host.current?.getBoundingClientRect();
    const take = capture.target.snapshot();
    const anchor: DocumentAnchor = {
      profile: 'region',
      rect,
      natural_width: box ? Math.round(box.width) : undefined,
      natural_height: box ? Math.round(box.height) : undefined,
      source: {
        ...capture.target.source(),
        ...(point ? { point } : {}),
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
        // i18n-ignore: travels with the comment to the agent, kept in English
        note: `No picture of this mark: ${message}`,
      });
    if (!take) {
      // i18n-ignore: the refusal travels with the comment to the agent, kept in English
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
    // The marks are the person's tools, never part of the picture the agent gets.
    <div
      className="absolute inset-0"
      data-capture-ui="true"
      ref={host}
      style={{ pointerEvents: 'none' }}
    >
      <CommentRegionLayer
        capturing={capturing}
        label={t`Drag over the view to mark a region, or click a point`}
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
