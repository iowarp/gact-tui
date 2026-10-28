import { useNearViewport } from '@/hooks/use-near-viewport';
import { Maximize2Icon, PanelRightOpenIcon, WorkflowIcon } from 'lucide-react';
import { useCallback, useContext, useState, useRef } from 'react';
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact';
import { useFlowQuestions, useFlowRun, useOpenTaskHandle } from '@/hooks/use-flow-run';
import {
  rowDuration,
  useFlowPresentation,
  useSessionAgentRef,
} from '@/hooks/use-flow-presentation';
import { FlowEdits } from './flow-run-edit-list';
import { FlowScript, FlowStall, FlowVerdictView } from './flow-run-parts';
import { flowRunStatus, flowTaskHistoryUnavailable, stepTally } from './flow-run-presentation';
import { FlowUsageSummary } from './flow-run-usage';
import { FlowRunDetails, FlowRunFullScreen } from './flow-run-view';
import { FlowTrack } from './flow-track';
import type { FlowToolDescriptor } from './flow-tool-presentation';
import { PresentationNavigation } from './presentation-navigation';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';

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
  const title = `${flow.label} run`;
  const data = run.data;
  const questions = useFlowQuestions(sessionId, data, near || fullScreen);
  const status = data ? flowRunStatus(data) : undefined;
  const { steps, members, verdict, closing, runElapsed } = presentation;
  const rows = data?.view || data?.execution?.length ? steps : members;
  const historyUnavailable = data ? flowTaskHistoryUnavailable(data, rows.length) : false;
  const noun =
    data?.view || data?.execution?.length
      ? 'step'
      : data?.flow === 'arena'
        ? 'entry'
        : data?.flow === 'council'
          ? 'member'
          : 'task';
  const plural = noun === 'entry' ? 'entries' : `${noun}s`;
  const summary = data
    ? [
        historyUnavailable
          ? 'Task history not recorded'
          : `${rows.length} ${rows.length === 1 ? noun : plural}`,
        historyUnavailable ? '' : stepTally(rows.map((row) => row.status)),
        rowDuration(runElapsed),
      ]
        .filter(Boolean)
        .join(', ')
    : run.isPending
      ? 'Loading the run…'
      : run.error
        ? 'The run could not be loaded'
        : 'Not started yet';
  const openPanel = navigation?.onOpenFlow
    ? () => navigation.onOpenFlow?.(flow.handle, title)
    : undefined;
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
                label={`Show the ${flow.label.toLowerCase()} run full screen`}
                onClick={() => setFullScreen(true)}
                tooltip="Full screen"
              />
            ) : null}
            {openPanel ? (
              <ArtifactAction
                icon={PanelRightOpenIcon}
                label={`Open the ${flow.label.toLowerCase()} run in the side panel`}
                onClick={openPanel}
                tooltip="Open in the side panel"
              />
            ) : null}
          </ArtifactActions>
        </ArtifactHeader>
        {data ? (
          <ArtifactContent className="grid min-w-0 gap-2 p-3">
            <FlowTrack
              active={near || fullScreen}
              flow={data.flow}
              fontSize={12}
              onOpenHandle={openHandle}
              presentation={presentation}
              questions={questions}
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
                {data.view.awaiting_approval.length === 1
                  ? 'A proposed step is waiting for your approval.'
                  : `${data.view.awaiting_approval.length} proposed steps are waiting for your approval.`}
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
            />
          </FlowRunFullScreen>
        ) : null}
      </Artifact>
    </div>
  );
}
