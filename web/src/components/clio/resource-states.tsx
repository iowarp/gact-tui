import { brand } from '@brand';
import { ArrowUpToLineIcon, BoxIcon, CodeIcon, DownloadIcon, EyeIcon } from 'lucide-react';
import { useContext, useMemo, useState } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes } from '@/lib/format';
import { INLINE_PREVIEW_MAX_BYTES, TEXT_WINDOW_CHUNK_BYTES } from '@/lib/runtime-limits';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { FileViewerFactsRegistry, useFileViewerFacts } from './file-viewer-facts';
import { fileViewerIdentity, type FileViewerSource } from './file-viewer-source';
import { useOpenTake } from './file-viewer-take-hooks';
import { FileTypeIcon } from './file-type-icon';
import { LoadingFeedback } from './loading-feedback';
import { StateView, type StateAction } from './primitives/state-view';

/**
 * The loading state for a region that waits on data (gact-tui#366): the shared
 * `LoadingFeedback` status, so the wait is announced and its label is visible,
 * never shown only as a pulse. `block` adds skeleton rows that keep the region's
 * shape; `line` is the compact spinner and label for inline spots (a tree row,
 * a section header). Worded status inside a control, such as a select placeholder
 * or a busy button, stays text. Under a file viewer's frame bar, `block` is the
 * frame's quiet loading body instead.
 */
export function ResourceLoading({
  label,
  className,
  variant = 'block',
}: {
  label: string;
  className?: string;
  variant?: 'block' | 'line';
}) {
  const framed = useContext(FileViewerFactsRegistry) !== undefined;
  if (variant === 'line') return <LoadingFeedback className={className} label={label} />;
  if (framed) return <StateView className={className} kind="loading" size="viewer" title={label} />;
  return (
    <LoadingFeedback className={className} label={label} variant="skeleton">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-8 w-11/12" />
      </div>
    </LoadingFeedback>
  );
}

/**
 * Content that cannot be shown. Under a file viewer's frame bar it is the
 * frame's compact state body; elsewhere a bordered empty card.
 */
