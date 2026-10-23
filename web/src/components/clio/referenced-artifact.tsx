import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { artifactDetailVersionEntity } from '@/lib/session-artifacts';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingFeedback, LoadingFailure } from './loading-feedback';
import { ClioArtifactCard, type ClioArtifactCardProps } from './artifact-card';

/** Fetch a just-announced reference while the session registry snapshot catches up. */
export function ReferencedArtifact({
  artifactId,
  sessionId,
  onOpen,
}: {
  artifactId: string;
  sessionId: string;
  onOpen?: ClioArtifactCardProps['onOpen'];
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const detail = useQuery({
    queryKey: queryKeys.key('artifact-detail', settings.endpoint, artifactId),
    queryFn: ({ signal }) => repository.artifactDetail(artifactId, signal),
  });
  if (detail.isPending) {
    return (
      <LoadingFeedback label="Loading saved file…" variant="skeleton">
        <Skeleton className="h-16 w-full rounded-lg" />
      </LoadingFeedback>
    );
  }
  const version = detail.data?.artifact.versions.find((item) => item.artifact_id === artifactId);
  if (detail.data && version) {
    return (
      <ClioArtifactCard
        artifact={artifactDetailVersionEntity(detail.data, artifactId, sessionId)}
        onOpen={onOpen}
        preview={false}
        presentation="response"
      />
    );
  }
  return (
    <LoadingFailure
      title="Artifact unavailable"
      detail={detail.error?.message ?? 'The saved file has no readable version.'}
      onRetry={() => void detail.refetch()}
    />
  );
}
