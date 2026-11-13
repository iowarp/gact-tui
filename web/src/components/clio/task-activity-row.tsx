import { hasRecordedFlowRun, taskFlow, taskFlowState } from './task-flow-state';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWorkTaskFocus } from './work-task-focus';
import { mergeSessionSubagents } from '@/lib/session-agent-tasks';
import { ChevronRightIcon, PanelRightOpenIcon } from 'lucide-react';
import { useCountedTaskProgress } from '@/hooks/use-count-up';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { SessionEvidenceActions } from './session-evidence-types';
import type { TaskActivity } from './task-activity';
import { flowLabel } from './flow-tool-presentation';
import { taskProgressLabel } from './task-progress-label';
import { SubagentModel } from './subagent-model';
import { subagentOpenTarget, SUBAGENT_OPEN_HINT } from './subagent-navigation';
import { WorkKindStatus } from './work-kind-status';
import { taskWorkKind } from './work-kind';
import { BoundedResult } from './bounded-result';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';
import { t, ph } from '@lingui/core/macro';

/** The task kind as a reader names it (a background run_code task is a script). */
function kindLabel(kind: string, active: boolean): string {
  if (kind === 'MCP' || kind === 'Shell') return t`Tool`;
  if (kind === 'Session' && active) return t`Agent`; // a settled one keeps its kind's name
  if (kind === 'Code') return t`Script`;
  return KIND_NAMES[kind] ?? kind;
}

/** Task kinds the row names itself; a kind the service adds later reads as reported. */
const KIND_NAMES: Record<string, string> = {
  Flow: t`Flow`,
  Subagent: t`Subagent`,
  Session: t`Session`,
  Question: t`Question`,
};

