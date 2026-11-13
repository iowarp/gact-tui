import type { Artifact } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useContext, useEffect, useRef } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { PresentationNavigation } from './presentation-navigation';
import { t } from '@lingui/core/macro';

/**
 * A small inline preview of an image artifact a tool produced (a browser screenshot),
 * read through the artifact's own fetch path. Opening it is the link beside it.
 */
export function ArtifactImagePreview({
  artifact,
  mediaType,
  label,
  onOpen,
}: {
  artifact: Artifact;
  mediaType: string;
  label: string;
  onOpen?: () => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const image = useRef<HTMLImageElement>(null);
  const href = useContext(PresentationNavigation)?.artifactHref?.(artifact);
  const bytes = useQuery({
    queryKey: ['artifact-image-preview', settings.endpoint, artifact.id],
    queryFn: ({ signal }) => repository.readArtifactBytesFor(artifact, signal),
    staleTime: Infinity,
    enabled: !href,
  });

  useEffect(() => {
    if (!bytes.data || !image.current) return;
    const url = URL.createObjectURL(new Blob([bytes.data as BlobPart], { type: mediaType }));
    image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [bytes.data, mediaType]);

  if (href)
    return (
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={t`Open ${label}`}
        className="block max-w-full overflow-hidden rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring"
      >
        <img src={href} alt={label} className="max-h-48 max-w-full object-contain" />
      </button>
    );
  if (bytes.isError)
    return <p className="text-xs text-muted-foreground">{t`The image could not be loaded.`}</p>;
  if (!bytes.data) return <p className="text-xs text-muted-foreground">{t`Loading the image…`}</p>;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      aria-label={t`Open ${label}`}
      className="block max-w-full overflow-hidden rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring"
    >
      <img ref={image} alt={label} className="max-h-48 max-w-full object-contain" />
    </button>
  );
}
