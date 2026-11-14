import { useNearViewport } from '@/hooks/use-near-viewport';
import { Maximize2Icon, PanelRightOpenIcon, WorkflowIcon } from 'lucide-react';
import { useCallback, useContext, useEffect, useState, useRef } from 'react';
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact';
import {
  useFlowQuestions,
  useFlowRun,
  useFlowTaskRecord,
  useOpenTaskHandle,
} from '@/hooks/use-flow-run';
import {
  rowDuration,
  useFlowPresentation,
  useSessionAgentRef,
} from '@/hooks/use-flow-presentation';
import { Button } from '@/components/ui/button';
import { FlowEdits } from './flow-run-edit-list';
import { FlowScript, FlowStall, FlowVerdictView } from './flow-run-parts';
import {
  flowRunStatus,
  flowTaskHistoryUnavailable,
  settledTaskStatus,
  stepTally,
  flowRowCount,
} from './flow-run-presentation';
import { FlowUsageSummary } from './flow-run-usage';
import { FlowRunDetails, FlowRunFullScreen } from './flow-run-view';
import { FlowTrack } from './flow-track';
import type { FlowToolDescriptor } from './flow-tool-presentation';
import { PresentationNavigation } from './presentation-navigation';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import { ph, plural, t } from '@lingui/core/macro';

/**
 * The flow an agent started, as a card in the conversation where it started
 * it: the railroad, coloured by state, whose nodes open their details; the
 * result; and the workflow or request the agent wrote. It follows the run live, opens it in
 * the side panel, and shows it full screen.
 */
export function FlowRunCard({
  flow,
  sessionId,
}: {
  flow: FlowToolDescriptor & { handle: string };
  sessionId: string;
}) {
  return <FlowRunCardBody flow={flow} sessionId={sessionId} />;
}

/** How a card that follows a restart links back to the run that was stopped. */
interface RestartLink {
  /** Show the stopped run in place of the restart that continues it. */
  onShowStopped: () => void;
}

/**
 * One run's card. A stopped run that was restarted shows the run that continues it,
 * live, with a way back to the stopped one; that one offers the way forward again.
 */
