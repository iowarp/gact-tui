import { TransportError } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { IMMUTABLE_QUERY } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { artifactIdFromDataUri } from './table-query-rows';

/**
 * The shared text-artifact client for every A2UI component whose content is
 * a referenced file's raw text (`clio.code.v1`, `clio.mermaid.v1`,
 * `clio.diff.v1`, `clio.workflow.v1`). One bounded read of the artifact's
 * bytes as text — the server's own fetch path, no `fetch_path` required since
 * a `dataUri` only ever names an artifact id.
 */
export interface ArtifactTextResult {
  text: string | undefined;
  loading: boolean;
  error: string;
}

/** Retry only what can change on its own: never a refused (4xx) read. */
function retryArtifactText(failures: number, error: Error): boolean {
  const status = error instanceof TransportError ? error.status : undefined;
  return failures < 2 && !(status !== undefined && status >= 400 && status < 500);
}

function artifactTextErrorMessage(error: Error): string {
  if (!(error instanceof TransportError)) return error.message;
  switch (error.code) {
    case 'not_found':
      return 'the artifact is not in this workspace.';
    case 'artifact_too_large':
      return 'the file is larger than this server will read inline.';
    default:
      return error.message;
  }
}

/** Reads a `dataUri` artifact's content as text, through one bounded query. */
export function useArtifactText(dataUri: string | undefined): ArtifactTextResult {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const artifactId = artifactIdFromDataUri(dataUri);
  const query = useQuery({
    enabled: Boolean(artifactId),
    queryKey: queryKeys.key('artifact-text', settings.endpoint, artifactId, 'a2ui'),
    queryFn: ({ signal }) => repository.readArtifactText(artifactId!, undefined, signal),
    retry: retryArtifactText,
    ...IMMUTABLE_QUERY,
  });

  if (!artifactId) {
    return { text: undefined, loading: false, error: 'the data source is not a registered artifact id.' };
  }
  if (query.isError) {
    return { text: undefined, loading: false, error: artifactTextErrorMessage(query.error) };
  }
  return { text: query.data, loading: query.isPending, error: '' };
}
