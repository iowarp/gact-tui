import { FileClockIcon, FileXIcon } from 'lucide-react';
import { useContext } from 'react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/format';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NamedTooltip } from './primitives/icon-button';
import { PresentationNavigation } from './presentation-navigation';
import { useObjectUrl } from '@/hooks/use-object-url';
import { fileName } from './resource-media-types';
import { useWorkspaceFileIntegrity } from './use-workspace-file-integrity';
import type { WorkspaceImage } from './image-reach';

/**
 * An image a call viewed, as a 96px-tall thumbnail that opens the workspace viewer.
 * The box keeps its height while the bytes load or when the file is gone, so the
 * transcript never moves under it.
 */
export function WorkspaceImageThumbnail({
  image,
  workspaceId: providedWorkspaceId,
}: {
  image: WorkspaceImage;
  workspaceId?: string;
}) {
  const navigation = useContext(PresentationNavigation);
  const workspaceId = providedWorkspaceId || navigation?.workspaceId || '';
  const name = fileName(image.path);
  const { status, bytes } = useWorkspaceFileIntegrity({
    workspaceId,
    path: image.path,
    expectedSha256: image.sha256,
  });
  const url = useObjectUrl(status === 'missing' ? undefined : bytes, image.mediaType);
  const open = navigation?.onOpenFile;
  const missing = status === 'missing';
  const unavailable = missing || (!workspaceId && !url);
  return (
    <figure className="flex w-max max-w-[200px] min-w-0 flex-col gap-1" data-slot="image-thumbnail">
      <button
        type="button"
        aria-label={`Open ${name}`}
        disabled={!open || unavailable}
        title={`${image.path}\nOpen in the workbench`}
        onClick={(event) => {
          event.stopPropagation();
          open?.(image.path);
        }}
        className={cn(
          'grid h-24 min-w-24 max-w-[200px] place-items-center overflow-hidden rounded-md border border-border bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:cursor-zoom-in enabled:hover:border-foreground/30',
          !url && 'w-24',
        )}
      >
        {unavailable ? (
          <span className="flex flex-col items-center gap-1 px-2 text-center text-meta text-muted-foreground">
            <FileXIcon aria-hidden="true" className="size-4" />
            {missing ? 'No longer in the workspace' : 'No preview'}
          </span>
        ) : url ? (
          <img alt={name} src={url} className="h-full w-auto max-w-[200px] object-contain" />
        ) : (
          <span
            aria-label={`Loading ${name}`}
            role="status"
            className="size-full bg-muted motion-safe:animate-pulse"
          />
        )}
      </button>
      <figcaption className="flex min-w-0 items-center gap-1 text-meta text-muted-foreground">
        <span className="min-w-0 truncate" title={image.path}>
          {name}
        </span>
        {image.sizeBytes ? (
          <span className="shrink-0 text-faint">{formatBytes(image.sizeBytes)}</span>
        ) : null}
        {status === 'changed' ? (
          <TooltipProvider>
            <NamedTooltip label="Changed since the agent viewed it">
              <FileClockIcon
                aria-label="Changed since the agent viewed it"
                className="size-3.5 shrink-0 text-warning"
              />
            </NamedTooltip>
          </TooltipProvider>
        ) : null}
      </figcaption>
    </figure>
  );
}

/** Several viewed images side by side, wrapping onto more lines when narrow. */
export function WorkspaceImageStrip({
  images,
  workspaceId,
}: {
  images: readonly WorkspaceImage[];
  workspaceId?: string;
}) {
  return (
    <ul
      aria-label={`${images.length} image${images.length === 1 ? '' : 's'}`}
      className="flex flex-wrap gap-2"
    >
      {images.map((image, index) => (
        <li key={`${image.path}-${index}`} className="min-w-0">
          <WorkspaceImageThumbnail image={image} workspaceId={workspaceId} />
        </li>
      ))}
    </ul>
  );
}
