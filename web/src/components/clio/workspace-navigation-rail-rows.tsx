import { CircleAlertIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { NamedTooltip } from '@/components/clio/primitives/icon-button';
import { ListRow } from '@/components/clio/primitives/list-row';
import { StateView } from '@/components/clio/primitives/state-view';
import { isOfflineError } from '@/lib/list-state';
import { cn } from '@/lib/utils';
import type { RailSessions } from '@/hooks/use-rail-sessions';
import { holdPreviews } from './row-preview-hold';

/**
 * A rail list's loading, failure or empty line, one row tall. A failure names
 * what was not listed in a few words the narrow rail keeps on one line, with
 * the full sentence on hover; offline replaces the cause.
 */
export function RailState({
  kind,
  title,
  failed,
  error,
  onRetry,
}: {
  kind: 'loading' | 'error' | 'empty';
  title: string;
  /** For an error: what failed, e.g. `workspaces`. */
  failed?: { what: string; verb: 'listed' | 'loaded' };
  error?: unknown;
  onRetry?: () => void;
}) {
  const offline = kind === 'error' && isOfflineError(error);
  const what = failed?.what ?? '';
  const shown = !failed
    ? title
    : offline
      ? `Offline, no ${what}`
      : `${what.charAt(0).toUpperCase()}${what.slice(1)} not ${failed.verb}`;
  return (
    <div className="min-w-0 group-data-[collapsible=icon]:hidden" title={failed ? title : undefined}>
      <StateView
        action={kind === 'error' && onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
        className="pl-2.5 pr-1"
        kind={kind}
        size="row"
        title={shown}
      />
    </div>
  );
}

/**
 * The icon rail hides RailState, so a failed workspace list keeps one cue
 * there: the alert icon over a visible "Retry", named with the full state.
 */
export function RailIconFailure({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const label = isOfflineError(error)
    ? 'Offline, no workspaces. Retry'
    : 'Workspaces not listed. Retry';
  return (
    <NamedTooltip label={label} side="right">
      <Button
        aria-label={label}
        className="mx-auto hidden h-auto w-11 flex-col gap-[3px] rounded-[6px] px-0 py-1 text-destructive-text hover:bg-hover hover:text-destructive-text group-data-[collapsible=icon]:inline-flex [&_svg:not([class*=size-])]:size-[17px]"
        onClick={onRetry}
        variant="ghost"
      >
        <CircleAlertIcon aria-hidden="true" />
        <span aria-hidden="true" className="text-caption leading-none font-medium">
          Retry
        </span>
      </Button>
    </NamedTooltip>
  );
}

/** The unsent draft at /workspaces/<id>/new, selected, until its first message. */
export function DraftConversationRow({ topLevel }: { topLevel: boolean }) {
  return (
    <ListRow
      aria-current="page"
      className={cn(
        'data-selected:bg-accent data-selected:text-accent-foreground',
        topLevel ? 'pl-2.5' : 'pl-[34px]',
      )}
      data-draft-row=""
      meta={<span className="text-caption italic text-accent-foreground/80">now</span>}
      selected
      title={<span className="truncate italic">New conversation</span>}
    />
  );
}

/** The fold row under a list: "Show 12 more", quiet and aligned with the titles. */
export function ShowMoreRow({
  expanded,
  label,
  onToggle,
  railKey,
  indent = false,
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
  /** Names the row for the list keys, e.g. `more:workspaces`. */
  railKey: string;
  indent?: boolean;
}) {
  return (
    <ListRow
      className={cn(
        'h-[26px] cursor-pointer text-label text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden',
        indent ? 'pl-[34px]' : 'pl-2.5',
      )}
      data-rail-item={railKey}
      title={
        <button
          aria-expanded={expanded}
          className="outline-none after:absolute after:inset-0 after:rounded-[6px] focus-visible:after:ring-1 focus-visible:after:ring-ring"
          data-rail-focus=""
          onClick={(event) => {
            holdPreviews(event.clientX, event.clientY);
            onToggle();
          }}
          type="button"
        >
          {label}
        </button>
      }
    />
  );
}

/**
 * The first page's loading or failure line, under any rows already listed live:
 * live rows alone (the open conversation, a draft) must not read as the whole list.
 */
export function RailListState({ rail }: { rail: RailSessions }) {
  if (rail.error)
    return (
      <RailState
        error={rail.error}
        failed={{ what: 'conversations', verb: 'listed' }}
        kind="error"
        onRetry={rail.retry}
        title="Conversations could not be listed"
      />
    );
  if (rail.loading) return <RailState kind="loading" title="Loading conversations…" />;
  return null;
}

/** Loads the next rail page when it scrolls into view, or on click; a failed page offers Retry. */
export function RailLoadMore({ rail }: { rail: RailSessions }) {
  if (rail.loadMoreError)
    return (
      <RailState
        error={rail.loadMoreError}
        failed={{ what: 'more conversations', verb: 'loaded' }}
        kind="error"
        onRetry={rail.retry}
        title="More conversations could not be loaded"
      />
    );
  return <RailLoadMoreButton loading={rail.loadingMore} onLoadMore={rail.loadMore} />;
}

function RailLoadMoreButton({
  loading,
  onLoadMore,
}: {
  loading: boolean;
  onLoadMore: () => void;
}) {
  const sentinel = useRef<HTMLButtonElement>(null);
  const load = useRef(onLoadMore);
  useEffect(() => {
    load.current = onLoadMore;
  });
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load.current();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <Button
      aria-busy={loading || undefined}
      className="h-7 w-full justify-start gap-1.5 pl-[34px] text-label text-muted-foreground"
      disabled={loading}
      onClick={onLoadMore}
      ref={sentinel}
      size="sm"
      type="button"
      variant="ghost"
    >
      {loading ? <LoaderCircleIcon aria-hidden="true" className="size-3 animate-spin" /> : null}
      {loading ? 'Loading more sessions…' : 'Load more sessions'}
    </Button>
  );
}
