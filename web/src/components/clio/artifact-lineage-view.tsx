import { brand } from '@brand';
import { queryKeys } from '@/lib/query-keys';
import type { Artifact, ArtifactRecord } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { GitBranchIcon } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ResourceLoading, ResourceUnavailable } from './resource-states';
import { TechnicalDetails } from './technical-details';
import { t, ph } from '@lingui/core/macro';

// Dagre loads once a lineage graph is actually shown.
const ArtifactLineageGraph = lazy(() =>
  import('./artifact-lineage-graph').then((module) => ({ default: module.ArtifactLineageGraph })),
);

/** The tool call that produced a lineage node, as Activity lists it. */
export interface LineageActivity {
  callId: string;
  tool: string;
  sessionId?: string;
}

/**
 * A workspace file's Lineage: the history of the conversation's recorded artifact
 * at this path, when there is one; otherwise a plain account of why there is none.
 */
export function WorkspaceFileLineage({
  workspaceId,
  path,
  sessionId,
  onOpenArtifact,
  onOpenActivity,
}: {
  workspaceId: string;
  path: string;
  sessionId?: string;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenActivity?: (activity: LineageActivity) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const listing = useQuery({
    queryKey: queryKeys.key('session-artifacts', settings.endpoint, sessionId),
    queryFn: ({ signal }) => repository.sessionArtifacts(sessionId!, signal),
    enabled: Boolean(sessionId),
  });
  const artifact = useMemo(
    () =>
      listing.data
        ? recordedArtifact([...listing.data.artifacts, ...listing.data.used], workspaceId, path)
        : undefined,
    [listing.data, path, workspaceId],
  );
  if (artifact)
    return (
      <ArtifactLineageView
        artifact={artifact}
        onOpenActivity={onOpenActivity}
        onOpenArtifact={onOpenArtifact}
      />
    );
  if (sessionId && listing.isPending) return <ResourceLoading label={t`Loading lineage`} />;
  return (
    <ResourceUnavailable
      detail={t`${ph({ agentName: brand.agentName })} records where a file came from when a tool writes or reads it. Nothing in this conversation has yet.`}
      icon={GitBranchIcon}
      label={t`No recorded lineage yet`}
    />
  );
}

function recordedArtifact(
  records: readonly ArtifactRecord[],
  workspaceId: string,
  path: string,
): Artifact | undefined {
  const wanted = normalPath(path);
  const name = wanted.split('/').at(-1) ?? wanted;
  const local = records.filter((record) => record.workspace_id === workspaceId);
  const record =
    local.find((candidate) =>
      candidate.versions.some((version) => {
        const recorded = version.path ? normalPath(version.path) : '';
        return recorded === wanted || recorded.endsWith(`/${wanted}`);
      }),
    ) ?? local.find((candidate) => candidate.name === name);
  if (!record) return undefined;
  const head =
    record.versions.find((version) => version.artifact_id === record.head_artifact_id) ??
    record.versions.at(-1);
  return {
    id: record.head_artifact_id,
    session_id: record.producing_session_ids?.[0] ?? '',
    workspace_id: record.workspace_id,
    name: record.name,
    media_type: head?.media_type ?? '',
    uri: head?.uri ?? '',
    sha256: head?.sha256,
    size: head?.size_bytes,
    version: head?.version ?? record.latest_version,
  };
}

function normalPath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/^\.\//u, '');
}

/**
 * Lineage, the frame's third view: where this file came from and what used
 * it, with its earlier versions stacked behind it. Every node opens something.
 */
export function ArtifactLineageView({
  artifact,
  onOpenArtifact,
  onOpenActivity,
}: {
  artifact: Artifact;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenActivity?: (activity: LineageActivity) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const lineage = useQuery({
    queryKey: queryKeys.key('artifact-lineage', settings.endpoint, artifact.id, 'both', 5),
    queryFn: ({ signal }) =>
      repository.artifactLineage(artifact.id, { direction: 'both', depth: 5 }, signal),
  });
  // Versions are optional: without them the current node simply has no stack.
  const detail = useQuery({
    queryKey: queryKeys.key('artifact-detail', settings.endpoint, artifact.id),
    queryFn: ({ signal }) => repository.artifactDetail(artifact.id, signal),
  });
  return (
    <section
      aria-label={t`Lineage for ${ph({ name: artifact.name })}`}
      className="h-full min-h-0 min-w-0"
    >
      {lineage.data ? (
        <Suspense fallback={<ResourceLoading className="p-3" label={t`Loading lineage`} />}>
          <ArtifactLineageGraph
            artifact={artifact}
            lineage={lineage.data}
            versions={detail.data?.artifact.versions}
            current={detail.data?.resolved.version}
            onOpenArtifact={onOpenArtifact}
            onOpenActivity={onOpenActivity}
          />
        </Suspense>
      ) : lineage.error ? (
        <Empty className="h-full">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitBranchIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t`Couldn't read its lineage`}</EmptyTitle>
            <EmptyDescription>
              {t`The service didn't return where this file came from. The file is unchanged and Render and Source still show it.`}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => void lineage.refetch()}>
              {t`Retry`}
            </Button>
            <TechnicalDetails
              className="text-xs text-muted-foreground"
              summaryClassName="rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
              title={t`Technical details`}
            >
              <code className="mt-2 block break-all rounded-md bg-muted/60 p-2 font-mono text-[0.625rem]">
                {lineage.error.message}
              </code>
            </TechnicalDetails>
          </EmptyContent>
        </Empty>
      ) : (
        <ResourceLoading className="p-3" label={t`Loading lineage`} />
      )}
    </section>
  );
}