export function ResourceUnavailable({
  label,
  detail,
  icon: Icon = BoxIcon,
  kind = 'unavailable',
  onRetry,
}: {
  label: string;
  detail?: string;
  icon?: typeof BoxIcon;
  /** How a framed viewer body presents it; `error` offers Retry with `onRetry`. */
  kind?: 'unavailable' | 'error' | 'no-preview' | 'too-large';
  onRetry?: () => void;
}) {
  const framed = useContext(FileViewerFactsRegistry) !== undefined;
  if (framed)
    return (
      <StateView
        action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
        detail={detail}
        icon={Icon === BoxIcon ? undefined : Icon}
        kind={kind}
        size="viewer"
        title={label}
      />
    );
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{label}</EmptyTitle>
        {detail ? <EmptyDescription>{detail}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}

/**
 * Couldn't read it: the server's reason, where, that nothing changed, and a Retry
 * (workbench-lineage 04). A bare transport status line is never the reason.
 */
export function ViewerReadError({
  error,
  where,
  onRetry,
}: {
  error?: string;
  /** The file or folder the read failed on. */
  where?: string;
  onRetry?: () => void;
}) {
  return (
    <StateView
      action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
      detail={error ? readErrorDetail(error, where) : undefined}
      kind="error"
      size="viewer"
      title="Couldn't read it"
    />
  );
}

const RAW_HTTP = /^request failed with (\d{3})\b/iu;

/** The reason a read failed, in the server's words when it gave any. */
function readErrorDetail(error: string, where?: string): string {
  const trimmed = error.trim();
  // A sentence the app already wrote stands as it is.
  if (/^\p{Lu}.{30,}[.!]$/u.test(trimmed) && !RAW_HTTP.test(trimmed))
    return `${trimmed} Nothing in the file changed.`;
  const message = trimmed.replace(/[.\s]+$/u, '');
  const status = RAW_HTTP.exec(message)?.[1];
  const on = where ? ` on ${where}` : '';
  // An OS error's own words ("[Errno 13] Permission denied: '/abs/path'") without the path.
  const said = /\[Errno \d+\]\s*([^:]+)/u.exec(message)?.[1]?.trim().toLowerCase() ?? message;
  const reason = !status
    ? `The file server said "${said}"${on}.`
    : status === '404'
      ? `The file server found nothing${on}. It may have been moved or deleted.`
      : status === '401' || status === '403'
        ? `The file server said "permission denied"${on}.`
        : status.startsWith('5')
          ? `The file server failed while reading it${on} and gave no reason.`
          : `The file server refused the read${on} (${status}).`;
  return `${reason} Nothing in the file changed.`;
}

/** What a browser tab shows rather than downloads. */
const BROWSER_READABLE = /^(?:application\/pdf|image\/|text\/|video\/|audio\/)/u;

/**
 * Too large and No preview's ways out, as named icons (workbench-lineage 04): the
 * viewer's own way in (Show it anyway, or Source), Open, then Download of the original
 * bytes. Open appears only where it shows the file (the system app on the desktop, a
 * browser tab for a format the browser reads).
 */
function useViewerFileActions(
  source: FileViewerSource,
  first?: StateAction,
  second?: StateAction,
): StateAction[] {
  const take = useOpenTake(source, NO_FORMATS);
  const identity = fileViewerIdentity(source);
  const row = take.rows.find((candidate) => candidate.id === 'download');
  const disabled = !identity.available || take.busy;
  const open: StateAction | undefined =
    inTauri() || BROWSER_READABLE.test(identity.mediaType)
      ? { label: take.face.label, icon: take.face.icon, disabled, onClick: take.face.run }
      : undefined;
  const download: StateAction = {
    label: 'Download',
    icon: <DownloadIcon />,
    disabled: disabled || Boolean(row?.reason),
    onClick: () => row?.onSelect?.(),
  };
  return [
    first && { ...first, disabled: first.disabled || disabled },
    second && { ...second, disabled: second.disabled || disabled },
    open,
    download,
  ].filter((entry): entry is StateAction => Boolean(entry));
}

const NO_FORMATS: never[] = [];

/**
 * Too large: "3.4 GB is too large to show here", why, and the ways out. Nothing is
 * read into the page until Show it anyway is chosen.
 */
export function ViewerTooLarge({
  source,
  size,
  onPreview,
  onShowEnd,
}: {
  source: FileViewerSource;
  size?: number;
  /** Load the file into the viewer despite its size (a text file: its beginning). */
  onPreview?: () => void;
  /** A text file: show its last window. */
  onShowEnd?: () => void;
}) {
  const identity = fileViewerIdentity(source);
  const bytes = size ?? identity.size;
  useFileViewerFacts(bytes === undefined ? undefined : [formatBytes(bytes)]);
  const tail = `the last ${formatBytes(TEXT_WINDOW_CHUNK_BYTES)}`;
  const actions = useViewerFileActions(
    source,
    onShowEnd
      ? { label: `Show ${tail}`, icon: <EyeIcon />, onClick: onShowEnd, shortcut: 'show-end' }
      : onPreview
        ? { label: 'Show it anyway', icon: <EyeIcon />, onClick: onPreview }
        : undefined,
    onShowEnd && onPreview
      ? { label: 'Show the beginning', icon: <ArrowUpToLineIcon />, onClick: onPreview }
      : undefined,
  );
  // L shows the last part while focus is anywhere in this file's viewer (workbench-lineage 04).
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const region = useMemo(
    () => ({
      current: anchor?.closest('[data-slot="file-viewer"]') ?? anchor?.parentElement ?? null,
    }),
    [anchor],
  );
  const showEnd = actions.find((entry) => entry.shortcut === 'show-end');
  useShortcut('show-end', () => showEnd?.onClick(), {
    enabled: Boolean(showEnd && !showEnd.disabled),
    region,
  });
  const ways = onShowEnd ? `Show ${tail}, or open` : onPreview ? 'Show it anyway, or open' : 'Open';
  return (
    <StateView
      actions={actions}
      detail={
        bytes === undefined
          ? `Its size isn't verified, so it wasn't loaded. ${ways} it in another app. ${brand.agentName} can still read all of it.`
          : `Previews stop at ${formatBytes(INLINE_PREVIEW_MAX_BYTES)} to keep the panel quick. ${ways} it in another app. ${brand.agentName} can still read all of it.`
      }
      glyph={
        <FileTypeIcon
          className="size-[26px] text-faint"
          mediaType={identity.mediaType}
          name={identity.name}
        />
      }
      kind="too-large"
      size="viewer"
      title={
        bytes === undefined
          ? "It's too large to show here"
          : `${formatBytes(bytes)} is too large to show here`
      }
    >
      <span ref={setAnchor} hidden />
    </StateView>
  );
}

/**
 * No preview: "No viewer for .grib2 yet", what still works, and Source (show it as
 * text, when the viewer can), Open and Download.
 */
export function ViewerNoPreview({
  source,
  onShowText,
}: {
  source: FileViewerSource;
  /** Read the file as text in this viewer. */
  onShowText?: () => void;
}) {
  const identity = fileViewerIdentity(source);
  const extension = fileExtension(identity.name);
  useFileViewerFacts(extension ? [extension] : undefined);
  const actions = useViewerFileActions(
    source,
    onShowText ? { label: 'Show as text', icon: <CodeIcon />, onClick: onShowText } : undefined,
  );
  return (
    <StateView
      actions={actions}
      detail={`You can still @ it, comment on it, copy it, or open it in another app. ${brand.agentName} reads it with its own tools.${onShowText ? " If it's text, show it as text." : ''}`}
      kind="no-preview"
      size="viewer"
      title={
        extension
          ? `No viewer for ${extension} yet`
          : `No viewer for ${identity.mediaType || 'this format'} yet`
      }
    />
  );
}

function fileExtension(name: string): string {
  const match = /\.[^./\\]+$/u.exec(name);
  return match ? match[0].toLowerCase() : '';
}
