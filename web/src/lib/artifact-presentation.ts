import type { Artifact } from '@clio/core/v3';

/** Recognize a retained document preview from its recorded binding, never its filename. */
export function isDocumentPreview(artifact: Artifact): boolean {
  return (
    artifact.producer?.['designation'] === 'document-rendition' &&
    typeof artifact.producer['source_artifact_id'] === 'string' &&
    artifact.producer['source_artifact_id'].length > 0
  );
}

/** Keep deliverables in output surfaces; preview records remain available for lineage. */
export function artifactDeliverables(artifacts: readonly Artifact[]): Artifact[] {
  return artifacts.filter((artifact) => !isDocumentPreview(artifact));
}
