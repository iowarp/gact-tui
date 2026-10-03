import type { Artifact } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useContext, type ComponentProps } from 'react';
import type { ExtraProps } from 'streamdown';
import { useObjectUrl } from '@/hooks/use-object-url';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { IMMUTABLE_QUERY, INLINE_PREVIEW_MAX_BYTES } from '@/lib/runtime-limits';
import { PresentationNavigation } from './presentation-navigation';
import { ARTIFACT_IMAGE_PATH } from '@/lib/remark-artifact-images';

/** Only registered image artifacts can reach CLIO's authenticated byte transport. */
export function ArtifactMarkdownImage({ src, alt, node: _node, ...props }: ComponentProps<'img'> & ExtraProps) {
  const navigation = useContext(PresentationNavigation);
  if (typeof src !== 'string' || !src.startsWith(ARTIFACT_IMAGE_PATH)) {
    return <img {...props} src={src} alt={alt} />;
  }
  let uri: string;
  try {
    uri = decodeURIComponent(src.slice(ARTIFACT_IMAGE_PATH.length));
  } catch {
    return <span>Saved image reference unavailable: {alt}</span>;
  }
  const artifact = Object.values(navigation?.artifacts ?? {}).find(
    (candidate) => candidate.uri === uri || `artifact://${candidate.id}` === uri,
  );
  if (!artifact || !artifact.media_type.startsWith('image/')) {
    return <span>Saved image reference unavailable: {alt}</span>;
  }
  return <RegisteredImage artifact={artifact} alt={alt || artifact.name} />;
}

function RegisteredImage({ artifact, alt }: { artifact: Artifact; alt: string }) {
  const navigation = useContext(PresentationNavigation);
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const withinBudget = artifact.size !== undefined && artifact.size <= INLINE_PREVIEW_MAX_BYTES;
  const bytes = useQuery({
    queryKey: queryKeys.key('artifact-card-image', settings.endpoint, artifact.id, artifact.fetch_path),
    queryFn: ({ signal }) => repository.readArtifactBytesFor(artifact, signal),
    enabled: withinBudget,
    ...IMMUTABLE_QUERY,
  });
  const url = useObjectUrl(bytes.data, artifact.media_type);
  return (
    <span className="block" data-slot="artifact-markdown-image">
      <button
        aria-label={`Open ${artifact.name}`}
        className="block w-full rounded-md border bg-muted/20 p-2 text-left focus-visible:outline-2 focus-visible:outline-primary"
        disabled={!navigation?.onOpenArtifact}
        onClick={() => navigation?.onOpenArtifact?.(artifact)}
        type="button"
      >
        {url ? <img alt={alt} className="max-h-80 w-full object-contain" src={url} /> : (
          <span>{bytes.isError ? 'Saved image preview unavailable' : withinBudget ? 'Loading image preview…' : `Open ${artifact.name} to view the full image`}</span>
        )}
      </button>
    </span>
  );
}