/** A quiet task summary with the original assignment and identity disclosed on demand. */
export function TaskActivityRow({
  entry,
  status,
  actions,
  onOpenSubagent,
  onOpenFlow,
  compact = false,
}: {
  entry: TaskActivity;
  status: string;
  actions?: ReactNode;
  onOpenSubagent?: SessionEvidenceActions['onOpenSubagent'];
  /** A task that runs a flow opens its run view. */
  onOpenFlow?: SessionEvidenceActions['onOpenFlow'];
  compact?: boolean;
}) {
  const { process: task, subagent } = entry;
  const previewLines = useTranscriptPreviewLines();
  const conversation = subagent ?? (task ? mergeSessionSubagents([], [task])[0] : undefined);
  const title = task?.title || subagent?.title || t`Task`;
  const flow = taskFlow(task);
  const kind = flow
    ? 'Flow'
    : (task?.task_kind ?? (task?.kind === 'agent' || subagent ? 'Subagent' : 'MCP'));
  const flowState = task ? taskFlowState(task, status) : undefined;
  // The row is named by the task; its flow run is a secondary detail and an action.
  const flowName = flow ? flowLabel(flow.id) : '';
  const followUp = flow?.status === 'not_run';
  const flowRun = flow
    ? followUp
      ? t`${ph({ flow: flowName })} follow-up`
      : t`${ph({ flow: flowName })} run`
    : undefined;
  const assignment = task?.description || subagent?.task;
  const counted = useCountedTaskProgress(task?.progress, task?.handle);
  const progress = taskProgressLabel(counted, kind, task?.error_reason);
  const yielded = status === 'yielded';
  const awaitingAnswer =
    kind === 'Question' && (status === 'input_required' || status === 'waiting_user');
  const running = ['running', 'working', 'executing', 'starting'].includes(status);
  const label =
    status === 'task_state_uncertain'
      ? t`Needs inspection`
      : status === 'cancelling' || status === 'cancellation_requested'
        ? t`Cancellation requested`
        : awaitingAnswer
          ? t`Waiting for your answer`
          : status.replaceAll('_', ' ').replace(/^./u, (letter) => letter.toUpperCase());
  const result = task?.result?.answer || task?.result?.answer_excerpt || subagent?.result;
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const focused = useWorkTaskFocus((state) => state.handle === entry.key);
  // A link asked Work to show this task: its row opens, comes into view, and the
  // request clears, so the reader can close the row again.
  if (focused && !open) setOpen(true);
  useEffect(() => {
    if (!focused) return;
    rowRef.current?.scrollIntoView?.({ block: 'nearest' });
    useWorkTaskFocus.getState().clear(entry.key);
  }, [focused, entry.key]);
  return (
    <Collapsible
      ref={rowRef}
      open={open}
      onOpenChange={setOpen}
      className="group/task min-w-0 rounded-lg data-[state=open]:bg-muted/35"
    >
      <div className="flex min-w-0 items-center gap-0.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={t`Task details: ${title}`}
            title={title}
            className={`flex min-w-0 flex-1 cursor-pointer items-center rounded-sm text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring ${compact ? 'min-h-9 gap-1.5 px-1 py-1' : 'min-h-14 gap-2.5 px-2 py-2'}`}
          >
            <WorkKindStatus
              kind={flow ? 'workflow' : taskWorkKind(kind)}
              status={flowState?.value ?? status}
              detail={flowState?.detail}
            />
            <span className={`min-w-0 flex-1 ${compact ? 'flex items-baseline gap-2' : ''}`}>
              {compact ? (
                <span className="block flex-1 truncate text-sm">{title}</span>
              ) : (
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{title}</span>
                  {conversation?.model_choice ? (
                    <SubagentModel choice={conversation.model_choice} />
                  ) : null}
                </span>
              )}
              <span
                className={`block text-muted-foreground ${compact ? 'max-w-[40%] truncate text-xs' : 'line-clamp-2 text-xs [overflow-wrap:anywhere]'}`}
              >
                {/* The state in words, never only the icon (also in the compact rail). */}
                {(!compact || running) && progress && progress !== label
                  ? flowState
                    ? t`Flow: ${ph({ state: flowState.label })} — ${ph({ progress })}`
                    : t`${ph({ kind: kindLabel(kind, running || status === 'completed') })}: ${ph({ state: label })} — ${ph({ progress })}`
                  : flowState
                    ? t`Flow: ${ph({ state: flowState.label })}`
                    : t`${ph({ kind: kindLabel(kind, running || status === 'completed') })}: ${ph({ state: label })}`}
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
          {compact && conversation?.model_choice ? (
            <SubagentModel choice={conversation.model_choice} />
          ) : null}
          <div
            role="region"
            aria-label={t`Assignment: ${title}`}
            className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
          >
            <BoundedResult lines={previewLines} title={t`Assignment: ${title}`}>
              {assignment || t`Description unavailable for this older task`}
            </BoundedResult>
          </div>
          {flowState?.detail ? (
            <p className="text-sm text-muted-foreground">{flowState.detail}</p>
          ) : null}
          {flow?.previous_handle && onOpenFlow ? (
            <Button
              variant="link"
              size="sm"
              className="h-8 px-0"
              onClick={() =>
                onOpenFlow(flow.previous_handle!, t`${ph({ flow: flowLabel(flow.id) })} run`)
              }
            >
              {t`Open earlier flow attempt`}
            </Button>
          ) : null}
          {progress ? (
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{progress}</p>
          ) : null}
          {task?.error_reason && status !== 'task_state_uncertain' ? (
            <p className="text-sm text-destructive [overflow-wrap:anywhere]">{task.error_reason}</p>
          ) : null}
          {yielded ? (
            <p className="text-xs text-muted-foreground">
              {t`The assignment is still open. New messages and task results can continue it.`}
            </p>
          ) : null}
          {task?.recording === 'unconfirmed' ? (
            <p role="status" className="text-xs text-muted-foreground">
              {t`History recording is unconfirmed. Check the task before retrying.`}
            </p>
          ) : null}
          {status === 'stopping' ? (
            <p role="status" className="text-xs text-muted-foreground">
              {t`The agent is stopping. New input stays queued until its current execution exits.`}
            </p>
          ) : null}
          {status === 'task_state_uncertain' ? (
            <p role="status" className="text-xs text-muted-foreground">
              {t`Execution or cleanup could not be confirmed. Inspect the task before retrying.`}
            </p>
          ) : null}
          {result ? (
            <div
              role="region"
              aria-label={t`Result: ${title}`}
              tabIndex={0}
              className="max-h-40 overflow-y-auto text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
            >
              {result}
            </div>
          ) : null}
          {flowRun && hasRecordedFlowRun(task) && onOpenFlow ? (
            <Button
              variant="link"
              size="sm"
              className="h-8 px-0"
              aria-label={
                followUp
                  ? t`Open the ${ph({ flow: flowName.toLowerCase() })} follow-up: ${title}`
                  : t`Open the ${ph({ flow: flowName.toLowerCase() })} run: ${title}`
              }
              onClick={() => onOpenFlow(entry.key, flowRun)}
            >
              {t`Open the run`}
            </Button>
          ) : null}
          {conversation?.child_session_id && onOpenSubagent ? (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="link"
                size="sm"
                className="h-8 px-0"
                aria-label={t`Open child conversation ${ph({ title: conversation.title })}`}
                title={SUBAGENT_OPEN_HINT}
                onClick={(event) => onOpenSubagent(conversation, subagentOpenTarget(event))}
              >
                {t`Open conversation`}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t`Open ${ph({ title: conversation.title })} in the center`}
                title={t`Open in the center`}
                onClick={() => onOpenSubagent(conversation, 'conversation')}
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
                {t`Technical details`}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <dl className="space-y-1.5 pt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  <div>
                    <dt>{t`Handle`}</dt>
                    <dd className="select-text font-mono">{entry.key}</dd>
                  </div>
                  {task.host ? (
                    <div>
                      <dt>{t`Host`}</dt>
                      <dd>{task.host}</dd>
                    </div>
                  ) : null}
                  {task.raw_status ? (
                    <div>
                      <dt>{t`Reported status`}</dt>
                      <dd>{task.raw_status}</dd>
                    </div>
                  ) : null}
                  {task.connection_freshness ? (
                    <div>
                      <dt>{t`Connection`}</dt>
                      <dd>{task.connection_freshness}</dd>
                    </div>
                  ) : null}
                  {status === 'task_state_uncertain' && task.error_reason ? (
                    <div>
                      <dt>{t`Reported issue`}</dt>
                      <dd>{task.error_reason}</dd>
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
