import type {
  Artifact,
  AsyncProcess,
  ContextFile,
  ContextFrame,
  ContextSnapshot,
  Message,
  Run,
  RunState,
  SessionDiff,
  SubagentRun,
  Task,
  ToolInvocation,
} from '@clio/core/v3';
import {
  ActivityIcon,
  BrainCircuitIcon,
  BoxesIcon,
  BracesIcon,
  ChartNoAxesGanttIcon,
  Layers3Icon,
  PanelRightOpenIcon,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContainerQuery } from '@/hooks/use-container-query';
import type { ClioContextTarget } from '@/lib/context-targets';
import { childAgentRelationshipLabel, getChildAgentAssignment } from './child-agent-presentation';
import { ClioContextCanvasPanel } from './context-canvas-panel';
import { ClioInteractiveRow } from './interactive-row';
import { ClioActivityTimeline, type ObservabilityActivityItem } from './observability-activity';
import { ClioEvidenceView } from './observability-evidence';
import { ClioProcessLanes } from './observability-processes';
import { ClioStatus } from './status';
import { getToolOutcome, getToolPresentation, getToolSummary } from './tool-presentation';
import type { SubagentOpenTarget } from './subagent-card';
import { ClioWorkflowGraph } from './workflow-graph';

export interface ClioObservabilityDockProps {
  artifacts: readonly Artifact[];
  contextFiles: readonly ContextFile[];
  contextFrames: readonly ContextFrame[];
  diffs: readonly SessionDiff[];
  messages: readonly Message[];
  processes: readonly AsyncProcess[];
  tasks: readonly Task[];
  tools: readonly ToolInvocation[];
  runs: readonly Run[];
  subagents: readonly SubagentRun[];
  context?: ContextSnapshot;
  contextError?: string;
  contextTargets?: readonly ClioContextTarget[];
  selectedContextTargetId?: string;
  compactContextPending?: boolean;
  contextPreferencesPending?: boolean;
  onCompactContext?: () => Promise<unknown>;
  onContextTargetChange?: (targetId: string) => void;
  onUpdateContextPreferences?: (input: {
    automatic_compaction?: boolean;
    autocompact_pct?: number;
  }) => Promise<unknown>;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  onOpenCanvas?: () => void;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenDiff?: (diff: SessionDiff) => void;
  onOpenFile?: (path: string) => void;
  sessionState?: RunState;
}

function isActiveWork(state: string): boolean {
  return ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(state);
}

