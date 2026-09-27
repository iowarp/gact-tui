import { isClioReference } from '@clio/core/v3';
import { ExternalLinkIcon, ImageOffIcon } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ExternalLink } from '@/components/ui/external-link';
import { Spinner } from '@/components/ui/spinner';
import { referenceFailure, type A2uiReferenceFailure } from '@/lib/a2ui/reference-failure';
import { useA2uiReference } from '@/lib/a2ui/use-a2ui-reference';
import { useA2uiUrlGuard } from '@/lib/a2ui/url-guard';

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

function ReferenceMedia({ kind, label, objectFit, url }: Omit<A2uiMediaProps, 'componentId'>) {
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
      <img
        alt={label ?? ''}
        className="max-w-full rounded-md"
        onError={onError}
        src={state.objectUrl}
        style={{ objectFit }}
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
export function A2uiMedia({ componentId, kind, label, objectFit, url }: A2uiMediaProps) {
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
  return <ReferenceMedia kind={kind} label={label} objectFit={objectFit} url={url} />;
}
