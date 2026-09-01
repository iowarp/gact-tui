import type { ResourceDeliveryRecord, WorkspaceResource } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { BracesIcon, FileIcon, HistoryIcon } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useObjectUrl } from '@/hooks/use-object-url';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import {
  ImageResourceView,
  ResourceLoading,
  ResourceUnavailable,
  TextResourceView,
} from './resource-viewers';
import { ClioStatus } from './status';
import { WorkspaceResourceDerivativesView } from './workspace-resource-derivatives';

const PdfResourceViewer = lazy(() =>
  import('./document-pdf-viewer').then((module) => ({
    default: module.ClioDocumentPdfViewer,
  })),
);

interface WorkspaceResourceViewProps {
  resource: WorkspaceResource;
  workspaceId: string;
}

/** Renders one workspace-owned upload and its structured processing provenance. */
export function WorkspaceResourceView({ resource, workspaceId }: WorkspaceResourceViewProps) {
  const repository = useRepository();
  const [activeTab, setActiveTab] = useState('preview');
  const preview = useQuery({
    queryKey: queryKeys.key(
      'workspace-resource-preview',
      workspaceId,
      resource.id,
      resource.revision,
    ),
    queryFn: ({ signal }) => repository.resourcePreview(workspaceId, resource.id, signal),
    enabled: resource.state === 'ready' && isPreviewable(resource.detected_mime),
  });
  const derivatives = useQuery({
    queryKey: queryKeys.key(
      'workspace-resource-derivatives',
      workspaceId,
      resource.id,
      resource.revision,
    ),
    queryFn: ({ signal }) => repository.resourceDerivatives(workspaceId, resource.id, signal),
    enabled: resource.state === 'ready',
    refetchInterval: (query) =>
      ['submitted', 'processing'].includes(query.state.data?.processor.state ?? '') ? 1_500 : false,
  });
  const structure = useQuery({
    queryKey: queryKeys.key(
      'workspace-resource-structure',
      workspaceId,
      resource.id,
      resource.revision,
    ),
    queryFn: ({ signal }) => repository.resourceStructure(workspaceId, resource.id, signal),
    enabled:
      activeTab === 'structure' && Boolean(derivatives.data?.processor.derivatives_available),
    retry: false,
  });
  const deliveries = useQuery({
    queryKey: queryKeys.key('workspace-resource-deliveries', workspaceId),
    queryFn: ({ signal }) => repository.resourceDeliveries(workspaceId, signal),
    enabled: activeTab === 'provenance',
  });
  const matchingDeliveries = useMemo(
    () => deliveries.data?.filter((record) => record.resource_id === resource.id) ?? [],
    [deliveries.data, resource.id],
  );

  return (
    <section aria-label={`Resource ${resource.name}`} className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b px-3 py-2">
        <FileIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold" title={resource.name}>
            {resource.name}
          </h2>
          <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {resource.detected_mime || resource.claimed_mime || 'Type unavailable'}
            </span>
            <span className="shrink-0">{formatBytes(resource.received_size)}</span>
          </p>
        </div>
        <ClioStatus value={resourceStateStatus(resource.state)} />
      </header>

      <Tabs className="min-h-0 flex-1 gap-0" onValueChange={setActiveTab} value={activeTab}>
        <div className="shrink-0 border-b p-1.5">
          <TabsList className="grid h-9 w-full grid-cols-4">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="structure">Structure</TabsTrigger>
            <TabsTrigger value="derivatives">Derivatives</TabsTrigger>
            <TabsTrigger value="provenance">Provenance</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent className="m-0 min-h-0 overflow-hidden" value="preview">
          <ResourcePreview
            bytes={preview.data}
            error={preview.error?.message}
            resource={resource}
          />
        </TabsContent>
        <TabsContent className="m-0 min-h-0 overflow-hidden" value="structure">
          <StructuredResourceView
            error={structure.error?.message}
            processing={derivatives.data?.processor}
            resource={resource}
            structure={structure.data?.collections}
            workspaceId={workspaceId}
          />
        </TabsContent>
        <TabsContent className="m-0 min-h-0 overflow-hidden" value="derivatives">
          <WorkspaceResourceDerivativesView
            derivatives={derivatives.data?.derivatives ?? []}
            error={derivatives.error?.message}
            processing={derivatives.data?.processor}
            resourceId={resource.id}
            workspaceId={workspaceId}
          />
        </TabsContent>
        <TabsContent className="m-0 min-h-0 overflow-hidden" value="provenance">
          <ResourceProvenance
            deliveries={matchingDeliveries}
            error={deliveries.error?.message}
            resource={resource}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function ResourcePreview({
  bytes,
  error,
  resource,
}: {
  bytes?: Uint8Array;
  error?: string;
  resource: WorkspaceResource;
}) {
  if (resource.state === 'uploading') {
    const progress = resource.declared_size
      ? Math.round((resource.received_size / resource.declared_size) * 100)
      : 0;
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="w-full max-w-sm space-y-3 text-center">
          <p className="text-sm font-medium">Uploading {progress}%</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatBytes(resource.received_size)} of {formatBytes(resource.declared_size)}
          </p>
        </div>
      </div>
    );
  }
  if (resource.state !== 'ready') {
    return (
      <div className="p-4">
        <ResourceUnavailable
          detail={resource.failure || 'The service could not make this resource available.'}
          label={resource.state === 'quarantined' ? 'Resource quarantined' : 'Resource unavailable'}
        />
      </div>
    );
  }
  if (!isPreviewable(resource.detected_mime)) {
    return (
      <div className="p-4">
        <ResourceUnavailable
          detail="Original bytes are retained with their detected type. This format has a metadata-only preview until a bounded tool or structured processor can inspect it."
          label="Metadata-only resource"
        />
      </div>
    );
  }
  if (resource.detected_mime.startsWith('text/') || isTextApplication(resource.detected_mime)) {
    return (
      <TextResourceView
        content={bytes ? new TextDecoder().decode(bytes) : undefined}
        error={error}
        path={resource.name}
      />
    );
  }
  if (resource.detected_mime.startsWith('image/')) {
    return (
      <ImageResourceView
        bytes={bytes}
        error={error}
        mediaType={resource.detected_mime}
        name={resource.name}
      />
    );
  }
  return <NativeMediaPreview bytes={bytes} error={error} resource={resource} />;
}

