import type { Artifact } from '@clio/core/v3';

/** Whether an artifact is a stream (its content lives in clio-core, not in a file). */
export function isStreamArtifact(artifact: Pick<Artifact, 'producer'>): boolean {
  return artifact.producer?.['designation'] === 'stream';
}
