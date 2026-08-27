import type { Session, Workspace } from '@clio/core/v3';
import { ArchiveRestoreIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { workspaceLabels } from '@/lib/workspace-labels';
import { ClioInteractiveRow } from './interactive-row';

export interface ClioArchivedSessionsDialogProps {
  open: boolean;
  sessions: readonly Session[];
  workspaces: readonly Workspace[];
  onDelete: (sessionId: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onRestore: (sessionId: string) => Promise<void>;
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
      toast.error(error instanceof Error ? error.message : 'Unable to restore the session');
    } finally {
      setPendingId(undefined);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return false;
    setPendingId(deleteTarget.id);
    try {
      await onDelete(deleteTarget.id);
      toast.success(`${deleteTarget.title} deleted`);
      setDeleteTarget(undefined);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete the session');
      return false;
    } finally {
      setPendingId(undefined);
    }
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="grid max-h-[min(720px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Archived sessions</DialogTitle>
            <DialogDescription>
              Restore sessions to navigation or permanently remove their recorded conversation.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 pr-3">
            {archived.length ? (
              <div className="grid gap-2 pb-1">
                {archived.map((session) => (
                  <ClioInteractiveRow
                    actions={
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          aria-label={`Restore ${session.title}`}
                          disabled={pendingId === session.id}
                          onClick={() => void restore(session)}
                          size="sm"
                          variant="outline"
                        >
                          <ArchiveRestoreIcon aria-hidden="true" /> Restore
                        </Button>
                        <Button
                          aria-label={`Delete ${session.title}`}
                          disabled={pendingId === session.id}
                          onClick={() => setDeleteTarget(session)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      </div>
                    }
                    className="min-h-16 rounded-lg border px-3 py-2"
                    key={session.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{session.title}</p>
                      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                        {labels.get(session.workspace_id) ? (
                          <>
                            <span className="truncate">
                              {labels.get(session.workspace_id)!.name}
                            </span>
                            {labels.get(session.workspace_id)!.qualifiers.map((qualifier) => (
                              <span key={qualifier}>{qualifier}</span>
                            ))}
                          </>
                        ) : (
                          <span>Workspace unavailable</span>
                        )}
                        <span>Archived</span>
                        <time dateTime={session.updated_at}>
                          {new Date(session.updated_at).toLocaleDateString()}
                        </time>
                      </p>
                    </div>
                  </ClioInteractiveRow>
                ))}
              </div>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No archived sessions</EmptyTitle>
                  <EmptyDescription>
                    Sessions you archive will remain recoverable here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(undefined)}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the archived session and its recorded conversation from the
              service. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingId)}>Keep session</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(pendingId)}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
              variant="destructive"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