function NativeMediaPreview({
  bytes,
  error,
  resource,
}: {
  bytes?: Uint8Array;
  error?: string;
  resource: WorkspaceResource;
}) {
  const url = useObjectUrl(bytes, resource.detected_mime);
  if (error) return <ResourceUnavailable detail={error} label="Preview unavailable" />;
  if (!url) return <ResourceLoading className="p-4" label={`Loading ${resource.name}`} />;
  if (resource.detected_mime === 'application/pdf') {
    return (
      <div className="size-full overflow-auto p-3">
        <Suspense fallback={<ResourceLoading className="p-4" label={`Loading ${resource.name}`} />}>
          <PdfResourceViewer
            bytes={bytes ?? new Uint8Array()}
            name={resource.name}
            onSelection={() => undefined}
          />
        </Suspense>
      </div>
    );
  }
  if (resource.detected_mime.startsWith('video/')) {
    return <video className="size-full bg-black object-contain" controls src={url} />;
  }
  if (resource.detected_mime.startsWith('audio/')) {
    return (
      <div className="grid h-full place-items-center p-6">
        <audio className="w-full max-w-xl" controls src={url} />
      </div>
    );
  }
  return <ResourceUnavailable label="Preview unavailable" />;
}

function StructuredResourceView({
  error,
  processing,
  resource,
  structure,
  workspaceId,
}: {
  error?: string;
  processing?: { state: string; progress: number; failure: Record<string, unknown> };
  resource: WorkspaceResource;
  structure?: Record<string, number>;
  workspaceId: string;
}) {
  const repository = useRepository();
  const [selection, setSelection] = useState<{ collection: string; index: number }>();
  const node = useQuery({
    queryKey: queryKeys.key(
      'workspace-resource-structure-node',
      workspaceId,
      resource.id,
      selection?.collection,
      selection?.index,
    ),
    queryFn: ({ signal }) =>
      repository.resourceStructureNode(
        workspaceId,
        resource.id,
        selection?.collection ?? '',
        selection?.index ?? 0,
        signal,
      ),
    enabled: Boolean(selection),
  });
  if (processing?.state !== 'complete') {
    return (
      <div className="grid h-full place-items-center p-4">
        <div className="max-w-sm space-y-3 text-center">
          <BracesIcon aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Structured document view is not ready</p>
          <p className="text-xs text-muted-foreground">
            {processing?.state === 'processing' || processing?.state === 'submitted'
              ? `Processing ${Math.round(processing.progress)}%`
              : error || 'Use Reprocess in Derivatives when a document processor is available.'}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(9rem,0.32fr)_1fr]">
      <ScrollArea className="border-r p-2">
        <div className="grid gap-1">
          {Object.entries(structure ?? {}).map(([collection, count]) => (
            <Button
              className="h-auto justify-between px-2 py-1.5"
              key={collection}
              onClick={() => setSelection({ collection, index: 0 })}
              variant={selection?.collection === collection ? 'secondary' : 'ghost'}
            >
              <span className="truncate">{collection}</span>
              <Badge variant="outline">{count}</Badge>
            </Button>
          ))}
        </div>
      </ScrollArea>
      <ScrollArea className="p-3">
        {node.isPending ? <ResourceLoading label="Loading structured node" /> : null}
        {node.error ? (
          <ResourceUnavailable detail={node.error.message} label="Structured node unavailable" />
        ) : null}
        {node.data ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">
            {JSON.stringify(node.data.node, null, 2)}
          </pre>
        ) : !node.isPending && !node.error ? (
          <p className="text-sm text-muted-foreground">Choose a structured collection.</p>
        ) : null}
      </ScrollArea>
    </div>
  );
}

