import { queryKeys } from '@/lib/query-keys';
import { TransportError, type ToolPresentationBlock } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { FileClockIcon, FileIcon, FileXIcon } from 'lucide-react';
import { useContext, type KeyboardEvent, type MouseEvent } from 'react';
import {
  Artifact,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { cn } from '@/lib/utils';
import { PresentationNavigation } from './presentation-navigation';
import { WorkspaceFileView } from './resource-viewers';

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Re-wrapped into a plain ArrayBuffer-backed copy: bytes returned through the
  // repository types as Uint8Array<ArrayBufferLike>, which SubtleCrypto's
  // stricter BufferSource typing (TS lib.dom) does not accept directly.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/u)
      .filter(Boolean)
      .at(-1) ?? path
  );
}

type IntegrityStatus = 'loading' | 'unchanged' | 'changed' | 'missing' | 'unknown';

/** Compares a `workspace_file` block's recorded hash against the live file. */
function useWorkspaceFileIntegrity({
  workspaceId,
  path,
  expectedSha256,
}: {
  workspaceId: string;
  path: string;
  expectedSha256?: string;
}): IntegrityStatus {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: queryKeys.key('workspace-file-integrity', settings.endpoint, workspaceId, path),
    queryFn: async ({ signal }) => {
      const bytes = await repository.readWorkspaceFileBytes(workspaceId, path, signal);
      return sha256Hex(bytes);
    },
    enabled: Boolean(workspaceId && path && expectedSha256),
    retry: (failureCount, error) =>
      !(error instanceof TransportError && error.status === 404) && failureCount < 2,
  });
  if (!expectedSha256) return 'unknown';
  if (query.isPending) return 'loading';
  if (query.error) {
    return query.error instanceof TransportError && query.error.status === 404
      ? 'missing'
      : 'unknown';
  }
  return query.data === expectedSha256 ? 'unchanged' : 'changed';
}

/**
 * Renders the `workspace_file` presentation block as an artifact-style card:
 * "what the agent saw" when it called view_image/view_pdf, previewed inline
 * and openable in the same workspace file viewer a human uses.
 */
export function WorkspaceFilePresentationBlock({ block }: { block: ToolPresentationBlock }) {
  const navigation = useContext(PresentationNavigation);
  const path = block.path ?? '';
  const workspaceId = block.workspace_id || navigation?.workspaceId || '';
  const integrity = useWorkspaceFileIntegrity({
    workspaceId,
    path,
    expectedSha256: block.sha256,
  });
  const canOpen = Boolean(path && navigation?.onOpenFile);
  const open = () => {
    if (canOpen) navigation?.onOpenFile?.(path);
  };
  const onHeaderClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    open();
  };
  const onHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  };

  if (!path || !workspaceId) {
    return (
      <Artifact aria-label="Workspace file unavailable" className="w-full">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileXIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Workspace file unavailable</EmptyTitle>
            <EmptyDescription>
              This result did not carry enough information to locate the file the agent viewed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Artifact>
    );
  }

  if (integrity === 'missing') {
    return (
      <Artifact aria-label={`${fileName(path)} is no longer available`} className="w-full">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileXIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{fileName(path)}</EmptyTitle>
            <EmptyDescription>
              No longer available in the workspace. The agent viewed this file, but it has since
              been removed or moved.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Artifact>
    );
  }

  return (
    <Artifact className="w-full">
      <ArtifactHeader
        aria-label={canOpen ? `Open ${fileName(path)}` : undefined}
        className={cn(
          'gap-3',
          canOpen &&
            'cursor-pointer transition-colors hover:bg-muted/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        )}
        onClick={canOpen ? onHeaderClick : undefined}
        onKeyDown={canOpen ? onHeaderKeyDown : undefined}
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
      >
        <FileIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <ArtifactTitle className="truncate">{fileName(path)}</ArtifactTitle>
          <ArtifactDescription className="truncate">
            {block.media_type || 'Media type unavailable'}
          </ArtifactDescription>
        </div>
        {integrity === 'loading' ? (
          <Skeleton className="size-4 shrink-0 rounded-full" />
        ) : integrity === 'changed' ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <FileClockIcon
                  aria-label="Changed since the agent viewed it"
                  className="size-4 shrink-0 text-warning"
                />
              </TooltipTrigger>
              <TooltipContent>Changed since the agent viewed it</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </ArtifactHeader>
      <ArtifactContent
        className="p-0"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="max-h-72 min-h-36 overflow-hidden">
          <WorkspaceFileView
            initialPage={block.pages?.[0]}
            mediaType={block.media_type}
            path={path}
            workspaceId={workspaceId}
          />
        </div>
      </ArtifactContent>
    </Artifact>
  );
}
