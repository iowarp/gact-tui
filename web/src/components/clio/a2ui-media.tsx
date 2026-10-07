import { isClioReference } from '@clio/core/v3';
import { ExternalLinkIcon, ImageOffIcon } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ExternalLink } from '@/components/ui/external-link';
import { Spinner } from '@/components/ui/spinner';
import { referenceFailure, type A2uiReferenceFailure } from '@/lib/a2ui/reference-failure';
import { useA2uiReference, type A2uiReferenceState } from '@/lib/a2ui/use-a2ui-reference';
import { useA2uiUrlGuard } from '@/lib/a2ui/url-guard';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import { downloadUrl, filenameStemFromTitle } from './surface-export';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import { SurfaceToolbar, type SurfaceCapabilities } from './surface-toolbar';

export type A2uiMediaKind = 'image' | 'video' | 'audio' | 'file';

const KIND_NOUN: Record<A2uiMediaKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  file: 'File',
};

export interface A2uiMediaProps {
  kind: Exclude<A2uiMediaKind, 'file'>;
  /** The component id, for the URL-guard's `VALIDATION_FAILED` pointer. */
  componentId: string;
  /** The resolved (post-binding) `url` property. */
  url: string;
  /** Accessible name (Image `description`, AudioPlayer `description`, Video label). */
  label?: string;
  objectFit?: CSSProperties['objectFit'];
  variant?: 'icon' | 'avatar' | 'smallFeature' | 'mediumFeature' | 'largeFeature' | 'header';
}

/** Preserve the catalog's image sizing without letting a figure fill the transcript. */
function imageVariantStyle(variant: A2uiMediaProps['variant']): CSSProperties {
  switch (variant) {
    case 'icon':
      return { width: 24, height: 24 };
    case 'avatar':
      return { width: 40, height: 40, borderRadius: '50%' };
    case 'smallFeature':
      return { maxWidth: 100, maxHeight: 100 };
    case 'header':
      return { width: '100%', height: 200 };
    default:
      return { maxWidth: '100%', maxHeight: 'min(400px, 45vh)' };
  }
}

/** A media component's typed failure, in place of the element (never a broken image). */
export function A2uiMediaNotice({
  failure,
  kind,
  title,
}: {
  failure: A2uiReferenceFailure;
  kind: A2uiMediaKind;
  title?: string;
}) {
  return (
    <Alert data-reason={failure.code} variant="destructive">
      <ImageOffIcon aria-hidden="true" />
      <AlertTitle>{title ?? `${KIND_NOUN[kind]} unavailable`}</AlertTitle>
      <AlertDescription>{failure.message}</AlertDescription>
    </Alert>
  );
}

/**
 * External `https:` media is never fetched automatically (A2 decision): a
 * surface is model-authored, so loading an arbitrary remote URL would let the
 * payload make the viewer's machine contact any host (tracking, data in the
 * query string), and the desktop CSP blocks it anyway. The component says so
 * and offers an explicit, user-initiated open in the system browser instead.
 */
export function A2uiExternalMedia({ kind, url }: { kind: A2uiMediaKind; url: string }) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // A malformed URL never reaches here (the guard rejects it); keep the raw text.
  }
  return (
    <Alert data-reason="external_media_not_loaded">
      <ExternalLinkIcon aria-hidden="true" />
      <AlertTitle>{`${KIND_NOUN[kind]} from ${host} not loaded`}</AlertTitle>
      <AlertDescription>
        <p>Content from other sites is not loaded automatically in agent views.</p>
        <ExternalLink className="w-fit underline underline-offset-3" href={url}>
          {`Open ${host} in your browser`}
        </ExternalLink>
      </AlertDescription>
    </Alert>
  );
}

/**
 * `clio.image.v1`'s G0 row: "download the original; full screen; Reference
 * this." (Video/Audio are not in the G0 table and keep their bare elements
 * below.) The original bytes are already resolved to `state.objectUrl` by
 * `useA2uiReference` — downloading is just pointing an anchor at that same
 * `blob:` URL (`downloadUrl`), no second fetch.
 */
/** The image's download filename: the resolved name, slugified, kept as-is if it already carries an extension, else suffixed from the media type. */
function imageDownloadFilename(name: string, mediaType: string | undefined): string {
  const slug = filenameStemFromTitle(name);
  if (/\.[a-z0-9]{1,5}$/iu.test(slug)) return slug;
  const extension = (mediaType || 'image/png').split('/').at(-1) || 'png';
  return `${slug}.${extension}`;
}

