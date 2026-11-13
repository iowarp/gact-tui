import type { ToolPresentationBlock } from '@clio/core/v3';
import { FileClockIcon, FileXIcon } from 'lucide-react';
import { useContext, useEffect, useState, type CSSProperties } from 'react';
import { useWorkspaceFileIntegrity } from './use-workspace-file-integrity';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FileTypeIcon } from './file-type-icon';
import { PresentationNavigation } from './presentation-navigation';
import { WorkspaceFileView } from './resource-viewers';
import { t } from '@lingui/core/macro';

function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/u)
      .filter(Boolean)
      .at(-1) ?? path
  );
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
      <Empty aria-label={t`Workspace file unavailable`} className="w-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileXIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t`Workspace file unavailable`}</EmptyTitle>
          <EmptyDescription>
            {t`This result did not carry enough information to locate the file the agent viewed.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (integrity === 'missing') {
    return (
      <Empty aria-label={t`${name} is no longer available`} className="w-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileXIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{name}</EmptyTitle>
          <EmptyDescription>
            {t`No longer available in the workspace. The agent viewed this file, but it has since been removed or moved.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const identity = (
    <span className="flex min-w-0 items-center gap-1.5">
      <FileTypeIcon
        className="size-4 group-data-[fold-icon]/frame:hidden"
        mediaType={mediaType}
        name={name}
      />
      {canOpen ? (
        <button
          aria-label={t`Open ${name}`}
          className="min-w-0 shrink truncate rounded-[4px] px-0.5 text-menu font-medium text-foreground outline-none group-data-[fold-where]/frame:hidden hover:underline focus-visible:ring-1 focus-visible:ring-ring"
          data-frame-fit="name"
          onClick={() => {
            const page = block.pages?.[0];
            if (page && navigation?.onOpenFileReference) {
              navigation.onOpenFileReference(path, { page });
            } else navigation?.onOpenFile?.(path);
          }}
          title={t`${path}
Open in the workbench`}
          type="button"
        >
          {name}
        </button>
      ) : (
        <span
          className="min-w-0 shrink truncate text-menu font-medium text-foreground group-data-[fold-where]/frame:hidden"
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
                aria-label={t`Changed since the agent viewed it`}
                className="size-3.5 shrink-0 text-warning"
              />
            </TooltipTrigger>
            <TooltipContent>{t`Changed since the agent viewed it`}</TooltipContent>
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
