import { queryKeys } from '@/lib/query-keys';
import type { Artifact } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { GitBranchIcon } from 'lucide-react';
import { lazy, Suspense } from 'react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ResourceLoading } from './resource-states';
import { TechnicalDetails } from './technical-details';

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
    <section aria-label={`Lineage for ${artifact.name}`} className="h-full min-h-0 min-w-0">
      {lineage.data ? (
        <Suspense fallback={<ResourceLoading className="p-3" label="Loading lineage" />}>
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
            <EmptyTitle>Couldn't read its lineage</EmptyTitle>
            <EmptyDescription>
              The service didn't return where this file came from. The file is unchanged and Render
              and Source still show it.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <TechnicalDetails
              className="text-xs text-muted-foreground"
              summaryClassName="rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
              title="Technical details"
            >
              <code className="mt-2 block break-all rounded-md bg-muted/60 p-2 font-mono text-[10px]">
                {lineage.error.message}
              </code>
            </TechnicalDetails>
          </EmptyContent>
        </Empty>
      ) : (
        <ResourceLoading className="p-3" label="Loading lineage" />
      )}
    </section>
  );
}
