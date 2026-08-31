import type {
  WorkspaceResourceDerivative,
  WorkspaceResourceProcessing,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  EyeIcon,
  FileIcon,
  FileStackIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useObjectUrl } from '@/hooks/use-object-url';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import {
  ImageResourceView,
  ResourceLoading,
  ResourceUnavailable,
  TextResourceView,
} from './resource-viewers';

interface WorkspaceResourceDerivativesViewProps {
  derivatives: readonly WorkspaceResourceDerivative[];
  error?: string;
  processing?: WorkspaceResourceProcessing;
  resourceId: string;
  workspaceId: string;
}

/** Lists versioned structured derivatives and previews one without creating another canvas tab. */
export function WorkspaceResourceDerivativesView({
  derivatives,
  error,
  processing,
  resourceId,
  workspaceId,
}: WorkspaceResourceDerivativesViewProps) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = derivatives.find((derivative) => derivative.id === selectedId);
  const reprocess = useMutation({
    mutationFn: () => repository.reprocessResource(workspaceId, resourceId),
    onSuccess: async () => {
      setSelectedId(undefined);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('workspace-resource-derivatives', workspaceId, resourceId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('workspace-resource-structure', workspaceId, resourceId),
        }),
      ]);
      toast.success('Document processing started');
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });

  if (error) return <ResourceUnavailable detail={error} label="Derivatives unavailable" />;
  if (selected) {
    return (
      <section className="flex h-full min-h-0 flex-col" aria-label={`Preview ${selected.name}`}>
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
          <Button
            aria-label="Back to derivatives"
            className="size-8"
            onClick={() => setSelectedId(undefined)}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowLeftIcon aria-hidden="true" />
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {selected.name || selected.id}
          </span>
          <Badge variant="outline">{selected.kind || 'Derivative'}</Badge>
        </div>
        <div className="min-h-0 flex-1">
          <DerivativePreview
            derivative={selected}
            resourceId={resourceId}
            workspaceId={workspaceId}
          />
        </div>
      </section>
    );
  }

  return (
    <ScrollArea className="h-full p-3">
      <div className="mb-3 flex items-center gap-2">
        <FileStackIcon aria-hidden="true" className="size-4 text-primary" />
        <span className="text-sm font-medium">Structured processing</span>
        <Badge className="ml-auto" variant="outline">
          {processing?.state ?? 'not started'}
        </Badge>
        <Button
          aria-label="Reprocess resource"
          className="size-8"
          disabled={reprocess.isPending || processing?.state === 'processing'}
          onClick={() => reprocess.mutate()}
          size="icon-sm"
          title="Reprocess resource"
          variant="ghost"
        >
          <RefreshCwIcon aria-hidden="true" className={reprocess.isPending ? 'animate-spin' : ''} />
        </Button>
      </div>
      <div className="grid gap-2">
        {derivatives.map((derivative) => (
          <button
            className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            key={derivative.id}
            onClick={() => setSelectedId(derivative.id)}
            type="button"
          >
            <FileIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {derivative.name || derivative.id}
              </span>
              <span className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>{derivative.kind || 'Derivative'}</span>
                <span>{derivative.media_type || 'Type unavailable'}</span>
                {derivative.size === undefined ? null : <span>{formatBytes(derivative.size)}</span>}
              </span>
            </span>
            <EyeIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
        {!derivatives.length ? (
          <ResourceUnavailable
            detail="No derived representations have been recorded for this resource."
            label="No derivatives"
          />
        ) : null}
      </div>
    </ScrollArea>
  );
}

function DerivativePreview({
  derivative,
  resourceId,
  workspaceId,
}: {
  derivative: WorkspaceResourceDerivative;
  resourceId: string;
  workspaceId: string;
}) {
  const repository = useRepository();
  const content = useQuery({
    queryKey: queryKeys.key(
      'workspace-resource-derivative-content',
      workspaceId,
      resourceId,
      derivative.id,
    ),
    queryFn: ({ signal }) =>
      repository.resourceDerivativeContent(workspaceId, resourceId, derivative.id, signal),
  });
  const mediaType = derivative.media_type || 'application/octet-stream';

  if (content.error) {
    return <ResourceUnavailable detail={content.error.message} label="Derivative unavailable" />;
  }
  if (!content.data) return <ResourceLoading className="p-4" label="Loading derivative" />;
  if (mediaType.startsWith('text/') || isTextApplication(mediaType)) {
    return (
      <TextResourceView
        content={new TextDecoder().decode(content.data)}
        path={derivative.name || derivative.id}
      />
    );
  }
  if (mediaType.startsWith('image/')) {
    return (
      <ImageResourceView
        bytes={content.data}
        mediaType={mediaType}
        name={derivative.name || derivative.id}
      />
    );
  }
  if (mediaType === 'application/pdf') {
    return (
      <PdfDerivativePreview
        bytes={content.data}
        mediaType={mediaType}
        name={derivative.name || derivative.id}
      />
    );
  }
  return (
    <ResourceUnavailable
      detail="This derivative is retained and available to bounded tools, but has no safe inline renderer."
      label="Metadata-only derivative"
    />
  );
}

function PdfDerivativePreview({
  bytes,
  mediaType,
  name,
}: {
  bytes: Uint8Array;
  mediaType: string;
  name: string;
}) {
  const objectUrl = useObjectUrl(bytes, mediaType);
  if (!objectUrl) return <ResourceLoading className="p-4" label={`Loading ${name}`} />;
  return <object aria-label={name} className="size-full" data={objectUrl} type={mediaType} />;
}

function isTextApplication(mediaType: string): boolean {
  return ['application/json', 'application/xml', 'application/javascript'].includes(mediaType);
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return value === 0 ? '0 B' : 'Unavailable';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`;
}
