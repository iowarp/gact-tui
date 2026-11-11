import type { Artifact } from '@clio/core/v3';
import { LayoutDashboardIcon, ListTreeIcon, RadioIcon } from 'lucide-react';
import { isDashboardArtifact } from '@/lib/dashboard-presentation';
import { artifactCategory } from '@/lib/artifact-categories';
import { FileTypeIcon } from './file-type-icon';
import { isStreamArtifact } from './stream-artifact';

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
  // A stream has no file, so no file type to show: it gets its own live-feed icon.
  return isStreamArtifact(artifact) ? (
    <RadioIcon aria-hidden="true" className={`text-category-5 ${className ?? ''}`} />
  ) : isDashboardArtifact(artifact) ? (
    <LayoutDashboardIcon aria-hidden="true" className={`text-category-8 ${className ?? ''}`} />
  ) : artifactCategory(artifact) === 'plans' ? (
    <ListTreeIcon aria-hidden="true" className={`text-category-10 ${className ?? ''}`} />
  ) : (
    <FileTypeIcon
      name={artifact.name}
      mediaType={artifact.media_type}
      className={className}
      badge={badge}
    />
  );
}
