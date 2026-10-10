import type { Artifact } from '@clio/core/v3';

/** Recognize saved dashboards by their producer identity, including older filenames. */
export function isDashboardArtifact(artifact: Artifact): boolean {
  return artifact.producer?.['designation'] === 'dashboard-report';
}

/** Display the report's authored title while retaining its real filename for custody. */
export function artifactDisplayName(artifact: Artifact): string {
  const title = artifact.producer?.['title'];
  return isDashboardArtifact(artifact) && typeof title === 'string' && title.trim()
    ? title.trim()
    : artifact.name;
}
