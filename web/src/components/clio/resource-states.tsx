import { BoxIcon, DownloadIcon } from 'lucide-react';
import { useContext } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes } from '@/lib/format';
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

/** Couldn't read it: the reason underneath and a Retry. */
export function ViewerReadError({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <StateView
      action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
      detail={error}
      kind="error"
      size="viewer"
      title="Couldn't read it"
    />
  );
}

/** What a browser tab shows rather than downloads. */
const BROWSER_READABLE = /^(?:application\/pdf|image\/|text\/|video\/|audio\/)/u;

/**
 * Too large and No preview's ways out, as icons. Open appears only where it shows the
 * file (the system app on the desktop, a browser tab for a format the browser reads).
 * Under a frame bar, Open ▾ holds the file's one download, so the body adds none;
 * elsewhere the body's Download is it.
 */
function useViewerFileActions(source: FileViewerSource): {
  action?: StateAction;
  secondaryAction?: StateAction;
} {
  const framed = useContext(FileViewerFactsRegistry) !== undefined;
  const take = useOpenTake(source, NO_FORMATS);
  const identity = fileViewerIdentity(source);
  const row = take.rows.find((candidate) => candidate.id === 'download');
  const disabled = !identity.available || take.busy;
  const open: StateAction | undefined =
    inTauri() || BROWSER_READABLE.test(identity.mediaType)
      ? { label: take.face.label, icon: take.face.icon, disabled, onClick: take.face.run }
      : undefined;
  if (framed) return { action: open };
  const download: StateAction = {
    label: 'Download',
    icon: <DownloadIcon />,
    disabled: disabled || Boolean(row?.reason),
    onClick: () => row?.onSelect?.(),
  };
  return open ? { action: download, secondaryAction: open } : { action: download };
}

const NO_FORMATS: never[] = [];

/** Too large: the size, in words, with Open and Download; nothing is read into the page. */
export function ViewerTooLarge({ source, size }: { source: FileViewerSource; size?: number }) {
  const identity = fileViewerIdentity(source);
  const bytes = size ?? identity.size;
  const actions = useViewerFileActions(source);
  return (
    <StateView
      {...actions}
      detail={
        bytes === undefined ? 'No verified size, so it was not loaded' : 'Too large to preview'
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
      title={bytes === undefined ? 'Size unknown' : formatBytes(bytes)}
    />
  );
}

/** No preview: the format (also a frame fact), with Open and Download. */
export function ViewerNoPreview({ source }: { source: FileViewerSource }) {
  const identity = fileViewerIdentity(source);
  const extension = fileExtension(identity.name);
  useFileViewerFacts(extension ? [extension] : undefined);
  const actions = useViewerFileActions(source);
  return (
    <StateView
      {...actions}
      detail="No preview for this format"
      kind="no-preview"
      size="viewer"
      title={extension || identity.mediaType || 'Unknown format'}
    />
  );
}

/**
 * Changed elsewhere: the file changed after it was opened (a working-copy
 * conflict). Keep current takes the other version; Use mine keeps the edits.
 */
export function ChangedElsewhereState({
  onKeepCurrent,
  onUseMine,
  detail,
  className,
}: {
  onKeepCurrent: () => void;
  onUseMine: () => void;
  detail?: string;
  className?: string;
}) {
  return (
    <StateView
      action={{ label: 'Use mine', onClick: onUseMine }}
      className={className}
      detail={detail}
      kind="changed-elsewhere"
      secondaryAction={{ label: 'Keep current', onClick: onKeepCurrent }}
      size="viewer"
      title="Changed since you opened it"
    />
  );
}

function fileExtension(name: string): string {
  const match = /\.[^./\\]+$/u.exec(name);
  return match ? match[0].toLowerCase() : '';
}
