import type { WorkspaceResource } from '@clio/core/v3';
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@/components/ai-elements/attachments';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { FileUpIcon, PanelRightOpenIcon } from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { formatResourceSize } from '@/lib/format';
import { cn } from '@/lib/utils';

const WorkspaceResourceView = lazy(() =>
  import('./workspace-resource-view').then((module) => ({
    default: module.WorkspaceResourceView,
  })),
);

interface WorkspaceResourceBrowserProps {
  defaultSplit?: boolean;
  error?: string;
  onOpenResource: (resource: WorkspaceResource) => void;
  pending?: boolean;
  resources: readonly WorkspaceResource[];
  workspaceId: string;
}

/** Browses workspace-owned uploads and opens one resource without duplicating the list tab. */
export function WorkspaceResourceBrowser({
  defaultSplit = false,
  error,
  onOpenResource,
  pending,
  resources,
  workspaceId,
}: WorkspaceResourceBrowserProps) {
  const hostRef = useRef<HTMLElement>(null);
  const [wide, setWide] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const split = defaultSplit || wide;
  const selected =
    resources.find((resource) => resource.id === selectedId) ?? (split ? resources[0] : undefined);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setWide(host.clientWidth >= 760);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const activate = (
    resource: WorkspaceResource,
    event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.shiftKey) onOpenResource(resource);
    else if (split) setSelectedId(resource.id);
    else onOpenResource(resource);
  };

  const list = (
    <ScrollArea className="h-full p-2">
      <Attachments className="grid w-full gap-2" variant="list">
        {pending ? <LoadingResources /> : null}
        {resources.map((resource) => {
          const progress = resource.declared_size
            ? Math.round((resource.received_size / resource.declared_size) * 100)
            : 0;
          return (
            <Attachment
              aria-label={`Open ${resource.name}`}
              className={cn(
                'cursor-pointer p-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                selected?.id === resource.id && 'border-primary bg-primary/5',
              )}
              data={{
                id: resource.id,
                type: 'file',
                filename: resource.name,
                mediaType: resource.detected_mime || resource.claimed_mime,
                url: '',
              }}
              key={resource.id}
              onClick={(event) => activate(resource, event)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                activate(resource, event);
              }}
              role="button"
              tabIndex={0}
            >
              <AttachmentPreview className="size-10" />
              <AttachmentInfo showMediaType />
              <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                <p>{formatResourceSize(resource.received_size)}</p>
                <p>{resource.state === 'uploading' ? `${progress}%` : resource.state}</p>
              </div>
              <Button
                aria-label={`Pin ${resource.name} as a canvas tab`}
                className="size-8 shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenResource(resource);
                }}
                size="icon-sm"
                title="Pin as a canvas tab"
                variant="ghost"
              >
                <PanelRightOpenIcon aria-hidden="true" />
              </Button>
            </Attachment>
          );
        })}
      </Attachments>
      {!pending && !resources.length ? (
        <Empty className="border-0 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileUpIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{error ? 'Resources unavailable' : 'No workspace resources'}</EmptyTitle>
            <EmptyDescription>
              {error || 'Upload a file from the composer to keep it with this workspace.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </ScrollArea>
  );

  return (
    <section aria-label="Workspace resources" className="h-full min-h-0" ref={hostRef}>
      {split && selected ? (
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="32%" id="workspace-resource-list" minSize="190px">
            {list}
          </ResizablePanel>
          <ResizableHandle aria-label="Resize workspace resource list" withHandle />
          <ResizablePanel id="workspace-resource-preview" minSize="320px">
            <Suspense fallback={<PreviewLoading />}>
              <WorkspaceResourceView resource={selected} workspaceId={workspaceId} />
            </Suspense>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        list
      )}
    </section>
  );
}

function LoadingResources() {
  return (
    <div aria-label="Loading workspace resources" className="grid w-full gap-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-5/6" />
      <Skeleton className="h-14 w-11/12" />
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading…</div>
  );
}
