import type { Artifact, ArtifactLineageNode } from '@clio/core/v3';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DownloadIcon, GitBranchIcon, HistoryIcon } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { ClioStatus } from './status';

export function ArtifactProvenance({ artifact }: { artifact: Artifact }) {
  const repository = useRepository();
  const detail = useQuery({
    queryKey: ['artifact-detail', artifact.id],
    queryFn: ({ signal }) => repository.artifactDetail(artifact.id, signal),
  });
  const lineage = useQuery({
    queryKey: ['artifact-lineage', artifact.id, 'both', 5],
    queryFn: ({ signal }) =>
      repository.artifactLineage(artifact.id, { direction: 'both', depth: 5 }, signal),
  });
  const exportBundle = useMutation({
    mutationFn: () => repository.exportArtifact(artifact.id),
    onSuccess: (bytes) => downloadBundle(bytes, artifact.name),
  });

  return (
    <section aria-labelledby={`artifact-history-${artifact.id}`} className="mt-4 border-t pt-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium" id={`artifact-history-${artifact.id}`}>
            History and provenance
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Immutable revisions, producing work, inputs, and evidence reported by the service.
          </p>
        </div>
        <Button
          disabled={exportBundle.isPending}
          onClick={() => exportBundle.mutate()}
          size="sm"
          variant="outline"
        >
          <DownloadIcon aria-hidden="true" />
          {exportBundle.isPending ? 'Packaging evidence…' : 'Export with evidence'}
        </Button>
      </div>
      {exportBundle.error ? (
        <p className="mb-3 text-xs text-destructive">{exportBundle.error.message}</p>
      ) : null}
      <Tabs defaultValue="versions">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="versions">
            <HistoryIcon aria-hidden="true" /> Versions
          </TabsTrigger>
          <TabsTrigger value="lineage">
            <GitBranchIcon aria-hidden="true" /> Lineage
          </TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="versions">
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
                      {version.custody_gap ? (
                        <ClioStatus label="Custody gap" value="degraded" />
                      ) : null}
                    </TimelineHeader>
                    <TimelineContent>
                      {version.mechanism}, {version.custody}, evidence {version.evidence_class}
                      {version.annotation ? `, ${version.annotation}` : ''}
                    </TimelineContent>
                  </TimelineItem>
                ))}
            </Timeline>
          ) : detail.error ? (
            <Unavailable detail={detail.error.message} label="Version history unavailable" />
          ) : (
            <p className="text-sm text-muted-foreground">Loading version history…</p>
          )}
        </TabsContent>
        <TabsContent className="pt-4" value="lineage">
          {lineage.data ? (
            <div className="grid gap-3">
              {lineage.data.truncated ? (
                <ClioStatus
                  detail={`The service bounded this graph at ${lineage.data.truncated.reason}.`}
                  label="Partial lineage"
                  value="degraded"
                />
              ) : (
                <ClioStatus label="Complete within depth 5" value="healthy" />
              )}
              <Timeline defaultValue={lineage.data.nodes.length}>
                {orderedLineageNodes(lineage.data.nodes, lineage.data.root).map((node, index) => (
                  <TimelineItem key={node.id} step={index + 1}>
                    <TimelineIndicator />
                    <TimelineSeparator />
                    <TimelineHeader>
                      <TimelineTitle>{lineageNodeTitle(node)}</TimelineTitle>
                    </TimelineHeader>
                    <TimelineContent>
                      {lineageNodeDetail(node)}
                      {lineageEdgesFor(node.id, lineage.data.edges)}
                    </TimelineContent>
                  </TimelineItem>
                ))}
              </Timeline>
            </div>
          ) : lineage.error ? (
            <Unavailable detail={lineage.error.message} label="Lineage unavailable" />
          ) : (
            <p className="text-sm text-muted-foreground">Loading lineage…</p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function orderedLineageNodes(nodes: ArtifactLineageNode[], root: string) {
  return [...nodes].sort((left, right) => Number(left.id === root) - Number(right.id === root));
}

function lineageNodeTitle(node: ArtifactLineageNode) {
  if (node.type === 'activity') return stringField(node, 'tool') || 'Recorded activity';
  const name = stringField(node, 'name') || 'Artifact';
  const version = numberField(node, 'version');
  return `${node.type === 'gap' ? 'Unattributed revision' : name}${version ? `, version ${version}` : ''}`;
}

function lineageNodeDetail(node: ArtifactLineageNode) {
  if (node.type === 'activity') {
    return [stringField(node, 'status'), stringField(node, 'kind'), stringField(node, 'replay')]
      .filter(Boolean)
      .join(', ');
  }
  return [stringField(node, 'kind'), stringField(node, 'mechanism')].filter(Boolean).join(', ');
}

function lineageEdgesFor(
  nodeId: string,
  edges: Array<{ from: string; to: string; type: string; evidence: string }>,
) {
  const related = edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
  if (!related.length) return '';
  return `, ${related.map((edge) => `${edge.type}${edge.evidence ? ` (${edge.evidence})` : ''}`).join(', ')}`;
}

function stringField(node: ArtifactLineageNode, key: string) {
  const value = node[key];
  return typeof value === 'string' ? value : '';
}

function numberField(node: ArtifactLineageNode, key: string) {
  const value = node[key];
  return typeof value === 'number' ? value : undefined;
}

function formatObservedTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function downloadBundle(bytes: Uint8Array, artifactName: string) {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const url = URL.createObjectURL(new Blob([owned.buffer], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(artifactName)}.crate.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9._-]+/giu, '-').replace(/^-|-$/gu, '') || 'artifact';
}

function Unavailable({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