export function ClioObservabilityDock(props: ClioObservabilityDockProps) {
  const [childAgentsOpen, setChildAgentsOpen] = useState(false);
  const activityCount = props.processes.length || props.subagents.length;
  const activeActivityCount = props.processes.length
    ? props.processes.filter((process) => isActiveWork(process.live_state)).length
    : props.subagents.filter((agent) => isActiveWork(agent.state)).length;
  const currentTool = props.tools.findLast((tool) => ['pending', 'running'].includes(tool.state));
  const currentTask = props.tasks.findLast((task) => ['queued', 'running'].includes(task.state));
  const latestActiveProcess = props.processes.findLast((process) =>
    isActiveWork(process.live_state),
  );
  const sessionActive = props.sessionState === 'queued' || props.sessionState === 'running';
  const hasAssistantActivity = props.messages.some(
    (message) => message.role === 'assistant' && message.blocks.length > 0,
  );
  const activityCountLabel = `${activityCount.toLocaleString()} background ${activityCount === 1 ? 'activity' : 'activities'}`;
  const dockLabel = currentTool
    ? getToolPresentation(currentTool).title
    : latestActiveProcess
      ? latestActiveProcess.title
      : currentTask
        ? currentTask.title
        : activityCount
          ? activityCountLabel
          : sessionActive
            ? hasAssistantActivity
              ? 'Agent is responding'
              : 'Starting agent'
            : 'Session details';
  const dockStatus = activeActivityCount
    ? `${activeActivityCount} active`
    : sessionActive
      ? hasAssistantActivity
        ? 'Working'
        : 'Starting'
      : activityCount
        ? 'Settled'
        : 'Up to date';

  const openChildAgent = (subagent: SubagentRun, target: SubagentOpenTarget) => {
    props.onOpenSubagent?.(subagent, target);
    setChildAgentsOpen(false);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <Button
        aria-label="Open observability in workspace canvas"
        className="h-7 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-muted-foreground hover:text-foreground"
        disabled={!props.onOpenCanvas}
        onClick={props.onOpenCanvas}
        size="sm"
        title="Open observability"
        type="button"
        variant="ghost"
      >
        {activeActivityCount || sessionActive ? (
          <BrainCircuitIcon aria-hidden="true" className="size-4 text-info" />
        ) : (
          <ActivityIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-left font-medium">{dockLabel}</span>
        {activeActivityCount || sessionActive || activityCount ? (
          <ClioStatus
            className="hidden py-0.5 sm:inline-flex"
            label={dockStatus}
            value={
              activeActivityCount || sessionActive ? (props.sessionState ?? 'running') : 'completed'
            }
          />
        ) : null}
        <PanelRightOpenIcon aria-hidden="true" className="size-3.5 shrink-0" />
      </Button>
      {props.subagents.length ? (
        <Popover onOpenChange={setChildAgentsOpen} open={childAgentsOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-label="Browse child conversations"
              className="size-7 shrink-0 p-0 text-muted-foreground"
              size="icon-sm"
              title="Browse child conversations"
              type="button"
              variant="ghost"
            >
              <BoxesIcon aria-hidden="true" className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-2"
            side="top"
          >
            <PopoverHeader className="px-2 pb-1 pt-1">
              <PopoverTitle>Child agents</PopoverTitle>
              <PopoverDescription>
                Select one to make it central. Use the canvas action to keep this conversation in
                place.
              </PopoverDescription>
            </PopoverHeader>
            <div className="grid gap-1">
              {props.subagents.map((agent) => {
                const assignment = getChildAgentAssignment(agent);
                return (
                  <ClioInteractiveRow
                    actions={
                      agent.child_session_id && props.onOpenSubagent ? (
                        <Button
                          aria-label={`Open ${agent.title} in canvas`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openChildAgent(agent, 'canvas');
                          }}
                          size="icon"
                          title="Open in canvas"
                          type="button"
                          variant="ghost"
                        >
                          <PanelRightOpenIcon aria-hidden="true" />
                        </Button>
                      ) : undefined
                    }
                    className="min-h-0 px-2 py-2"
                    disabled={!agent.child_session_id || !props.onOpenSubagent}
                    key={agent.id}
                    onClick={(event) =>
                      openChildAgent(agent, event.shiftKey ? 'canvas' : 'conversation')
                    }
                    onKeyDown={(event) => {
                      if (
                        event.shiftKey &&
                        (event.key === 'Enter' || event.key === ' ') &&
                        agent.child_session_id &&
                        props.onOpenSubagent
                      ) {
                        event.preventDefault();
                        openChildAgent(agent, 'canvas');
                      }
                    }}
                    onMouseDown={(event) => {
                      if (event.shiftKey) event.preventDefault();
                    }}
                    role="button"
                    running={agent.state === 'running'}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <BoxesIcon
                        aria-hidden="true"
                        className="mt-0.5 size-3.5 shrink-0 text-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-xs font-medium">{agent.title}</p>
                          <ClioStatus className="ml-auto shrink-0 py-0.5" value={agent.state} />
                        </div>
                        <p
                          className="mt-0.5 truncate text-[11px] text-muted-foreground"
                          title={assignment.detail ?? assignment.label}
                        >
                          {assignment.label}
                        </p>
                      </div>
                    </div>
                  </ClioInteractiveRow>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

export function ClioObservabilityView({
  artifacts,
  contextFiles,
  contextFrames,
  diffs,
  messages,
  processes,
  tools,
  runs,
  subagents,
  context,
  contextError,
  contextTargets,
  selectedContextTargetId,
  compactContextPending,
  contextPreferencesPending,
  onCompactContext,
  onContextTargetChange,
  onUpdateContextPreferences,
  onOpenArtifact,
  onOpenDiff,
  onOpenFile,
  onOpenSubagent,
}: ClioObservabilityDockProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hasMediumNavigation = useContainerQuery(surfaceRef, 320);
  const hasWideNavigation = useContainerQuery(surfaceRef, 520);
  const hasGraphSpace = useContainerQuery(surfaceRef, 640);
  const toolTurnContext = useMemo(() => toolActivityContext(messages), [messages]);
  const activity = useMemo<ObservabilityActivityItem[]>(
    () =>
      [
        ...runs.map(
          (run): ObservabilityActivityItem => ({
            id: run.id,
            kind: 'run',
            label: run.summary || `Run ${run.id.slice(0, 8)}`,
            detail:
              run.elapsed_ms === undefined
                ? 'Agent run'
                : `${formatDuration(run.elapsed_ms)} elapsed`,
            state: run.state,
            at: run.completed_at ?? run.started_at,
            timing: run.completed_at || run.started_at ? 'event' : undefined,
          }),
        ),
        ...tools.map((tool): ObservabilityActivityItem => {
          const outcome = getToolOutcome(tool);
          const eventAt = tool.completed_at ?? tool.started_at;
          const turnContext = toolTurnContext.get(tool.id);
          return {
            id: tool.id,
            kind: 'tool',
            label: getToolPresentation(tool).title,
            detail: getToolSummary(tool),
            state: outcome.value,
            statusLabel: outcome.label,
            statusDetail: outcome.detail,
            at: eventAt ?? turnContext?.at,
            groupId: turnContext?.turnId,
            timing: eventAt ? 'event' : turnContext ? 'turn' : undefined,
          };
        }),
        ...processes.map(
          (process): ObservabilityActivityItem => ({
            id: process.id,
            kind: 'process',
            label: process.title,
            detail:
              process.kind === 'agent'
                ? childAgentProcessDetail(process.placement)
                : `Background task${process.host ? `, ${process.host}` : ''}`,
            state: process.live_state,
            at: process.updated_at ?? process.created_at,
            groupId: process.parent_turn_id,
            timing: process.updated_at || process.created_at ? 'event' : undefined,
          }),
        ),
      ].sort((left, right) => {
        const byTime = (right.at ?? '').localeCompare(left.at ?? '');
        return byTime;
      }),
    [processes, runs, toolTurnContext, tools],
  );
  return (
    <div className="h-full min-h-0 min-w-0" ref={surfaceRef}>
      <Tabs className="h-full min-h-0 gap-0" defaultValue="work">
        <TabsList
          aria-label="Observability view"
          className={`mx-3 mt-2 grid h-auto! w-auto shrink-0 gap-1 p-1 ${
            hasWideNavigation ? 'grid-cols-4' : hasMediumNavigation ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          <ObservabilityTab icon={<ChartNoAxesGanttIcon />} label="Gantt" value="work" />
          <ObservabilityTab icon={<ActivityIcon />} label="Timeline" value="activity" />
          <ObservabilityTab icon={<Layers3Icon />} label="Evidence" value="evidence" />
          <ObservabilityTab icon={<BracesIcon />} label="Context" value="context" />
        </TabsList>
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <TabsContent className="m-0 grid gap-2 p-3" value="work">
            <ClioProcessLanes
              messages={messages}
              onOpenSubagent={onOpenSubagent}
              processes={processes}
              runs={runs}
              subagents={subagents}
              tools={tools}
            />
            {hasGraphSpace ? (
              <ClioWorkflowGraph
                onOpenSubagent={onOpenSubagent}
                processes={processes}
                subagents={subagents}
              />
            ) : processes.some((process) => process.kind === 'agent') ? (
              <p className="rounded-lg border border-dashed p-3 text-xs leading-5 text-muted-foreground">
                The delegation map is available in a wider canvas. Maximize or widen this panel to
                explore the topology.
              </p>
            ) : null}
          </TabsContent>
          <TabsContent className="m-0 p-4" value="activity">
            <ClioActivityTimeline items={activity} messages={messages} />
          </TabsContent>
          <TabsContent className="m-0 p-4" value="evidence">
            <ClioEvidenceView
              artifacts={artifacts}
              contextFiles={contextFiles}
              diffs={diffs}
              messages={messages}
              onOpenArtifact={onOpenArtifact}
              onOpenDiff={onOpenDiff}
              onOpenFile={onOpenFile}
              processes={processes}
            />
          </TabsContent>
          <TabsContent className="m-0 grid gap-4 p-4" value="context">
            <ClioContextCanvasPanel
              compactPending={compactContextPending}
              context={context}
              error={contextError}
              files={contextFiles}
              frames={contextFrames}
              onCompact={onCompactContext}
              onOpenFile={onOpenFile}
              onTargetChange={onContextTargetChange}
              onUpdatePreferences={onUpdateContextPreferences}
              preferencesPending={contextPreferencesPending}
              selectedTargetId={selectedContextTargetId}
              targets={contextTargets}
            />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function ObservabilityTab({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <TabsTrigger aria-label={label} className="h-8 min-w-0 w-full px-2" value={value}>
      {icon}
      <span>{label}</span>
    </TabsTrigger>
  );
}

function toolActivityContext(
  messages: readonly Message[],
): Map<string, { at: string; turnId?: string }> {
  const context = new Map<string, { at: string; turnId?: string }>();
  let turnId: string | undefined;
  for (const message of [...messages].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  )) {
    if (message.role === 'user') turnId = message.id;
    for (const block of message.blocks) {
      if (block.type === 'tool') context.set(block.tool_id, { at: message.created_at, turnId });
    }
  }
  return context;
}

function childAgentProcessDetail(placement: string | undefined): string {
  const relationship = childAgentRelationshipLabel(placement);
  return relationship ? `Child agent. ${relationship}` : 'Child agent';
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)} s`;
  return `${Math.round(milliseconds / 60_000)} min`;
}
