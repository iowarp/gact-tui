import type {
  Artifact,
  AsyncProcess,
  ContextFile,
  ContextFrame,
  ContextSnapshot,
  Message,
  Run,
  RunState,
  SessionContextPolicy,
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
  ListChecksIcon,
  PanelRightOpenIcon,
  ServerCogIcon,
  WrenchIcon,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@/components/reui/timeline';
import {
  Task as AiTask,
  TaskContent as AiTaskContent,
  TaskTrigger as AiTaskTrigger,
} from '@/components/ai-elements/task';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';
import { childAgentRelationshipLabel, getChildAgentAssignment } from './child-agent-presentation';
import { ClioContextCanvasPanel } from './context-canvas-panel';
import { ClioInteractiveRow } from './interactive-row';
import { ClioEvidenceView } from './observability-evidence';
import { groupToolsForWork } from './observability-grouping';
import { ClioProcessLanes, ProcessSummary } from './observability-processes';
import { ClioStatus, type ClioStatusValue } from './status';
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
  contextPolicy?: SessionContextPolicy;
  compactContextPending?: boolean;
  onCompactContext?: () => Promise<unknown>;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  onOpenCanvas?: () => void;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenDiff?: (diff: SessionDiff) => void;
  onOpenFile?: (path: string) => void;
  sessionState?: RunState;
}

type ActivityTiming = 'event' | 'turn';

function isActiveWork(state: string): boolean {
  return ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(state);
}

