import { queryKeys } from '@/lib/query-keys';
import type { Artifact } from '@clio/core/v3';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { ArtifactLineageGraph } from './artifact-lineage-graph';
import { ClioStatus } from './status';

export function ArtifactProvenance({
  artifact,
  view = 'versions',
  onOpenArtifact,
}: {
  artifact: Artifact;
  view?: 'versions' | 'lineage';
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  const repository = useRepository();
  const detail = useQuery({
    queryKey: queryKeys.key('artifact-detail', artifact.id),
    queryFn: ({ signal }) => repository.artifactDetail(artifact.id, signal),
    enabled: view === 'versions',
  });
  const lineage = useQuery({
    queryKey: queryKeys.key('artifact-lineage', artifact.id, 'both', 5),
    queryFn: ({ signal }) =>
      repository.artifactLineage(artifact.id, { direction: 'both', depth: 5 }, signal),
    enabled: view === 'lineage',
  });
  const exportBundle = useMutation({
    mutationFn: () => repository.exportArtifact(artifact.id),
    onSuccess: (bytes) => downloadBundle(bytes, artifact.name),
  });

  if (view === 'lineage') {
    if (lineage.data) {
      return (
        <section aria-label={`Lineage for ${artifact.name}`} className="grid gap-3">
          {lineage.data.truncated ? (
            <ClioStatus
              detail={`The service bounded this graph at ${lineage.data.truncated.reason}.`}
              label="Partial lineage"
              value="degraded"
            />
          ) : null}
          <ArtifactLineageGraph
            artifact={artifact}
            lineage={lineage.data}
            onOpenArtifact={onOpenArtifact}
          />
        </section>
      );
    }
    if (lineage.error) {
      return (
        <Unavailable
          detail={lineage.error.message}
          label="Lineage unavailable"
          message="The service could not resolve relationships for this result. Available custody details remain readable."
        />
      );
    }
    return <p className="text-sm text-muted-foreground">Loading lineage…</p>;
  }

  return (
    <section aria-label={`Versions for ${artifact.name}`} className="grid gap-3">
      <div className="flex justify-end">
        <Button
          disabled={exportBundle.isPending}
          onClick={() => exportBundle.mutate()}
          size="sm"
          variant="outline"
        >
          <DownloadIcon aria-hidden="true" />
          {exportBundle.isPending ? 'Packaging…' : 'Export with evidence'}
        </Button>
      </div>
      {exportBundle.error ? (
        <Unavailable
          detail={exportBundle.error.message}
          label="Evidence export unavailable"
          message="The service could not package this result. Nothing was downloaded."
        />
      ) : null}
      {detail.data ? (
        <Timeline defaultValue={detail.data.artifact.versions.length}>
          {[...detail.data.artifact.versions]
            .sort((left, right) => left.version - right.version)
            .map((version, index) => (
              <TimelineItem key={version.artifact_id} step={index + 1}>
                <TimelineIndicator />
                <TimelineSeparator />
                <TimelineDate dateTime={version.created_at}>
                  {formatObservedTime(version.created_at)}
                </TimelineDate>
                <TimelineHeader className="flex flex-wrap items-center gap-2">
                  <TimelineTitle>Version {version.version}</TimelineTitle>
                  {version.version === detail.data.artifact.latest_version ? (
                    <ClioStatus label="Latest" value="healthy" />
                  ) : null}
                  {version.custody_gap ? <ClioStatus label="Custody gap" value="degraded" /> : null}
                </TimelineHeader>
                <TimelineContent className="flex flex-wrap gap-x-3 gap-y-1">
                  {[version.mechanism, version.custody, version.evidence_class, version.annotation]
                    .filter((field): field is string => Boolean(field))
                    .map((field, fieldIndex) => (
                      <span key={`${fieldIndex}:${field}`}>{field}</span>
                    ))}
                </TimelineContent>
              </TimelineItem>
            ))}
        </Timeline>
      ) : detail.error ? (
        <Unavailable
          detail={detail.error.message}
          label="Version history unavailable"
          message="History is not available for this result. Its saved content remains readable."
        />
      ) : (
        <p className="text-sm text-muted-foreground">Loading version history…</p>
      )}
    </section>
  );
}

function formatObservedTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function downloadBundle(bytes: Uint8Array, artifactName: string): void {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const url = URL.createObjectURL(new Blob([owned.buffer], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(artifactName)}.crate.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/giu, '-').replace(/^-|-$/gu, '') || 'artifact';
}

function Unavailable({
  label,
  message,
  detail,
}: {
  label: string;
  message: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{message}</p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer select-none rounded-sm font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          Technical details
        </summary>
        <code className="mt-2 block break-all rounded-md bg-muted/60 p-2 font-mono text-[10px]">
          {detail}
        </code>
      </details>
    </div>
  );
}
