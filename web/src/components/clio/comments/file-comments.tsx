import type { Artifact, CommentMode, DocumentAnchor } from '@clio/core/v3';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MessageSquarePlusIcon, MessagesSquareIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { CommentCapture, CommentToggle } from './comment-capture';
import type { Rect } from './comment-region-layer';
import { CommentSessionProvider } from './comment-session';
import { CommentThreadList } from './comment-thread-list';
import { CommentThreadsPopover } from './comment-threads-popover';
import { FrameCommentsIcon, FrameCommentsPortal, FrameCommentsUnavailable } from './frame-comments';
import { useInFrameComments } from './frame-comments-slot';

type RegionAnchor = (rect: Rect, host: HTMLElement) => DocumentAnchor | undefined;

interface Version {
  artifactId: string;
  version: number;
  sha256: string;
}

function Commentable({
  title,
  sessionId,
  version,
  modes,
  regionAnchor,
  svg,
  initiallyActive,
  children,
}: {
  title: string;
  sessionId: string;
  version: Version;
  modes: readonly CommentMode[];
  regionAnchor?: RegionAnchor;
  svg?: Uint8Array;
  initiallyActive?: boolean;
  children: ReactNode;
}) {
  const inFrame = useInFrameComments();
  const list = <CommentThreadList artifactId={version.artifactId} sessionId={sessionId} />;
  return (
    <CommentSessionProvider
      initiallyActive={initiallyActive}
      surface={{
        title,
        modes,
        defaultMode: modes[0],
        destination: { kind: 'artifact', sessionId, ...version },
      }}
      threadList={
        inFrame ? (
          <CommentThreadsPopover
            align="start"
            className="z-[95]"
            trigger={
              <Button className="mt-2 w-full" size="sm" variant="ghost">
                <MessagesSquareIcon aria-hidden="true" />
                Earlier threads
              </Button>
            }
          >
            {list}
          </CommentThreadsPopover>
        ) : undefined
      }
    >
      <div className="relative h-full min-h-0 min-w-0" data-slot="commentable-view">
        {inFrame ? (
          <CommentToggle />
        ) : (
          <div className="absolute top-2 left-2 z-20 flex gap-1 rounded-md bg-background/90 p-0.5 shadow-sm">
            <CommentToggle />
            <CommentThreadsPopover
              align="start"
              trigger={
                <Button aria-label="Comment threads" size="sm" variant="ghost">
                  <MessagesSquareIcon aria-hidden="true" />
                </Button>
              }
            >
              {list}
            </CommentThreadsPopover>
          </div>
        )}
        <CommentCapture regionAnchor={regionAnchor} sourcePath={title} svg={svg}>
          {children}
        </CommentCapture>
      </div>
    </CommentSessionProvider>
  );
}

/**
 * Comments on an artifact version shown outside the document workspace (an image, an
 * HTML file): the toggle, the thread list and capture over the viewer.
 */
export function ArtifactComments({
  artifact,
  modes,
  regionAnchor,
  svg,
  children,
}: {
  artifact: { id: string; name: string; session_id: string; version: number; sha256: string };
  modes: readonly CommentMode[];
  regionAnchor?: RegionAnchor;
  svg?: Uint8Array;
  children: ReactNode;
}) {
  return (
    <Commentable
      modes={modes}
      regionAnchor={regionAnchor}
      svg={svg}
      sessionId={artifact.session_id}
      title={artifact.name}
      version={{ artifactId: artifact.id, version: artifact.version, sha256: artifact.sha256 }}
    >
      {children}
    </Commentable>
  );
}

/**
 * Comments on any file in the workspace (ledger FB22): a file the agent never registered is
 * registered as an artifact version when the person first starts commenting on it, so its
 * comments become threads like any artifact's. Outside a conversation there is nothing to
 * send comments to, and the viewer shows no comment control.
 */
