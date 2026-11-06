import type { Artifact } from '@clio/core/v3';
import { isScientificDocument, paperTitle } from './scientific-document';

/** Recognize saved dashboards by their producer identity, including older filenames. */
export function isDashboardArtifact(artifact: Artifact): boolean {
  return artifact.producer?.['designation'] === 'dashboard-report';
}

/**
 * Display an authored title while retaining the real filename for custody: a dashboard's
 * report title, or a paper's `\title`.
 */
export function artifactDisplayName(artifact: Artifact): string {
  if (isScientificDocument(artifact)) return paperTitle(artifact);
  const title = artifact.producer?.['title'];
  return isDashboardArtifact(artifact) && typeof title === 'string' && title.trim()
    ? title.trim()
    : artifact.name;
}
