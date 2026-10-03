import { useQuery } from '@tanstack/react-query';
import { PanelsTopLeftIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { artifactDetailVersionEntity } from '@/lib/session-artifacts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
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
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground" role="status">
        <Spinner aria-hidden="true" role="presentation" className="size-3.5" /> Loading saved file…
      </div>
    );
  }
  const version = detail.data?.artifact.versions.find((item) => item.artifact_id === artifactId);
  if (detail.data && version) {
    return (
      <ClioArtifactCard
        artifact={artifactDetailVersionEntity(detail.data, artifactId, sessionId)}
        onOpen={onOpen}
        preview={false}
      />
    );
  }
  return (
    <Alert>
      <PanelsTopLeftIcon aria-hidden="true" />
      <AlertTitle>Artifact unavailable</AlertTitle>
      <AlertDescription>
        {detail.error?.message ?? 'The saved file has no readable version.'}
      </AlertDescription>
    </Alert>
  );
}