export function WorkspaceFileComments({
  workspaceId,
  path,
  modes,
  regionAnchor,
  svg,
  children,
}: {
  workspaceId: string;
  path: string;
  modes: readonly CommentMode[];
  regionAnchor?: RegionAnchor;
  svg?: Uint8Array;
  children: ReactNode;
}) {
  const { sessionId = '' } = useParams();
  const inFrame = useInFrameComments();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [started, setStarted] = useState(false);
  const target = useQuery({
    queryKey: queryKeys.key('comment-threads', settings.endpoint, 'target', workspaceId, path),
    queryFn: ({ signal }) => repository.commentTarget(workspaceId, path, signal),
    enabled: Boolean(sessionId),
    retry: false,
  });
  const register = useMutation({
    mutationFn: () => repository.createCommentTarget(workspaceId, { path, session_id: sessionId }),
    onSuccess: () => setStarted(true),
  });
  if (!sessionId)
    return inFrame ? (
      <>
        <FrameCommentsPortal>
          <FrameCommentsUnavailable reason="Open a conversation to comment" />
        </FrameCommentsPortal>
        {children}
      </>
    ) : (
      <>{children}</>
    );
  const known = register.data ?? target.data;
  if (!known) {
    if (inFrame)
      return (
        <>
          <FrameCommentsPortal>
            <FrameCommentsIcon
              busy={register.isPending || target.isPending}
              disabledReason={register.error?.message}
              onClick={() => register.mutate()}
            />
          </FrameCommentsPortal>
          {children}
        </>
      );
    return (
      <div className="relative h-full min-h-0 min-w-0" data-slot="commentable-view">
        <div className="absolute top-2 left-2 z-20 rounded-md bg-background/90 p-0.5 shadow-sm">
          <Button
            disabled={register.isPending || target.isPending}
            onClick={() => register.mutate()}
            size="sm"
            title={register.error?.message}
            variant="ghost"
          >
            <MessageSquarePlusIcon aria-hidden="true" />
            Comment
          </Button>
        </div>
        {children}
      </div>
    );
  }
  return (
    <Commentable
      initiallyActive={started}
      modes={modes}
      regionAnchor={regionAnchor}
      sessionId={sessionId}
      svg={svg}
      title={known.name}
      version={{ artifactId: known.artifact_id, version: known.version, sha256: known.sha256 }}
    >
      {children}
    </Commentable>
  );
}

const OFFICE_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
};

/** The Office or OpenDocument media type of a file name, if it is one. */
// oxlint-disable-next-line react/only-export-components
export function officeMediaType(path: string): string | undefined {
  return OFFICE_TYPES[path.split('.').at(-1)?.toLowerCase() ?? ''];
}

/**
 * An Office or OpenDocument file in the workspace (ledger FB22). Its PDF rendition and its
 * comments belong to an artifact version, so in a conversation the file is registered as
 * one when it opens and shows straight away as its rendered preview, with its comments
 * and threads. Registering is idempotent: a file already registered keeps its version.
 * Outside a conversation, or when registering fails, the file reads as `fallback`, and
 * Preview and comment tries again.
 */
export function WorkspaceDocumentView({
  workspaceId,
  path,
  mediaType,
  fallback,
  loading,
  documentView,
}: {
  workspaceId: string;
  path: string;
  mediaType: string;
  fallback: ReactNode;
  /** Shown while the file's artifact version is found or registered. */
  loading: ReactNode;
  documentView: (artifact: Artifact) => ReactNode;
}) {
  const { sessionId = '' } = useParams();
  const inFrame = useInFrameComments();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const target = useQuery({
    queryKey: queryKeys.key('comment-threads', settings.endpoint, 'target', workspaceId, path),
    queryFn: ({ signal }) => repository.commentTarget(workspaceId, path, signal),
    enabled: Boolean(sessionId),
    retry: false,
  });
  const register = useMutation({
    mutationFn: () => repository.createCommentTarget(workspaceId, { path, session_id: sessionId }),
  });
  const known = register.data ?? target.data;
  const { mutate: registerTarget } = register;
  // Open means preview: an unregistered file is registered once, as Preview and comment would.
  const autoRegister = Boolean(sessionId) && target.data === null && register.isIdle;
  useEffect(() => {
    if (autoRegister) registerTarget();
  }, [autoRegister, registerTarget]);
  if (sessionId && !known && (target.isPending || register.isPending || autoRegister))
    return loading;
  if (!sessionId || !known) {
    if (inFrame)
      return (
        <>
          <FrameCommentsPortal>
            {sessionId ? (
              <FrameCommentsIcon
                label="Preview and comment"
                busy={register.isPending || target.isPending}
                disabledReason={register.error?.message}
                onClick={() => register.mutate()}
              />
            ) : (
              <FrameCommentsUnavailable reason="Open a conversation to comment" />
            )}
          </FrameCommentsPortal>
          {fallback}
        </>
      );
    return (
      <div className="relative h-full min-h-0 min-w-0" data-slot="workspace-document-view">
        {sessionId ? (
          <div className="absolute top-2 left-2 z-20 rounded-md bg-background/90 p-0.5 shadow-sm">
            <Button
              disabled={register.isPending || target.isPending}
              onClick={() => register.mutate()}
              size="sm"
              title={register.error?.message}
              variant="secondary"
            >
              <MessageSquarePlusIcon aria-hidden="true" />
              Preview and comment
            </Button>
          </div>
        ) : null}
        {fallback}
      </div>
    );
  }
  return documentView({
    id: known.artifact_id,
    session_id: sessionId,
    workspace_id: known.workspace_id,
    name: known.name,
    media_type: mediaType,
    uri: `artifact://${known.workspace_id}/${known.name}@v${known.version}`,
    sha256: known.sha256,
    version: known.version,
  });
}
