import type { CommentMode, DocumentAnchor } from '@clio/core/v3';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MessageSquarePlusIcon, MessagesSquareIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { CommentCapture, CommentToggle } from './comment-capture';
import type { Rect } from './comment-region-layer';
import { CommentSessionProvider } from './comment-session';
import { CommentThreadList } from './comment-thread-list';

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
  initiallyActive,
  children,
}: {
  title: string;
  sessionId: string;
  version: Version;
  modes: readonly CommentMode[];
  regionAnchor?: RegionAnchor;
  initiallyActive?: boolean;
  children: ReactNode;
}) {
  return (
    <CommentSessionProvider
      initiallyActive={initiallyActive}
      surface={{
        title,
        modes,
        defaultMode: modes[0],
        destination: { kind: 'artifact', sessionId, ...version },
      }}
    >
      <div className="relative h-full min-h-0 min-w-0" data-slot="commentable-view">
        <div className="absolute top-2 left-2 z-20 flex gap-1 rounded-md bg-background/90 p-0.5 shadow-sm">
          <CommentToggle />
          <Popover>
            <PopoverTrigger asChild>
              <Button aria-label="Comment threads" size="sm" variant="ghost">
                <MessagesSquareIcon aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="max-h-[70dvh] w-[min(26rem,calc(100vw-1rem))] overflow-auto p-0">
              <CommentThreadList artifactId={version.artifactId} sessionId={sessionId} />
            </PopoverContent>
          </Popover>
        </div>
        <CommentCapture regionAnchor={regionAnchor} sourcePath={title}>
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
  children,
}: {
  artifact: { id: string; name: string; session_id: string; version: number; sha256: string };
  modes: readonly CommentMode[];
  regionAnchor?: RegionAnchor;
  children: ReactNode;
}) {
  return (
    <Commentable
      modes={modes}
      regionAnchor={regionAnchor}
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
  children,
}: {
  workspaceId: string;
  path: string;
  modes: readonly CommentMode[];
  regionAnchor?: RegionAnchor;
  children: ReactNode;
}) {
  const { sessionId = '' } = useParams();
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
  if (!sessionId) return <>{children}</>;
  const known = register.data ?? target.data;
  if (!known) {
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
      title={known.name}
      version={{ artifactId: known.artifact_id, version: known.version, sha256: known.sha256 }}
    >
      {children}
    </Commentable>
  );
}
