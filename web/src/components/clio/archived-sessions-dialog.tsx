import type { Session, Workspace } from '@clio/core/v3';
import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DeleteIcon } from '@/lib/icon-vocabulary';
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

export function ClioArchivedSessionsDialog({
  open,
  sessions,
  workspaces,
  onDelete,
  onOpenChange,
  onRestore,
}: ClioArchivedSessionsDialogProps) {
  const [pendingId, setPendingId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<Session>();
  const labels = useMemo(() => workspaceLabels(workspaces), [workspaces]);
  const archived = useMemo(
    () =>
      sessions
        .filter((session) => session.archived)
        .toSorted((left, right) => right.updated_at.localeCompare(left.updated_at)),
    [sessions],
  );

  const restore = async (session: Session) => {
    setPendingId(session.id);
    try {
      await onRestore(session.id);
      toast.success(`${session.title} restored`);
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
        className="w-[clamp(460px,36vw,560px)]"
        // The delete confirm takes the list's place rather than stacking on it.
        open={open && !deleteTarget}
        onOpenChange={onOpenChange}
        icon={<ArchiveIcon />}
        title="Archived conversations"
        description="Restore one to the sidebar, or delete it for good."
      >
        {archived.length ? (
          <ul className="clio-scrollbar -mx-0.5 max-h-[min(400px,50dvh)] overflow-y-auto">
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
        ) : (
          <StateView kind="empty" size="panel" title="No archived conversations" />
        )}
      </DialogFrame>
      <DialogFrame
        className="w-[clamp(460px,36vw,560px)]"
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
