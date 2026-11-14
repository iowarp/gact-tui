import type { StopChildren, StopScopeTask } from '@clio/core/v3';
import { useState } from 'react';
import { useRepository } from './use-repository';

interface CancelMutation {
  mutate: (children?: StopChildren) => void;
  isPending: boolean;
}

/**
 * Stop for a conversation that may have started work (CLIO `stop-and-restart.md`).
 *
 * Nothing open: Stop ends the reply at once. Open work: the person chooses, in the
 * dialog, whether Stop also stops it. When the open work cannot be read, Stop ends the
 * reply only, as it always did, and the dialog is not shown.
 */
export function useStopWithChildren(sessionId: string, cancel: CancelMutation) {
  const repository = useRepository();
  const [open, setOpen] = useState<StopScopeTask[] | undefined>(undefined);
  const [checking, setChecking] = useState(false);

  const request = async () => {
    if (checking) return;
    setChecking(true);
    let tasks: StopScopeTask[] = [];
    try {
      tasks = (await repository.stopScope(sessionId)).open_children;
    } catch (error) {
      console.warn('stop_scope_unavailable', error);
    } finally {
      setChecking(false);
    }
    if (tasks.length === 0) cancel.mutate('keep');
    else setOpen(tasks);
  };

  const choose = (children: StopChildren) => {
    cancel.mutate(children);
    setOpen(undefined);
  };

  return {
    request,
    checking,
    dialog: {
      tasks: open ?? [],
      open: open !== undefined,
      pending: cancel.isPending,
      onStopAll: () => choose('stop'),
      onStopReply: () => choose('keep'),
      onOpenChange: (next: boolean) => {
        if (!next) setOpen(undefined);
      },
    },
  };
}
