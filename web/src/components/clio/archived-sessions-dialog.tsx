import type { Session, Workspace } from '@clio/core/v3';
import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { isOfflineError, type ListState } from '@/lib/list-state';
import { workspaceLabels } from '@/lib/workspace-labels';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';

export interface ClioArchivedSessionsDialogProps {
  open: boolean;
  sessions: readonly Session[];
  workspaces: readonly Workspace[];
  onDelete: (sessionId: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onRestore: (sessionId: string) => Promise<void>;
  /** The archived list's loading or failure, while it lists none. */
  state?: ListState;
}

/** "Nov 2", with the year only when it is not this year's. */
function archivedOn(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Once a restored row leaves the list, focus the Restore of the row that took
 * its place, or the dialog when none is left, whenever focus fell out of it.
 */
function focusRowAfter(list: HTMLUListElement | null, index: number) {
  const dialog = list?.closest<HTMLElement>('[role="dialog"]');
  if (!dialog || index < 0) return;
  const deadline = Date.now() + 3000;
  const tick = () => {
    if (!dialog.isConnected) return;
    const active = document.activeElement;
    if (!active || active === document.body || active === dialog || !dialog.contains(active)) {
      const buttons = [
        ...dialog.querySelectorAll<HTMLButtonElement>('li button[aria-label^="Restore"]'),
      ];
      (buttons[Math.min(index, buttons.length - 1)] ?? dialog).focus();
    }
    if (Date.now() < deadline) window.setTimeout(tick, 100);
  };
  tick();
}

export function ClioArchivedSessionsDialog({
  open,
  sessions,
  workspaces,
  onDelete,
  onOpenChange,
  onRestore,
  state,
}: ClioArchivedSessionsDialogProps) {
  const [pendingId, setPendingId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<Session>();
  const listRef = useRef<HTMLUListElement>(null);
  const labels = useMemo(() => workspaceLabels(workspaces), [workspaces]);
  const archived = useMemo(
    () =>
      sessions
        .filter((session) => session.archived)
        .toSorted((left, right) => right.updated_at.localeCompare(left.updated_at)),
    [sessions],
  );

  const restore = async (session: Session) => {
    const index = archived.indexOf(session);
    setPendingId(session.id);
    try {
      await onRestore(session.id);
      toast.success(`${session.title} restored`);
      focusRowAfter(listRef.current, index);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to restore the conversation');
    } finally {
      setPendingId(undefined);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setPendingId(deleteTarget.id);
    try {
      await onDelete(deleteTarget.id);
      toast.success(`${deleteTarget.title} deleted`);
      setDeleteTarget(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete the conversation');
    } finally {
      setPendingId(undefined);
    }
  };

  return (
    <>
      <DialogFrame
        // The delete confirm takes the list's place rather than stacking on it.
        open={open && !deleteTarget}
        onOpenChange={onOpenChange}
        icon={<ArchiveIcon />}
        title="Archived conversations"
        description="Restore one to the sidebar, or delete it for good."
      >
        {archived.length ? (
          <ul
            className="clio-scrollbar -mx-0.5 max-h-[min(400px,50dvh)] overflow-y-auto"
            ref={listRef}
          >
            {archived.map((session) => {
              const label = labels.get(session.workspace_id);
              const workspace = label
                ? [label.name, ...label.qualifiers].join(' ')
                : 'Workspace unavailable';
              const when = archivedOn(session.updated_at);
              const detail = when ? `${workspace}, archived ${when}` : workspace;
              return (
                <li
                  key={session.id}
                  className="flex h-10 min-w-0 items-center gap-2 border-b border-border px-0.5 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 items-baseline gap-2 whitespace-nowrap">
                    <span
                      className="max-w-[60%] shrink-0 truncate text-foreground"
                      title={session.title}
                    >
                      {session.title}
                    </span>
                    <small
                      className="min-w-0 truncate text-[11.5px] text-muted-foreground"
                      title={detail}
                    >
                      {detail}
                    </small>
                  </span>
                  <Button
                    aria-label={`Restore ${session.title}`}
                    disabled={pendingId === session.id}
                    onClick={() => void restore(session)}
                    size="sm"
                    variant="outline"
                  >
                    <ArchiveRestoreIcon aria-hidden="true" /> Restore
                  </Button>
                  <IconButton
                    size="toolbar"
                    label={`Delete ${session.title}`}
                    icon={<DeleteIcon aria-hidden="true" />}
                    disabled={pendingId === session.id}
                    onClick={() => setDeleteTarget(session)}
                  />
                </li>
              );
            })}
          </ul>
        ) : state?.error ? (
          <StateView
            action={{ label: 'Retry', onClick: state.retry }}
            detail={isOfflineError(state.error) ? 'Offline' : undefined}
            kind="error"
            size="panel"
            title="Archived conversations could not be listed"
          />
        ) : state?.loading ? (
          <StateView kind="loading" size="panel" title="Loading archived conversations…" />
        ) : (
          <StateView kind="empty" size="panel" title="No archived conversations" />
        )}
      </DialogFrame>
      <DialogFrame
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next && !pendingId) setDeleteTarget(undefined);
        }}
        icon={<DeleteIcon />}
        title={`Delete ${deleteTarget?.title ?? 'conversation'}?`}
        description="Removes it and its record from the service. This can’t be undone."
        cancelLabel="Keep conversation"
        confirm={{
          label: 'Delete permanently',
          tone: 'destructive',
          disabled: Boolean(pendingId),
          onConfirm: () => void remove(),
        }}
      />
    </>
  );
}