function ResourceProvenance({
  deliveries,
  error,
  resource,
}: {
  deliveries: readonly ResourceDeliveryRecord[];
  error?: string;
  resource: WorkspaceResource;
}) {
  return (
    <ScrollArea className="h-full p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
        <dt className="text-muted-foreground">Revision</dt>
        <dd>{resource.revision}</dd>
        <dt className="text-muted-foreground">SHA-256</dt>
        <dd className="break-all font-mono">{resource.sha256 || 'Unavailable'}</dd>
        <dt className="text-muted-foreground">Detected as</dt>
        <dd>{resource.detected_mime || 'Unavailable'}</dd>
        <dt className="text-muted-foreground">Detection</dt>
        <dd>{resource.detection_source || 'Unavailable'}</dd>
      </dl>
      <div className="my-4 border-t" />
      <div className="mb-2 flex items-center gap-2">
        <HistoryIcon aria-hidden="true" className="size-4 text-primary" />
        <h3 className="text-sm font-medium">Provider deliveries</h3>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="grid gap-2">
        {deliveries.map((delivery) => (
          <div className="rounded-lg border p-3 text-xs" key={delivery.id}>
            <p className="font-medium">
              {delivery.provider_id} / {delivery.model_id}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
              <span>{delivery.representation}</span>
              <time dateTime={delivery.delivered_at}>
                {new Date(delivery.delivered_at).toLocaleString()}
              </time>
            </div>
          </div>
        ))}
        {!deliveries.length && !error ? (
          <p className="text-xs text-muted-foreground">
            This resource has not been delivered to a model.
          </p>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function isPreviewable(mediaType: string): boolean {
  return (
    mediaType.startsWith('text/') ||
    mediaType.startsWith('image/') ||
    mediaType.startsWith('audio/') ||
    mediaType.startsWith('video/') ||
    mediaType === 'application/pdf' ||
    isTextApplication(mediaType)
  );
}

function isTextApplication(mediaType: string): boolean {
  return ['application/json', 'application/xml', 'application/javascript'].includes(mediaType);
}

function resourceStateStatus(
  state: WorkspaceResource['state'],
): 'healthy' | 'running' | 'unavailable' | 'failed' {
  if (state === 'ready') return 'healthy';
  if (state === 'uploading') return 'running';
  if (state === 'quarantined') return 'unavailable';
  return 'failed';
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return value === 0 ? '0 B' : 'Unavailable';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`;
}