function FlowRunCardBody({
  flow,
  sessionId,
  restartOf,
}: {
  flow: FlowToolDescriptor & { handle: string };
  sessionId: string;
  restartOf?: RestartLink;
}) {
  const [showStopped, setShowStopped] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const near = useNearViewport(viewport);
  const navigation = useContext(PresentationNavigation);
  const run = useFlowRun(sessionId, flow.handle, near);
  const onOpenSubagent = navigation?.onOpenSubagent;
  const open = useOpenTaskHandle(
    useCallback((subagent, target) => onOpenSubagent?.(subagent, target), [onOpenSubagent]),
  );
  const openHandle = useCallback(
    (handle: string, how: SubagentOpenTarget = 'canvas') => open.mutate({ handle, target: how }),
    [open],
  );
  const agentRef = useSessionAgentRef(sessionId);
  const presentation = useFlowPresentation(run.data, agentRef, flow.args, sessionId, near);
  const [fullScreen, setFullScreen] = useState(false);
  const title = restartOf
    ? t`${ph({ flow: flow.label })} run, restarted`
    : t`${ph({ flow: flow.label })} run`;
  const data = run.data;
  const questions = useFlowQuestions(sessionId, data, near || fullScreen);
  // No checkpoint: a flow that ended before writing one reads from its task, not as unstarted.
  const task = useFlowTaskRecord(flow.handle, near && data === null);
  const ended = data === null && task.data ? settledTaskStatus(task.data) : undefined;
  // A card shown before the run wrote its first checkpoint keeps asking for it while the
  // task runs; once it exists, the run's own polling takes over.
  const awaitingCheckpoint = data === null && Boolean(task.data) && !ended;
  const refetchRun = run.refetch;
  useEffect(() => {
    if (awaitingCheckpoint) void refetchRun();
  }, [awaitingCheckpoint, task.dataUpdatedAt, refetchRun]);
  const status = data ? flowRunStatus(data) : ended;
  const { steps, members, verdict, closing, runElapsed } = presentation;
  const rows = data?.view || data?.execution?.length ? steps : members;
  const historyUnavailable = data ? flowTaskHistoryUnavailable(data, rows.length) : false;
  const stepwise = Boolean(data?.view || data?.execution?.length);
  const summary = data
    ? [
        historyUnavailable
          ? t`Task history not recorded`
          : flowRowCount(rows.length, stepwise, data.flow),
        historyUnavailable ? '' : stepTally(rows.map((row) => row.status)),
        rowDuration(runElapsed),
      ]
        .filter(Boolean)
        .join(', ')
    : run.isPending
      ? t`Loading the run…`
      : run.error
        ? t`The run could not be loaded`
        : ended
          ? task.data?.error_reason || t`Ended before its run was recorded`
          : t`Not started yet`;
  const openPanel = navigation?.onOpenFlow
    ? () => navigation.onOpenFlow?.(flow.handle, title)
    : undefined;
  const successor = data?.restarted_as;
  // The wrapper keeps this card's viewport observed while it shows the restart, so
  // switching back draws the stopped run's track at once.
  if (successor && !showStopped)
    return (
      <div ref={viewport} className="min-w-0">
        <FlowRunCardBody
          flow={{ ...flow, handle: successor }}
          restartOf={{ onShowStopped: () => setShowStopped(true) }}
          sessionId={sessionId}
        />
      </div>
    );
  const restartNote = restartOf ? (
    <RestartNotice
      action={t`Show the stopped run`}
      message={t`This run continues one that was stopped. Steps that finished were kept; only unfinished steps run again.`}
      onAction={restartOf.onShowStopped}
    />
  ) : successor ? (
    <RestartNotice
      action={t`Show the restarted run`}
      message={t`This run was stopped and later restarted.`}
      onAction={() => setShowStopped(false)}
    />
  ) : null;
  return (
    <div ref={viewport} className="min-w-0">
      <Artifact className="w-full min-w-0 shadow-none" data-slot="flow-run-card">
        <ArtifactHeader className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 px-3 py-2 sm:flex">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted/60 text-primary">
            <WorkflowIcon aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <ArtifactTitle className="truncate">{title}</ArtifactTitle>
            <ArtifactDescription className="line-clamp-2 text-xs">{summary}</ArtifactDescription>
          </div>
          {status ? (
            <ClioStatus
              className="col-start-2 row-start-2 shrink-0 justify-self-start"
              label={status.label}
              value={status.value}
            />
          ) : null}
          <ArtifactActions className="col-start-3 row-span-2 row-start-1 shrink-0 gap-0">
            {data ? (
              <ArtifactAction
                icon={Maximize2Icon}
                label={t`Show the ${ph({ flow: flow.label.toLowerCase() })} run full screen`}
                onClick={() => setFullScreen(true)}
                tooltip={t`Full screen`}
              />
            ) : null}
            {openPanel ? (
              <ArtifactAction
                icon={PanelRightOpenIcon}
                label={t`Open the ${ph({ flow: flow.label.toLowerCase() })} run in the side panel`}
                onClick={openPanel}
                tooltip={t`Open in the side panel`}
              />
            ) : null}
          </ArtifactActions>
        </ArtifactHeader>
        {data ? (
          <ArtifactContent className="grid min-w-0 gap-2 p-3">
            {restartNote}
            <FlowTrack
              active={near || fullScreen}
              flow={data.flow}
              fontSize={12}
              onOpenHandle={openHandle}
              presentation={presentation}
              questions={questions}
              sessionId={sessionId}
              usage={data.usage}
              historyUnavailable={historyUnavailable}
            />
            <FlowUsageSummary usage={data.usage} />
            {data.outcome ? (
              <FlowStall
                cancelled={data.status === 'cancelled'}
                details
                onOpenHandle={openHandle}
                outcome={data.outcome}
              />
            ) : null}
            {data.view?.awaiting_approval.length ? (
              <p
                className="rounded-md border border-warning/40 bg-warning/5 px-2 py-1.5 text-xs"
                role="status"
              >
                {plural(data.view.awaiting_approval.length, {
                  one: 'A proposed step is waiting for your approval.',
                  other: '# proposed steps are waiting for your approval.',
                })}
              </p>
            ) : null}
            <FlowEdits onOpenHandle={openHandle} questions={questions} run={data} steps={steps} />
            {closing && data.status === 'completed' ? (
              <FlowVerdictView clamp flow={data.flow} verdict={verdict} />
            ) : null}
            <FlowScript args={flow.args} run={data} steps={steps} />
            {open.error ? (
              <p className="text-xs text-destructive" role="alert">
                {open.error.message}
              </p>
            ) : null}
          </ArtifactContent>
        ) : run.error ? (
          <ArtifactContent className="p-3 text-xs text-destructive" role="alert">
            {run.error.message}
          </ArtifactContent>
        ) : null}
        {data ? (
          <FlowRunFullScreen
            onOpenChange={setFullScreen}
            open={fullScreen}
            run={data}
            title={title}
          >
            <FlowRunDetails
              args={flow.args}
              handle={flow.handle}
              label={title}
              layout="wide"
              onOpenHandle={(target, how) => {
                setFullScreen(false);
                openHandle(target, how);
              }}
              openError={open.error?.message}
              presentation={presentation}
              questions={questions}
              run={data}
              sessionId={sessionId}
            />
          </FlowRunFullScreen>
        ) : null}
      </Artifact>
    </div>
  );
}

/** One line linking a restarted run and the run it continues, with the way to the other. */
function RestartNotice({
  message,
  action,
  onAction,
}: {
  message: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/40 px-2 py-1.5 text-xs"
      role="status"
    >
      <span className="min-w-[min(100%,14rem)] flex-1">{message}</span>
      <Button className="h-6 w-fit px-2 text-xs" onClick={onAction} size="xs" variant="outline">
        {action}
      </Button>
    </div>
  );
}
