import type { MessageDelivery, QueuedMessage, WorkspaceResource } from '@clio/core/v3';
import { QueuedMessageReorderConflictError } from '@clio/core/v3';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { composerFailureReason } from './composer-failure';
import { Sortable } from '@/components/reui/sortable';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SavedDraft } from '@/lib/composer-saved-drafts';
import { COMPOSER_QUEUE_VIEWPORT_MAX_HEIGHT_PX } from '@/lib/runtime-limits';
import { QueuedMessageRow } from './composer-queue-row';
import { SavedDraftRow } from './composer-saved-draft-row';
import { Tag } from './primitives/tag';

/** Queue state and actions passed through the shared composer. */
export interface ComposerQueueControls {
  queuedMessages?: QueuedMessage[];
  queueBusy?: boolean;
  queuePaused?: boolean;
  onDeleteQueuedMessage?: (message: QueuedMessage) => Promise<void>;
  onPromoteQueuedMessage?: (message: QueuedMessage, delivery: MessageDelivery) => Promise<void>;
  onReorderQueuedMessages?: (messages: QueuedMessage[]) => Promise<void>;
  onUpdateQueuedMessage?: (message: QueuedMessage, text: string) => Promise<void>;
}

interface ClioComposerQueueProps {
  messages: QueuedMessage[];
  resources?: readonly WorkspaceResource[];
  promoteDelivery: MessageDelivery;
  busy?: boolean;
  paused?: boolean;
  onDelete: (message: QueuedMessage) => Promise<void>;
  onPromote: (message: QueuedMessage, delivery: MessageDelivery) => Promise<void>;
  onOpenResource?: (resource: WorkspaceResource) => void;
  onReorder: (messages: QueuedMessage[]) => Promise<void>;
  onUpdate: (message: QueuedMessage, text: string) => Promise<void>;
  /** Drafts put aside with Ctrl+S; they wait below the queue, nearest the editor. */
  savedDrafts?: readonly SavedDraft[];
  onRestoreSavedDraft?: (draft: SavedDraft) => void;
  onDeleteSavedDraft?: (draft: SavedDraft) => void;
}

/** Longer queues get a header toggle so they can fold out of the way. */
const COLLAPSIBLE_AFTER = 3;

function queuedMessagesLabel(count: number): string {
  return `${count} queued ${count === 1 ? 'message' : 'messages'}`;
}

function dashLabel(queued: number, saved: number): string {
  const savedLabel = `${saved} saved ${saved === 1 ? 'draft' : 'drafts'}`;
  if (!saved) return queuedMessagesLabel(queued);
  if (!queued) return savedLabel;
  return `${queuedMessagesLabel(queued)}, ${savedLabel}`;
}