function ReferenceImage({
  componentId,
  sourceRef,
  label,
  objectFit,
  onError,
  state,
  variant,
}: {
  componentId: string;
  sourceRef: string;
  label: string | undefined;
  objectFit: CSSProperties['objectFit'];
  onError: () => void;
  state: A2uiReferenceState;
  variant: A2uiMediaProps['variant'];
}) {
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  const name = state.resolution?.name || label || 'image';
  const objectUrl = state.objectUrl;

  const buildReference = (): DataZoneReference =>
    buildZoneReference({
      componentLabel: label || 'Image',
      datasetLabel: name,
      filters: [],
      previewColumns: [],
      previewRows: [],
      query: { name, sourceRef, mediaType: state.resolution?.media_type },
      zoneDescription: 'the whole image',
    });

  const capabilities: SurfaceCapabilities = {
    imageAttention: true,
    captureComponentId: componentId,
    buildReference,
    exportFormats: [
      {
        id: 'original',
        label: 'Original image',
        run: () => {
          if (objectUrl)
            downloadUrl(objectUrl, imageDownloadFilename(name, state.resolution?.media_type));
        },
      },
    ],
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
  };

  const image = (
    <img
      alt={label ?? ''}
      className={
        fullscreen ? 'block h-full min-h-0 w-full min-w-0 object-contain' : 'max-w-full rounded-md'
      }
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onError={onError}
      src={state.objectUrl}
      style={fullscreen ? { objectFit: 'contain' } : { ...imageVariantStyle(variant), objectFit }}
    />
  );
  return (
    <div className="group relative" data-slot="a2ui-media-image">
      <SurfaceToolbar capabilities={capabilities} />
      <SurfaceFullScreenHost
        fullscreen={fullscreen}
        headerExtra={<SurfaceToolbar capabilities={capabilities} floating={false} />}
        layout="media"
        onOpenChange={setFullscreen}
        title={name}
      >
        {fullscreen ? (
          image
        ) : (
          <button
            aria-label={`Enlarge ${name}`}
            type="button"
            className="block max-w-full cursor-zoom-in rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary"
            onClick={() => setFullscreen(true)}
          >
            {image}
          </button>
        )}
      </SurfaceFullScreenHost>
    </div>
  );
}

function ReferenceMedia({ componentId, kind, label, objectFit, url, variant }: A2uiMediaProps) {
  const state = useA2uiReference(url);
  const [undisplayable, setUndisplayable] = useState<string>();
  const failure =
    state.failure ??
    (undisplayable && undisplayable === state.objectUrl
      ? referenceFailure('undisplayable')
      : undefined);
  if (failure) return <A2uiMediaNotice failure={failure} kind={kind} />;
  if (state.pending || !state.objectUrl) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
        data-slot="a2ui-media-loading"
      >
        <Spinner className="size-3.5" />
        <span>{`Loading ${KIND_NOUN[kind].toLowerCase()}…`}</span>
      </div>
    );
  }
  const onError = () => setUndisplayable(state.objectUrl);
  if (kind === 'image') {
    return (
      <ReferenceImage
        componentId={componentId}
        sourceRef={url}
        label={label}
        objectFit={objectFit}
        onError={onError}
        state={state}
        variant={variant}
      />
    );
  }
  if (kind === 'video') {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption -- protocol carries no caption track
      <video
        aria-label={label}
        className="w-full rounded-md"
        controls
        onError={onError}
        src={state.objectUrl}
      />
    );
  }
  return (
    <audio aria-label={label} className="w-full" controls onError={onError} src={state.objectUrl} />
  );
}

/**
 * The ONE renderer behind the kernel `Image` / `Video` / `AudioPlayer`
 * components. The URL is guarded first (owner decision 11's allowlist); a CLIO
 * reference then resolves through the service and renders from a `blob:` URL
 * read with the connection's bearer (works for a local or remote CLIO); an
 * external `https:` URL is shown as an explicit link, never auto-loaded.
 */
export function A2uiMedia({ componentId, kind, label, objectFit, url, variant }: A2uiMediaProps) {
  const guard = useA2uiUrlGuard(componentId, 'url', url);
  if (!guard.ok) {
    return (
      <A2uiMediaNotice
        failure={{ code: 'url_blocked', message: guard.message }}
        kind={kind}
        title={`${KIND_NOUN[kind]} blocked`}
      />
    );
  }
  if (!isClioReference(url)) return <A2uiExternalMedia kind={kind} url={url} />;
  return (
    <ReferenceMedia
      componentId={componentId}
      kind={kind}
      label={label}
      objectFit={objectFit}
      url={url}
      variant={variant}
    />
  );
}
