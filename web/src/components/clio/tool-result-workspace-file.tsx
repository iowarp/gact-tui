import { queryKeys } from '@/lib/query-keys';
import { keepEqualBytes } from '@/lib/keep-equal-bytes';
import { TransportError, type ToolPresentationBlock } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { FileClockIcon, FileXIcon } from 'lucide-react';
import { useContext, useEffect, useState, type CSSProperties } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { VIEWER_BYTES_GC_TIME_MS } from '@/lib/runtime-limits';
import { FileTypeIcon } from './file-type-icon';
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

/**
 * Compares a `workspace_file` block's recorded hash against the live file. The bytes
 * are read under the viewer's own key, so the preview below reuses them instead of
 * fetching the same file a second time.
 */
function useWorkspaceFileIntegrity({
  workspaceId,
  path,
  expectedSha256,
}: {
  workspaceId: string;
  path: string;
  expectedSha256?: string;
}): { status: IntegrityStatus; bytes?: Uint8Array } {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const content = useQuery({
    queryKey: queryKeys.workspaceFileBytes(settings.endpoint, workspaceId, path),
    queryFn: ({ signal }) => repository.readWorkspaceFileBytes(workspaceId, path, signal),
    enabled: Boolean(workspaceId && path),
    gcTime: VIEWER_BYTES_GC_TIME_MS,
    structuralSharing: keepEqualBytes,
    retry: (failureCount, error) =>
      !(error instanceof TransportError && error.status === 404) && failureCount < 2,
  });
  const bytes = content.data;
  const digest = useQuery({
    queryKey: queryKeys.key(
      'workspace-file-integrity',
      settings.endpoint,
      workspaceId,
      path,
      content.dataUpdatedAt,
    ),
    queryFn: () => sha256Hex(bytes!),
    enabled: Boolean(bytes && expectedSha256),
    staleTime: Infinity,
  });
  if (content.isPending) return { status: 'loading' };
  if (content.error) {
    return {
      status:
        content.error instanceof TransportError && content.error.status === 404
          ? 'missing'
          : 'unknown',
    };
  }
  if (!expectedSha256) return { status: 'unknown', bytes };
  if (!digest.data) return { status: 'loading', bytes };
  return { status: digest.data === expectedSha256 ? 'unchanged' : 'changed', bytes };
}

/** An image's natural size, read once from its bytes, so its box can take the image's shape. */
function useImageSize(bytes: Uint8Array | undefined, mediaType: string) {
  const [size, setSize] = useState<{ bytes: Uint8Array; width: number; height: number }>();
  useEffect(() => {
    if (!bytes || !mediaType.startsWith('image/')) return;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mediaType }));
    const image = new window.Image();
    let live = true;
    image.onload = () => {
      if (live && image.naturalWidth && image.naturalHeight)
        setSize({ bytes, width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
  }, [bytes, mediaType]);
  return size && size.bytes === bytes ? size : undefined;
}

/** The preview's height budget, the frame bar included. */
const PREVIEW_HEIGHT = '23rem';

/**
 * Renders the `workspace_file` presentation block, "what the agent saw" when it called
 * view_image/view_pdf, as the workspace file viewer itself: one frame (the result's
 * own), one 34px bar that leads with the file's type icon and name (which opens it in
 * the workbench) and keeps the viewer's controls, and the content filling the rest.
 */
export function WorkspaceFilePresentationBlock({ block }: { block: ToolPresentationBlock }) {
  const navigation = useContext(PresentationNavigation);
  const path = block.path ?? '';
  const name = fileName(path);
  const workspaceId = block.workspace_id || navigation?.workspaceId || '';
  const mediaType = block.media_type ?? '';
  const { status: integrity, bytes } = useWorkspaceFileIntegrity({
    workspaceId,
    path,
    expectedSha256: block.sha256,
  });
  const isImage = mediaType.startsWith('image/');
  const imageSize = useImageSize(isImage ? bytes : undefined, mediaType);
  const canOpen = Boolean(path && navigation?.onOpenFile);

  if (!path || !workspaceId) {
    return (
      <Empty aria-label="Workspace file unavailable" className="w-full">
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
    );
  }

  if (integrity === 'missing') {
    return (
      <Empty aria-label={`${name} is no longer available`} className="w-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileXIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{name}</EmptyTitle>
          <EmptyDescription>
            No longer available in the workspace. The agent viewed this file, but it has since been
            removed or moved.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const identity = (
    <span className="flex min-w-0 items-center gap-1.5">
      <FileTypeIcon className="size-4" mediaType={mediaType} name={name} />
      {canOpen ? (
        <button
          aria-label={`Open ${name}`}
          className="min-w-0 shrink truncate rounded-[4px] px-0.5 text-[12.5px] font-medium text-foreground outline-none group-data-[fold-where]/frame:hidden hover:underline focus-visible:ring-1 focus-visible:ring-ring"
          data-frame-fit="name"
          onClick={() => {
            const page = block.pages?.[0];
            if (page && navigation?.onOpenFileReference) {
              navigation.onOpenFileReference(path, { page });
            } else navigation?.onOpenFile?.(path);
          }}
          title={`${path}\nOpen in the workbench`}
          type="button"
        >
          {name}
        </button>
      ) : (
        <span
          className="min-w-0 shrink truncate text-[12.5px] font-medium text-foreground group-data-[fold-where]/frame:hidden"
          data-frame-fit="name"
          title={path}
        >
          {name}
        </span>
      )}
      {integrity === 'changed' ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <FileClockIcon
                aria-label="Changed since the agent viewed it"
                className="size-3.5 shrink-0 text-warning"
              />
            </TooltipTrigger>
            <TooltipContent>Changed since the agent viewed it</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </span>
  );

  // Every viewer scrolls or fits inside a definite height: under a max-height alone a PDF
  // grows to the whole document, painting every page and leaving no scroller to land on
  // the cited page. An image's box takes the image's shape (the bar, the viewer's 16px
  // margins and the fitted image), so a wide one leaves no band of empty space under it.
  const style: CSSProperties = {
    height: imageSize
      ? `min(${PREVIEW_HEIGHT}, calc(34px + 34px + min(${imageSize.height}px, (100cqw - 32px) * ${
          imageSize.height / imageSize.width
        })))`
      : isImage
        ? '12rem'
        : PREVIEW_HEIGHT,
  };
  return (
    <div
      className="@container w-full"
      data-slot="workspace-file-preview"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="overflow-hidden" style={style}>
        <WorkspaceFileView
          embedded
          identity={identity}
          initialPage={block.pages?.[0]}
          mediaType={block.media_type}
          path={path}
          workspaceId={workspaceId}
        />
      </div>
    </div>
  );
}