function smoothScroll(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

interface RowsBelow {
  below: number;
  /** The rows overflow the viewport, so the "more" line keeps its slot even at the end. */
  overflowing: boolean;
}

/** How many rows sit below the viewport's visible edge, so a scrolled queue names what it hides. */
function useRowsBelow(viewport: HTMLElement | null, rowCount: number): RowsBelow {
  const [below, setBelow] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    if (!viewport) return;
    const measure = () => {
      const edge = viewport.getBoundingClientRect().bottom;
      const rows = viewport.querySelectorAll<HTMLElement>('[data-queue-live-item]');
      let hidden = 0;
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (rect.top + rect.height / 2 > edge) hidden += 1;
      }
      setBelow(hidden);
      setOverflowing(viewport.scrollHeight - viewport.clientHeight > 1);
    };
    measure();
    viewport.addEventListener('scroll', measure, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(viewport);
    if (viewport.firstElementChild) observer?.observe(viewport.firstElementChild);
    return () => {
      viewport.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [viewport, rowCount]);
  return { below, overflowing };
}

/**
 * The durable queue that waits above the composer: one strip the width of the
 * composer box, a one-line count (and Paused, in words), then one line per
 * message. Rows reorder by dragging the handle or, from the keyboard, Space
 * on the handle, the arrow keys and Space again.
 */
export function ClioComposerQueue({
  busy,
  messages,
  onDelete,
  onOpenResource,
  onPromote,
  onReorder,
  onUpdate,
  onDeleteSavedDraft,
  onRestoreSavedDraft,
  paused = false,
  promoteDelivery,
  resources = [],
  savedDrafts = [],
}: ClioComposerQueueProps) {
  const viewportId = useId();
  const [orderOverride, setOrderOverride] = useState<QueuedMessage[]>();
  const incomingIds = new Set(messages.map((message) => message.id));
  const orderOverrideMatches =
    orderOverride !== undefined &&
    incomingIds.size === orderOverride.length &&
    orderOverride.every((message) => incomingIds.has(message.id));
  const ordered = orderOverrideMatches ? orderOverride : messages;
  const [editing, setEditing] = useState<{ id: string; text: string }>();
  const [collapsedPreference, setCollapsedPreference] = useState(false);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const { below, overflowing } = useRowsBelow(viewport, ordered.length + savedDrafts.length);

  const resourceById = useMemo(
    () => new Map(resources.map((resource) => [resource.id, resource])),
    [resources],
  );

  if (ordered.length === 0 && savedDrafts.length === 0) return null;

  const collapsible = ordered.length + savedDrafts.length > COLLAPSIBLE_AFTER;
  const collapsed = collapsible && collapsedPreference;
  const countLabel = dashLabel(ordered.length, savedDrafts.length);

  const saveEdit = async (message: QueuedMessage, text: string) => {
    try {
      await onUpdate(message, text);
      setEditing(undefined);
    } catch (error) {
      toast.error('Queued message changed elsewhere', {
        description: `${composerFailureReason(error, 'It changed before your edit was saved.')} Your draft is still here.`,
      });
    }
  };

  const runAction = async (action: () => Promise<void>, label: string) => {
    try {
      await action();
    } catch (error) {
      toast.error(label, { description: composerFailureReason(error, 'The service refused it.') });
    }
  };

  const commitReorder = async (next: QueuedMessage[]) => {
    try {
      await onReorder(next);
      setOrderOverride(undefined);
    } catch (error) {
      setOrderOverride(undefined);
      if (error instanceof QueuedMessageReorderConflictError) {
        toast.error('Queue changed elsewhere, so your new order was not applied');
        return;
      }
      toast.error('Unable to reorder queued messages', {
        description: composerFailureReason(error, 'The service refused the new order.'),
      });
    }
  };

  return (
    <section
      aria-label={ordered.length ? 'Queued messages' : 'Saved drafts'}
      data-slot="composer-queue"
      // The strip runs 12px under the composer box so the box's rounded top
      // corners sit on the queue's surface instead of leaving notches.
      className="mx-auto -mb-3 flex min-h-0 w-full max-w-4xl shrink flex-col rounded-t-[12px] border border-b-0 border-input bg-composer px-1 pt-0.5 pb-3.5"
    >
      <div className="flex h-7 min-w-0 items-center gap-2 pr-0.5 pl-2 text-[12px] whitespace-nowrap text-muted-foreground">
        {/* The composer's run announcer speaks count changes: this strip mounts
            with its first row, too late for a live region of its own. Pausing
            happens while it is shown, so that is announced here. */}
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{countLabel}</span>
          <span aria-live="polite" className="contents">
            {paused ? (
              <Tag
                title="New messages wait here until the queue resumes. Send now still works."
                tone="warning"
                width="auto"
              >
                Paused
              </Tag>
            ) : null}
          </span>
        </span>
        {collapsible ? (
          <Button
            aria-controls={collapsed ? undefined : viewportId}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Show queued messages' : 'Hide queued messages'}
            className="ml-auto h-[22px] gap-1 rounded-[5px] px-1.5 text-[11.5px] font-normal text-muted-foreground hover:bg-hover hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground aria-expanded:hover:bg-hover aria-expanded:hover:text-foreground [&_svg:not([class*=size-])]:size-3.5"
            onClick={() => setCollapsedPreference((value) => !value)}
            size="xs"
            type="button"
            variant="ghost"
          >
            {collapsed ? 'Show' : 'Hide'}
            {collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </Button>
        ) : null}
      </div>
      {collapsed ? null : (
        <ScrollArea
          className="flex min-h-0 flex-col"
          scrollHideDelay={500}
          type="hover"
          viewportProps={{
            'aria-label': countLabel,
            className:
              'overscroll-contain rounded-[6px] focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none [&>div]:!block [&>div]:min-w-0',
            id: viewportId,
            ref: setViewport,
            role: 'region',
            // The queue owns its own height: its scroll chain is otherwise
            // capped only by the composer stack, so a long queue would grow
            // into the conversation instead of scrolling.
            style: { maxHeight: COMPOSER_QUEUE_VIEWPORT_MAX_HEIGHT_PX },
            tabIndex: 0,
          }}
        >
          {ordered.length > 0 ? (
            <Sortable
              asChild
              getItemValue={(message) => message.id}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onValueChange={setOrderOverride}
              onValueCommit={(next) => void commitReorder(next)}
              strategy="vertical"
              value={ordered}
            >
              <ul className="flex flex-col gap-px">
                {ordered.map((message) => (
                  <QueuedMessageRow
                    busy={busy}
                    editingText={editing?.id === message.id ? editing.text : undefined}
                    key={message.id}
                    message={message}
                    onCancelEdit={() => setEditing(undefined)}
                    onDelete={() =>
                      void runAction(() => onDelete(message), 'Queued message was not deleted')
                    }
                    onEditChange={(text) => setEditing({ id: message.id, text })}
                    onOpenResource={onOpenResource}
                    onPromote={() =>
                      void runAction(
                        () => onPromote(message, promoteDelivery),
                        'Queued message was not sent',
                      )
                    }
                    onSaveEdit={(text) => void saveEdit(message, text)}
                    onStartEdit={(text) => setEditing({ id: message.id, text })}
                    promoteDelivery={promoteDelivery}
                    resourceById={resourceById}
                  />
                ))}
              </ul>
            </Sortable>
          ) : null}
          {savedDrafts.length > 0 ? (
            <ul aria-label="Saved drafts" className="flex flex-col gap-px">
              {savedDrafts.map((draft, index) => (
                <SavedDraftRow
                  draft={draft}
                  key={draft.id}
                  latest={index === savedDrafts.length - 1}
                  onDelete={() => onDeleteSavedDraft?.(draft)}
                  onRestore={() => onRestoreSavedDraft?.(draft)}
                />
              ))}
            </ul>
          ) : null}
        </ScrollArea>
      )}
      {!collapsed && below > 0 ? (
        <button
          className="mx-1 mt-0.5 flex h-[22px] shrink-0 items-center gap-1 self-start rounded-[5px] px-1.5 text-[11.5px] text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
          onClick={() =>
            viewport?.scrollBy({ top: viewport.clientHeight, behavior: smoothScroll() })
          }
          type="button"
        >
          {below} more
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        </button>
      ) : !collapsed && overflowing ? (
        // Scrolled to the end: hold the line's height so the strip, and the
        // pending responses sharing the composer's height, do not resize.
        <span aria-hidden="true" className="mt-0.5 h-[22px] shrink-0" />
      ) : null}
    </section>
  );
}
