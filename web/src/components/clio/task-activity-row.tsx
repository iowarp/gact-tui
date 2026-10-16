import type { ReactNode } from 'react';
import {
  BanIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
  MessageCircleQuestionIcon,
  PauseIcon,
  PanelRightOpenIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { ClioEvidenceViewProps } from './observability-evidence';
import type { TaskActivity } from './task-activity';
import { taskProgressLabel } from './task-progress-label';
import { subagentOpenTarget, SUBAGENT_OPEN_HINT } from './subagent-navigation';

const settled = new Set(['completed', 'failed', 'cancelled', 'interrupted']);

/** A quiet task summary with the original assignment and identity disclosed on demand. */
export function TaskActivityRow({
  entry,
  status,
  actions,
  onOpenSubagent,
}: {
  entry: TaskActivity;
  status: string;
  actions?: ReactNode;
  onOpenSubagent?: ClioEvidenceViewProps['onOpenSubagent'];
}) {
  const { process: task, subagent } = entry;
  const title = task?.title || subagent?.title || 'Task';
  const kind = task?.task_kind ?? (task?.kind === 'agent' || subagent ? 'Subagent' : 'MCP');
  const assignment = task?.description || subagent?.task;
  const progress = taskProgressLabel(task?.progress, kind);
  const held = status === 'paused' || status === 'pause_requested';
  const yielded = status === 'yielded';
  const awaitingAnswer =
    kind === 'Question' && (status === 'input_required' || status === 'waiting_user');
  const running =
    status === 'running' ||
    status === 'working' ||
    status === 'executing' ||
    status === 'recovering' ||
    status === 'stopping' ||
    status === 'cancelling' ||
    status === 'cancellation_requested' ||
    status === 'resume_requested';
  const Icon = held
    ? PauseIcon
    : awaitingAnswer
      ? MessageCircleQuestionIcon
      : yielded || status === 'queued' || status === 'stopped'
        ? CircleDashedIcon
        : running
          ? LoaderCircleIcon
          : status === 'completed'
            ? CheckCircle2Icon
            : status === 'cancelled'
              ? BanIcon
              : CircleAlertIcon;
  const label = status === 'task_state_uncertain'
    ? 'Needs inspection'
    : status === 'cancelling' || status === 'cancellation_requested'
      ? 'Cancellation requested'
      : awaitingAnswer
    ? 'Waiting for your answer'
    : status.replaceAll('_', ' ').replace(/^./u, (letter) => letter.toUpperCase());
  const result = task?.result?.answer || task?.result?.answer_excerpt || subagent?.result;
  return (
    <Collapsible className="group/task min-w-0 rounded-lg data-[state=open]:bg-muted/35">
      <div className="flex min-w-0 items-center gap-0.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={`Task details: ${title}`}
            title={title}
            className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon
              aria-hidden="true"
              className={`size-4 shrink-0 ${running ? 'animate-spin text-primary motion-reduce:animate-none' : status === 'completed' ? 'text-success' : settled.has(status) && status !== 'cancelled' ? 'text-destructive' : 'text-muted-foreground'}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {kind} · {label}
                {progress && progress !== label ? ` — ${progress}` : ''}
              </span>
            </span>
            <ChevronRightIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/task:rotate-90"
            />
          </button>
        </CollapsibleTrigger>
        {actions ? <div className="flex shrink-0 items-center pr-1">{actions}</div> : null}
      </div>
      <CollapsibleContent>
        <div className="min-w-0 space-y-3 px-3 pb-3 pl-[2.125rem]">
          <div
            role="region"
            aria-label={`Assignment: ${title}`}
            tabIndex={0}
            className="max-h-40 overflow-y-auto text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
          >
            {assignment || 'Description unavailable for this older task'}
          </div>
          {progress ? (
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{progress}</p>
          ) : null}
          {task?.error_reason ? (
            <p className="text-sm text-destructive [overflow-wrap:anywhere]">{task.error_reason}</p>
          ) : null}
          {yielded ? (
            <p className="text-xs text-muted-foreground">
              The assignment is still open. New messages and task results can continue it.
            </p>
          ) : null}
          {task?.recording === 'unconfirmed' ? (
            <p role="status" className="text-xs text-muted-foreground">
              History recording is unconfirmed. Check the task before retrying.
            </p>
          ) : null}
          {status === 'stopping' ? <p role="status" className="text-xs text-muted-foreground">The agent is stopping. New input stays queued until its current execution exits.</p> : null}
          {status === 'task_state_uncertain' ? <p role="status" className="text-xs text-muted-foreground">Execution or cleanup could not be confirmed. Inspect the task before retrying.</p> : null}
          {result ? (
            <div
              role="region"
              aria-label={`Result: ${title}`}
              tabIndex={0}
              className="max-h-40 overflow-y-auto text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
            >
              {result}
            </div>
          ) : null}
          {subagent?.child_session_id && onOpenSubagent ? (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="link"
                size="sm"
                className="h-8 px-0"
                aria-label={`Open child conversation ${subagent.title}`}
                title={SUBAGENT_OPEN_HINT}
                onClick={(event) => onOpenSubagent(subagent, subagentOpenTarget(event))}
              >
                Open conversation
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Open ${subagent.title} in the center`}
                title="Open in the center"
                onClick={() => onOpenSubagent(subagent, 'conversation')}
              >
                <PanelRightOpenIcon aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {task ? (
            <Collapsible>
              <CollapsibleTrigger className="group/details flex min-h-8 cursor-pointer items-center gap-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-3 transition-transform group-data-[state=open]/details:rotate-90"
                />
                Technical details
              </CollapsibleTrigger>
              <CollapsibleContent>
                <dl className="space-y-1.5 pt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  <div>
                    <dt>Handle</dt>
                    <dd className="select-text font-mono">{entry.key}</dd>
                  </div>
                  {task.host ? (
                    <div>
                      <dt>Host</dt>
                      <dd>{task.host}</dd>
                    </div>
                  ) : null}
                  {task.raw_status ? (
                    <div>
                      <dt>Reported status</dt>
                      <dd>{task.raw_status}</dd>
                    </div>
                  ) : null}
                  {task.connection_freshness ? (
                    <div>
                      <dt>Connection</dt>
                      <dd>{task.connection_freshness}</dd>
                    </div>
                  ) : null}
                </dl>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