type ActivityItem =
  | {
      id: string;
      kind: 'run';
      label: string;
      detail: string;
      state: Run['state'];
      at?: string;
      order?: number;
      timing?: ActivityTiming;
    }
  | {
      id: string;
      kind: 'tool';
      label: string;
      detail: string;
      state: ClioStatusValue;
      statusLabel?: string;
      statusDetail?: string;
      at?: string;
      order?: number;
      timing?: ActivityTiming;
    }
  | {
      id: string;
      kind: 'process';
      label: string;
      detail: string;
      state: AsyncProcess['live_state'];
      at?: string;
      order?: number;
      timing?: ActivityTiming;
    };

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
        <ClioStatus
          className="hidden py-0.5 sm:inline-flex"
          label={dockStatus}
          value={
            activeActivityCount || sessionActive ? (props.sessionState ?? 'running') : 'completed'
          }
        />
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
  tasks,
  tools,
  runs,
  subagents,
  context,
  contextError,
  contextPolicy,
  compactContextPending,
  onCompactContext,
  onOpenArtifact,
  onOpenDiff,
  onOpenFile,
  onOpenSubagent,
}: ClioObservabilityDockProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hasSingleRowTabs = useContainerQuery(surfaceRef, 400);
  const hasGraphSpace = useContainerQuery(surfaceRef, 640);
  const toolTurnContext = useMemo(() => toolActivityContext(messages), [messages]);
  const activity = useMemo<ActivityItem[]>(
    () =>
      [
        ...runs.map(
          (run): ActivityItem => ({
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
        ...tools.map((tool): ActivityItem => {
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
            order: turnContext?.order,
            timing: eventAt ? 'event' : turnContext ? 'turn' : undefined,
          };
        }),
        ...processes.map(
          (process): ActivityItem => ({
            id: process.id,
            kind: 'process',
            label: process.title,
            detail:
              process.kind === 'agent'
                ? childAgentProcessDetail(process.placement)
                : `Background task${process.host ? `, ${process.host}` : ''}`,
            state: process.live_state,
            at: process.updated_at ?? process.created_at,
            timing: process.updated_at || process.created_at ? 'event' : undefined,
          }),
        ),
      ].sort((left, right) => {
        const byTime = (right.at ?? '').localeCompare(left.at ?? '');
        return byTime || (right.order ?? -1) - (left.order ?? -1);
      }),
    [processes, runs, toolTurnContext, tools],
  );
  const hasTurnTiming = activity.some((item) => item.timing === 'turn');
  const hasUnavailableTiming = activity.some((item) => !item.at);
  const backgroundProcesses = processes.filter((process) => process.kind === 'mcp-task');
  const hasActiveSubagents = subagents.some((agent) =>
    ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(agent.state),
  );
  const childAgentStatusLabel = hasActiveSubagents ? 'Active' : 'All settled';
  const workTools = useMemo(() => groupToolsForWork(tools), [tools]);

  return (
    <div className="h-full min-h-0 min-w-0" ref={surfaceRef}>
      <Tabs className="h-full min-h-0 gap-0" defaultValue="work">
        <div className="border-b px-3 py-2">
          <TabsList
            className={cn(
              'grid h-auto w-full bg-muted/60',
              hasSingleRowTabs ? 'grid-cols-[repeat(4,minmax(0,1fr))]' : 'grid-cols-2',
            )}
          >
            <TabsTrigger className="min-w-0 gap-1 px-1 text-xs" value="work">
              <ChartNoAxesGanttIcon aria-hidden="true" /> Gantt
            </TabsTrigger>
            <TabsTrigger className="min-w-0 gap-1 px-1 text-xs" value="activity">
              <ActivityIcon aria-hidden="true" /> Timeline
            </TabsTrigger>
            <TabsTrigger className="min-w-0 gap-1 px-1 text-xs" value="evidence">
              <Layers3Icon aria-hidden="true" /> Evidence
            </TabsTrigger>
            <TabsTrigger className="min-w-0 gap-1 px-1 text-xs" value="context">
              <BracesIcon aria-hidden="true" /> Context
            </TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent className="m-0 grid gap-2 p-3" value="work">
            <ClioProcessLanes
              onOpenSubagent={onOpenSubagent}
              processes={processes}
              subagents={subagents}
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
            {processes.length ? <ProcessSummary processes={processes} /> : null}
            {tasks.map((task) => (
              <ClioInteractiveRow key={task.id} running={task.state === 'running'}>
                <div className="flex items-start gap-3">
                  <ListChecksIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{task.title}</p>
                    {task.detail ? (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{task.detail}</p>
                    ) : null}
                    <ClioStatus className="mt-2" value={task.state} />
                  </div>
                </div>
              </ClioInteractiveRow>
            ))}
            {subagents.length ? (
              <AiTask
                className="rounded-lg border bg-card/40 px-3 py-2"
                defaultOpen={hasActiveSubagents}
              >
                <AiTaskTrigger title="Child agents">
                  <button
                    aria-label={`Child agents, ${subagents.length.toLocaleString()} recorded, ${childAgentStatusLabel}`}
                    className="flex w-full items-center gap-2 rounded-md py-1 text-left text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                    type="button"
                  >
                    <BoxesIcon aria-hidden="true" className="size-4 text-primary" />
                    <span className="font-medium">Child agents</span>
                    <span className="text-xs text-muted-foreground">
                      {subagents.length.toLocaleString()} recorded
                    </span>
                    <ClioStatus
                      className="ml-auto py-0.5"
                      label={childAgentStatusLabel}
                      value={hasActiveSubagents ? 'running' : 'completed'}
                    />
                  </button>
                </AiTaskTrigger>
                <AiTaskContent>
                  {subagents.map((agent) => {
                    const assignment = getChildAgentAssignment(agent);
                    return (
                      <ClioInteractiveRow
                        actions={
                          agent.child_session_id && onOpenSubagent ? (
                            <Button
                              aria-label={`Open ${agent.title} in canvas`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenSubagent(agent, 'canvas');
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
                        key={agent.id}
                        running={agent.state === 'running'}
                      >
                        <button
                          className="flex w-full items-start gap-2 text-left outline-none"
                          disabled={!agent.child_session_id || !onOpenSubagent}
                          onClick={(event) =>
                            onOpenSubagent?.(agent, event.shiftKey ? 'canvas' : 'conversation')
                          }
                          onKeyDown={(event) => {
                            if (
                              event.shiftKey &&
                              (event.key === 'Enter' || event.key === ' ') &&
                              agent.child_session_id
                            ) {
                              event.preventDefault();
                              onOpenSubagent?.(agent, 'canvas');
                            }
                          }}
                          onMouseDown={(event) => {
                            if (event.shiftKey) event.preventDefault();
                          }}
                          type="button"
                        >
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
                              className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground"
                              title={assignment.detail ?? assignment.label}
                            >
                              {assignment.label}
                            </p>
                            {agent.child_session_id && onOpenSubagent ? (
                              <p className="mt-1 text-[11px] font-medium text-primary">
                                Open conversation
                              </p>
                            ) : null}
                          </div>
                        </button>
                      </ClioInteractiveRow>
                    );
                  })}
                </AiTaskContent>
              </AiTask>
            ) : null}
            {workTools.map(({ count, key, tool }) => {
              const outcome = getToolOutcome(tool);
              return (
                <ClioInteractiveRow key={key} running={tool.state === 'running'}>
                  <div className="flex items-start gap-3">
                    <WrenchIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{getToolPresentation(tool).title}</p>
                        {count > 1 ? <Badge variant="secondary">{count} calls</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {getToolSummary(tool)}
                      </p>
                      <ClioStatus
                        className="mt-2"
                        detail={outcome.detail}
                        label={outcome.label}
                        value={outcome.value}
                      />
                    </div>
                  </div>
                </ClioInteractiveRow>
              );
            })}
            {backgroundProcesses.map((process) => (
              <ClioInteractiveRow key={process.id} running={process.live_state === 'running'}>
                <div className="flex items-start gap-3">
                  <ServerCogIcon aria-hidden="true" className="mt-0.5 size-4 text-action" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{process.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {[process.host, process.placement].filter(Boolean).join(', ') ||
                        'Background task'}
                    </p>
                    <ClioStatus className="mt-2" value={process.live_state} />
                  </div>
                </div>
              </ClioInteractiveRow>
            ))}
            {!tasks.length && !subagents.length && !tools.length && !processes.length ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No task, child-agent, or tool activity has been recorded for this session.
              </p>
            ) : null}
          </TabsContent>
          <TabsContent className="m-0 p-4" value="activity">
            {activity.length ? (
              <div className="grid gap-3">
                {hasTurnTiming || hasUnavailableTiming ? (
                  <p className="rounded-lg border border-dashed p-3 text-xs leading-5 text-muted-foreground">
                    {hasTurnTiming
                      ? 'Exact tool execution times were not recorded for some historical entries. Their containing turn time is shown instead.'
                      : 'Some historical entries have no recorded time and remain labeled Unavailable.'}
                  </p>
                ) : null}
                <Timeline defaultValue={activity.length}>
                  {activity.map((item, index) => (
                    <TimelineItem key={`${item.kind}:${item.id}`} step={index + 1}>
                      <TimelineIndicator />
                      <TimelineSeparator />
                      <TimelineDate dateTime={item.at}>
                        {item.at
                          ? `${item.timing === 'turn' ? 'Turn started ' : ''}${formatTimestamp(item.at)}`
                          : 'Unavailable'}
                      </TimelineDate>
                      <TimelineHeader className="flex items-start justify-between gap-2">
                        <TimelineTitle className="min-w-0 truncate">{item.label}</TimelineTitle>
                        <ClioStatus
                          detail={'statusDetail' in item ? item.statusDetail : undefined}
                          label={'statusLabel' in item ? item.statusLabel : undefined}
                          value={item.state}
                        />
                      </TimelineHeader>
                      <TimelineContent>{item.detail}</TimelineContent>
                    </TimelineItem>
                  ))}
                </Timeline>
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No run or tool activity is available.
              </p>
            )}
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
              policy={contextPolicy}
            />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function toolActivityContext(
  messages: readonly Message[],
): Map<string, { at: string; order: number }> {
  const context = new Map<string, { at: string; order: number }>();
  let order = 0;
  for (const message of [...messages].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  )) {
    for (const block of message.blocks) {
      if (block.type === 'tool') context.set(block.tool_id, { at: message.created_at, order });
      order += 1;
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

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}
