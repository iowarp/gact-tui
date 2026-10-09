import type { Artifact } from '@clio/core/v3';
import { ListTreeIcon } from 'lucide-react';
import { artifactCategory } from '@/lib/artifact-categories';
import { FileTypeIcon } from './file-type-icon';

/** Keep output category icons consistent with file icons in the canvas and explorer. */
export function ArtifactTypeIcon({
  artifact,
  className,
}: {
  artifact: Artifact;
  className?: string;
}) {
  return artifactCategory(artifact) === 'plans' ? (
    <ListTreeIcon aria-hidden="true" className={className} />
  ) : (
    <FileTypeIcon name={artifact.name} mediaType={artifact.media_type} className={className} />
  );
}
