import type { ResourceDeliveryRecord, WorkspaceResource } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { BracesIcon, FileIcon, FileInputIcon, ScanSearchIcon, SendIcon } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@/components/reui/timeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useObjectUrl } from '@/hooks/use-object-url';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { ACTIVE_SESSION_POLL_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
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
  const { settings } = useConnectionSettings();
  const endpoint = settings.endpoint;
  const [activeTab, setActiveTab] = useState('preview');
  const preview = useQuery({
    queryKey: queryKeys.workspaceResourcePreview(
      endpoint,
      workspaceId,
      resource.id,
      resource.revision,
    ),
    queryFn: ({ signal }) => repository.resourcePreview(workspaceId, resource.id, signal),
    enabled: resource.state === 'ready' && isPreviewable(resource.detected_mime),
  });
  const derivatives = useQuery({
    queryKey: queryKeys.workspaceResourceDerivatives(
      endpoint,
      workspaceId,
      resource.id,
      resource.revision,
    ),
    queryFn: ({ signal }) => repository.resourceDerivatives(workspaceId, resource.id, signal),
    enabled: resource.state === 'ready',
    refetchInterval: (query) =>
      ['submitted', 'processing'].includes(query.state.data?.processor.state ?? '')
        ? ACTIVE_SESSION_POLL_MS
        : false,
  });
  const structure = useQuery({
    queryKey: queryKeys.workspaceResourceStructure(
      endpoint,
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
    queryKey: queryKeys.workspaceResourceDeliveries(endpoint, workspaceId),
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
            <TabsTrigger title="Read the original uploaded file" value="preview">
              Preview
            </TabsTrigger>
            <TabsTrigger
              title="Browse sections, tables, and other parsed document nodes"
              value="structure"
            >
              Structure
            </TabsTrigger>
            <TabsTrigger
              title="Inspect converted representations created from the original"
              value="derivatives"
            >
              Derivatives
            </TabsTrigger>
            <TabsTrigger title="Trace upload, processing, and model delivery" value="provenance">
              Provenance
            </TabsTrigger>
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
            loading={structure.isPending && derivatives.data?.processor.derivatives_available}
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
            processing={derivatives.data?.processor}
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
  loading,
  processing,
  resource,
  structure,
  workspaceId,
}: {
  error?: string;
  loading?: boolean;
  processing?: { state: string; progress: number; failure: Record<string, unknown> };
  resource: WorkspaceResource;
  structure?: Record<string, number>;
  workspaceId: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [selection, setSelection] = useState<{ collection: string; index: number }>();
  const firstCollection = Object.keys(structure ?? {})[0];
  const activeSelection =
    selection && selection.collection in (structure ?? {})
      ? selection
      : firstCollection
        ? { collection: firstCollection, index: 0 }
        : undefined;
  const node = useQuery({
    queryKey: queryKeys.workspaceResourceStructureNode(
      settings.endpoint,
      workspaceId,
      resource.id,
      activeSelection?.collection,
      activeSelection?.index,
    ),
    queryFn: ({ signal }) =>
      repository.resourceStructureNode(
        workspaceId,
        resource.id,
        activeSelection?.collection ?? '',
        activeSelection?.index ?? 0,
        signal,
      ),
    enabled: Boolean(activeSelection),
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
  if (loading) {
    return <ResourceLoading className="p-4" label="Loading document structure" />;
  }
  if (error) {
    return <ResourceUnavailable detail={error} label="Document structure unavailable" />;
  }
  if (!Object.keys(structure ?? {}).length) {
    return (
      <ResourceUnavailable
        detail="The processor completed without publishing any structured collections for this document."
        label="No document structure"
      />
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(9rem,0.32fr)_1fr]">
      <ScrollArea className="border-r p-2">
        <div className="mb-2 px-2">
          <p className="text-xs font-medium">Document structure</p>
          <p className="text-[10px] leading-4 text-muted-foreground">
            Parsed collections and their first available node.
          </p>
        </div>
        <div className="grid gap-1">
          {Object.entries(structure ?? {}).map(([collection, count]) => (
            <Button
              className="h-auto justify-between px-2 py-1.5"
              key={collection}
              onClick={() => setSelection({ collection, index: 0 })}
              variant={activeSelection?.collection === collection ? 'secondary' : 'ghost'}
            >
              <span className="truncate">{collection}</span>
              <Badge variant="outline">{count}</Badge>
            </Button>
          ))}
        </div>
      </ScrollArea>
      <ScrollArea className="p-3">
        {activeSelection && node.isPending ? (
          <ResourceLoading label="Loading structured node" />
        ) : null}
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
  processing,
  resource,
}: {
  deliveries: readonly ResourceDeliveryRecord[];
  error?: string;
  processing?: {
    processor: string;
    state: string;
    progress: number;
    created_at: string;
    updated_at: string;
  };
  resource: WorkspaceResource;
}) {
  const steps = 2 + (processing ? 1 : 0) + deliveries.length;
  return (
    <ScrollArea className="h-full p-3">
      <header className="mb-4">
        <h3 className="text-sm font-medium">Resource lineage</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          How the original upload became structured evidence and reached a model.
        </p>
      </header>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Timeline defaultValue={steps}>
        <TimelineItem step={1}>
          <TimelineIndicator />
          <TimelineSeparator />
          <TimelineDate dateTime={resource.created_at}>
            {formatTime(resource.created_at)}
          </TimelineDate>
          <TimelineHeader>
            <TimelineTitle className="flex items-center gap-2">
              <FileInputIcon aria-hidden="true" className="size-4 text-primary" />
              Uploaded
            </TimelineTitle>
          </TimelineHeader>
          <TimelineContent className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{resource.name}</span>
            <span>{formatBytes(resource.received_size)}</span>
          </TimelineContent>
        </TimelineItem>
        <TimelineItem step={2}>
          <TimelineIndicator />
          <TimelineSeparator />
          <TimelineDate dateTime={resource.completed_at || resource.updated_at}>
            {formatTime(resource.completed_at || resource.updated_at)}
          </TimelineDate>
          <TimelineHeader>
            <TimelineTitle className="flex items-center gap-2">
              <ScanSearchIcon aria-hidden="true" className="size-4 text-primary" />
              Verified and registered
            </TimelineTitle>
          </TimelineHeader>
          <TimelineContent className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Revision {resource.revision}</span>
            <span>{resource.detected_mime || 'Type unavailable'}</span>
          </TimelineContent>
        </TimelineItem>
        {processing ? (
          <TimelineItem step={3}>
            <TimelineIndicator />
            <TimelineSeparator />
            <TimelineDate dateTime={processing.updated_at}>
              {formatTime(processing.updated_at)}
            </TimelineDate>
            <TimelineHeader>
              <TimelineTitle>
                Structured by {processing.processor || 'document processor'}
              </TimelineTitle>
            </TimelineHeader>
            <TimelineContent>
              {processing.state === 'processing'
                ? `Processing ${Math.round(processing.progress)}%`
                : processing.state}
            </TimelineContent>
          </TimelineItem>
        ) : null}
        {deliveries.map((delivery, index) => (
          <TimelineItem key={delivery.id} step={3 + (processing ? 1 : 0) + index}>
            <TimelineIndicator />
            <TimelineSeparator />
            <TimelineDate dateTime={delivery.delivered_at}>
              {formatTime(delivery.delivered_at)}
            </TimelineDate>
            <TimelineHeader>
              <TimelineTitle className="flex items-center gap-2">
                <SendIcon aria-hidden="true" className="size-4 text-primary" />
                Delivered to model
              </TimelineTitle>
            </TimelineHeader>
            <TimelineContent>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{delivery.model_id}</span>
                <span>{delivery.representation}</span>
              </p>
              {delivery.reason ? <p className="mt-1">{delivery.reason}</p> : null}
              <details className="mt-2 text-[10px]">
                <summary className="w-fit cursor-pointer font-medium">Internal evidence</summary>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                  <dt>Provider</dt>
                  <dd>{delivery.provider_id}</dd>
                  <dt>Evidence</dt>
                  <dd>{delivery.evidence_source || 'Unavailable'}</dd>
                </dl>
              </details>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>
      {!deliveries.length && !error ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No model delivery has been recorded yet.
        </p>
      ) : null}
      <details className="mt-4 rounded-lg border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Integrity and custody</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">SHA-256</dt>
          <dd className="break-all font-mono">{resource.sha256 || 'Unavailable'}</dd>
          <dt className="text-muted-foreground">Detection</dt>
          <dd>{resource.detection_source || 'Unavailable'}</dd>
        </dl>
      </details>
    </ScrollArea>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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
