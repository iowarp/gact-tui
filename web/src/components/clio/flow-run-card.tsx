import { Maximize2Icon, PanelRightOpenIcon, WorkflowIcon } from 'lucide-react';
import { useCallback, useContext, useState } from 'react';
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact';
import { Button } from '@/components/ui/button';
import { useFlowRun, useOpenTaskHandle } from '@/hooks/use-flow-run';
import {
  rowDuration,
  useFlowPresentation,
  useSessionAgentRef,
} from '@/hooks/use-flow-presentation';
import { FlowDiagram } from './flow-diagram';
import {
  FlowMemberRows,
  FlowScript,
  FlowStall,
  FlowStepRows,
  FlowVerdictView,
} from './flow-run-parts';
import { flowRunStatus, stepTally } from './flow-run-presentation';
import { FlowRunDetails, FlowRunFullScreen } from './flow-run-view';
import type { FlowToolDescriptor } from './flow-tool-presentation';
import { PresentationNavigation } from './presentation-navigation';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';

/** Rows the card shows before "Show all steps". */
const CARD_ROWS = 6;

/**
 * The flow an agent started, as a card in the conversation where it started
 * it: a one-line diagram, a row per step or member with its state in words,
 * and the plan the agent wrote. It follows the run live, opens it in the side
 * panel, and shows it full screen.
 */
export function FlowRunCard({
  flow,
  sessionId,
}: {
  flow: FlowToolDescriptor & { handle: string };
  sessionId: string;
}) {
  const navigation = useContext(PresentationNavigation);
  const run = useFlowRun(sessionId, flow.handle);
  const onOpenSubagent = navigation?.onOpenSubagent;
  const open = useOpenTaskHandle(
    useCallback((subagent, target) => onOpenSubagent?.(subagent, target), [onOpenSubagent]),
  );
  const openHandle = useCallback(
    (handle: string, how: SubagentOpenTarget = 'canvas') => open.mutate({ handle, target: how }),
    [open],
  );
  const agentRef = useSessionAgentRef(sessionId);
  const presentation = useFlowPresentation(run.data, agentRef, flow.args, sessionId);
  const [fullScreen, setFullScreen] = useState(false);
  const [allRows, setAllRows] = useState(false);
  const title = `${flow.label} run`;
  const data = run.data;
  const status = data ? flowRunStatus(data) : undefined;
  const { steps, members, elapsed, diagram, verdict, closing, runElapsed } = presentation;
  const rows = data?.view ? steps : members;
  const noun = data?.view
    ? 'step'
    : data?.flow === 'arena'
      ? 'entry'
      : data?.flow === 'council'
        ? 'member'
        : 'task';
  const plural = noun === 'entry' ? 'entries' : `${noun}s`;
  const summary = data
    ? [
        `${rows.length} ${rows.length === 1 ? noun : plural}`,
        stepTally(rows.map((row) => row.status)),
        rowDuration(runElapsed),
      ]
        .filter(Boolean)
        .join(' · ')
    : run.isPending
      ? 'Loading the run…'
      : run.error
        ? 'The run could not be loaded'
        : 'Not started yet';
  const shown = allRows ? rows.length : CARD_ROWS;
  const openPanel = navigation?.onOpenFlow
    ? () => navigation.onOpenFlow?.(flow.handle, title)
    : undefined;
  return (
    <Artifact className="w-full min-w-0 shadow-none" data-slot="flow-run-card">
      <ArtifactHeader className="gap-2.5 px-3 py-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted/60 text-primary">
          <WorkflowIcon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <ArtifactTitle className="truncate">{title}</ArtifactTitle>
          <ArtifactDescription className="line-clamp-2 text-xs">{summary}</ArtifactDescription>
        </div>
        {status ? (
          <ClioStatus className="shrink-0" label={status.label} value={status.value} />
        ) : null}
        <ArtifactActions className="shrink-0 gap-0">
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
          {diagram ? <FlowDiagram fontSize={12} spec={diagram} /> : null}
          {data.outcome ? (
            <FlowStall
              cancelled={data.status === 'cancelled'}
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
          {data.view ? (
            <FlowStepRows
              elapsed={elapsed}
              onOpenHandle={openHandle}
              steps={steps.slice(0, shown)}
            />
          ) : members.length ? (
            <FlowMemberRows
              elapsed={elapsed}
              members={members.slice(0, shown)}
              onOpenHandle={openHandle}
            />
          ) : (
            <p className="text-xs text-muted-foreground">The flow has not started any task yet.</p>
          )}
          {rows.length > CARD_ROWS ? (
            <Button
              className="h-auto w-fit p-0 text-xs"
              onClick={() => setAllRows(!allRows)}
              variant="link"
            >
              {allRows ? 'Show fewer' : `Show all ${rows.length} ${plural}`}
            </Button>
          ) : null}
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
        <FlowRunFullScreen onOpenChange={setFullScreen} open={fullScreen} run={data} title={title}>
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
            run={data}
          />
        </FlowRunFullScreen>
      ) : null}
    </Artifact>
  );
}
