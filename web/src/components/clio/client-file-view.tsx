import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useRepository } from '@/hooks/use-repository';
import { t } from '@lingui/core/macro';
import { FrameCommentsPortal, FrameCommentsUnavailable } from './comments/frame-comments';
import {
  SnapshotCommentSession,
  SnapshotCommentsIcon,
  SnapshotRegionLayer,
  type SnapshotCommentTarget,
} from './comments/snapshot-comments';
import { FileViewLooks, fileViewId } from './file-view-look';
import { snapshotClientView } from './file-view-snapshot';
import type { TakeSnapshot } from './mcp-app-look';
import { fileName } from './resource-media-types';

/**
 * Client-rendered file views (FV-D1): a renderer whose pixels only the browser can make
 * (the 3D view of a STEP or STL file) declares itself to the file viewer with
 * {@link useClientFileView}. The viewer's {@link ClientFileViewHost} then, inside a
 * conversation, turns on the frame's Comments control with region comments that carry the
 * browser's overview and crops and the view state (`file-view` attachments), and offers the
 * view to the agent's `look_at_view` while it is mounted. Any renderer can opt in; no
 * server rendering is involved.
 */

export interface ClientFileViewDeclaration {
  /** The kind of view, in words the agent reads ("3D model"). */
  kind: string;
  /** The element the person sees, positioned: it is pictured, and marks are drawn over it. */
  root: HTMLElement;
  /** Draw the renderer's canvas now (a WebGL scene keeps no drawing buffer). */
  draw?: () => HTMLCanvasElement | undefined;
  /** The view state as readable English lines (camera, section, selection, measurements). */
  state: () => string[];
  /** Changes whenever the state lines would; the host reports the new state. */
  stateKey: string;
}

const ClientFileViewRegistry = createContext<
  ((declaration: ClientFileViewDeclaration | undefined) => void) | undefined
>(undefined);

/** Declare the renderer as a client-rendered file view while it is mounted. */
// oxlint-disable-next-line react/only-export-components
export function useClientFileView(declaration: ClientFileViewDeclaration | undefined) {
  const register = useContext(ClientFileViewRegistry);
  useEffect(() => {
    if (!register || !declaration) return;
    register(declaration);
    return () => register(undefined);
  }, [register, declaration]);
}

/** How long the state settles before the new state is reported (a drag moves the camera). */
const STATE_SETTLE_MS = 400;

/**
 * Hosts whatever renderer the file viewer shows for one workspace file. Nothing changes for
 * a renderer that does not declare itself; the host's own parts are siblings and portals,
 * so the renderer's tree never remounts when it declares.
 */
export function ClientFileViewHost({
  workspaceId,
  path,
  children,
}: {
  workspaceId: string;
  path: string;
  children: ReactNode;
}) {
  const [declared, setDeclared] = useState<ClientFileViewDeclaration>();
  return (
    <ClientFileViewRegistry.Provider value={setDeclared}>
      {children}
      {declared ? (
        <DeclaredFileView declaration={declared} path={path} workspaceId={workspaceId} />
      ) : null}
    </ClientFileViewRegistry.Provider>
  );
}

function DeclaredFileView({
  declaration,
  workspaceId,
  path,
}: {
  declaration: ClientFileViewDeclaration;
  workspaceId: string;
  path: string;
}) {
  const { sessionId = '' } = useParams();
  const repository = useRepository();
  const name = fileName(path);
  const latest = useLatest(declaration);
  const snapshot = useMemo<TakeSnapshot>(
    () => (options) => {
      const current = latest();
      return snapshotClientView(current.root, current.draw, options);
    },
    [latest],
  );
  const kind = declaration.kind;
  const file = useMemo(
    () => ({ workspace_id: workspaceId, path, name, kind }),
    [kind, name, path, workspaceId],
  );
  const target = useMemo<SnapshotCommentTarget>(
    () => ({
      kind: 'file-view',
      title: name,
      snapshot: () => snapshot,
      source: () => ({ file, view_state: latest().state() }),
    }),
    [file, latest, name, snapshot],
  );
  const looks = useRef<FileViewLooks | undefined>(undefined);
  useEffect(() => {
    if (!sessionId) return;
    const created = new FileViewLooks(
      repository,
      sessionId,
      fileViewId(workspaceId, path),
      file,
      snapshot,
      () => latest().state(),
    );
    created.start();
    looks.current = created;
    const leave = () => created.stop();
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      created.stop();
      if (looks.current === created) looks.current = undefined;
    };
  }, [file, latest, path, repository, sessionId, snapshot, workspaceId]);
  const stateKey = declaration.stateKey;
  useEffect(() => {
    const timer = setTimeout(() => looks.current?.report(), STATE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [stateKey]);
  if (!sessionId)
    return (
      <FrameCommentsPortal>
        <FrameCommentsUnavailable reason={t`Open a conversation to comment`} />
      </FrameCommentsPortal>
    );
  return (
    <SnapshotCommentSession target={target}>
      <FrameCommentsPortal>
        <SnapshotCommentsIcon />
      </FrameCommentsPortal>
      {createPortal(<SnapshotRegionLayer />, declaration.root)}
    </SnapshotCommentSession>
  );
}

/** A stable reader of the newest value: callbacks read it without changing identity. */
function useLatest<T>(value: T): () => T {
  const box = useRef(value);
  useLayoutEffect(() => {
    box.current = value;
  });
  return useCallback(() => box.current, []);
}
