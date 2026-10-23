import type { Artifact } from '@clio/core/v3';
import { LayoutDashboardIcon, ListTreeIcon } from 'lucide-react';
import { isDashboardArtifact } from '@/lib/dashboard-presentation';
import { artifactCategory } from '@/lib/artifact-categories';
import { FileTypeIcon } from './file-type-icon';

/** Keep output category icons consistent with file icons in the canvas and explorer. */
export function ArtifactTypeIcon({
  artifact,
  className,
  badge,
}: {
  artifact: Artifact;
  className?: string;
  badge?: boolean;
}) {
  return isDashboardArtifact(artifact) ? (
    <LayoutDashboardIcon
      aria-hidden="true"
      className={`text-indigo-600 dark:text-indigo-400 ${className ?? ''}`}
    />
  ) : artifactCategory(artifact) === 'plans' ? (
    <ListTreeIcon
      aria-hidden="true"
      className={`text-teal-600 dark:text-teal-400 ${className ?? ''}`}
    />
  ) : (
    <FileTypeIcon
      name={artifact.name}
      mediaType={artifact.media_type}
      className={className}
      badge={badge}
    />
  );
}
