import type { StopScopeTask } from '@clio/core/v3';
import { plural, t } from '@lingui/core/macro';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface StopChildrenDialogProps {
  tasks: StopScopeTask[];
  open: boolean;
  pending: boolean;
  onStopAll: () => void;
  onStopReply: () => void;
  onOpenChange: (open: boolean) => void;
}

/** What kind of work a task is, in words. */
// oxlint-disable-next-line react/only-export-components
export function stopTaskKindLabel(kind: string): string {
  switch (kind) {
    case 'Subagent':
    case 'Session':
      return t`Agent`;
    case 'MCP':
      return t`Tool call`;
    case 'Shell':
      return t`Command`;
    case 'Code':
      return t`Script`;
    case 'Download':
      return t`Download`;
    case 'Indexing':
      return t`Indexing`;
    case 'Question':
      return t`Question`;
    default:
      return t`Task`;
  }
}

/** Where an open task stands, in words (never a colour alone). */
// oxlint-disable-next-line react/only-export-components
export function stopTaskStatusLabel(status: string): string {
  switch (status) {
    case 'queued':
    case 'accepted':
      return t`Queued`;
    case 'input_required':
      return t`Waiting for input`;
    case 'paused':
      return t`Paused`;
    case 'task_state_uncertain':
      return t`State unconfirmed`;
    default:
      return t`Running`;
  }
}

/**
 * Stop asks before stopping work the conversation started: child agents, flows,
 * workflows, questions and tool tasks. "Stop everything" cancels them and their own
 * children; "Stop reply only" leaves them running and reporting back.
 */
export function StopChildrenDialog({
  tasks,
  open,
  pending,
  onStopAll,
  onStopReply,
  onOpenChange,
}: StopChildrenDialogProps) {
  const count = tasks.length;
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Stop the work this conversation started?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {plural(count, {
              one: 'This conversation started # task that is still open. Stopping everything cancels it and anything it started; finished results are kept, and you can restart it later.',
              other:
                'This conversation started # tasks that are still open. Stopping everything cancels them and anything they started; finished results are kept, and you can restart them later.',
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul aria-label={t`Open tasks`} className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
          {tasks.map((task) => (
            <li
              className="flex min-w-0 items-baseline justify-between gap-3 rounded-md border px-3 py-2"
              key={task.handle}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{task.label || task.handle}</span>
                {task.description ? (
                  <span className="block truncate text-muted-foreground text-xs">
                    {task.description}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 gap-2 text-muted-foreground text-xs">
                <span>{stopTaskKindLabel(task.kind)}</span>
                <span>{stopTaskStatusLabel(task.status)}</span>
              </span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t`Keep working`}</AlertDialogCancel>
          <Button disabled={pending} onClick={onStopReply} variant="outline">
            {t`Stop reply only`}
          </Button>
          <Button disabled={pending} onClick={onStopAll} variant="destructive">
            {t`Stop everything`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
