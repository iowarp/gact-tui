import type {
  Artifact,
  AsyncProcess,
  ContextFile,
  ContextFrame,
  ContextSnapshot,
  Message,
  Run,
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
  ChevronUpIcon,
  Layers3Icon,
  ListChecksIcon,
  PanelRightOpenIcon,
  ServerCogIcon,
  WrenchIcon,
} from 'lucide-react';
import { useMemo, useRef } from 'react';
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
}

type ActivityItem =
  | { id: string; kind: 'run'; label: string; detail: string; state: Run['state']; at?: string }
  | {
      id: string;
      kind: 'tool';
      label: string;
      detail: string;
      state: ClioStatusValue;
      statusLabel?: string;
      statusDetail?: string;
      at?: string;
    }
  | {
      id: string;
      kind: 'process';
      label: string;
      detail: string;
      state: AsyncProcess['live_state'];
      at?: string;
    };

export function ClioObservabilityDock(props: ClioObservabilityDockProps) {
  const activeItems =
    props.tasks.filter((task) => ['queued', 'running'].includes(task.state)).length +
    props.tools.filter((tool) => ['pending', 'running'].includes(tool.state)).length +
    props.runs.filter((run) => ['queued', 'running'].includes(run.state)).length +
    props.subagents.filter((agent) => ['queued', 'running'].includes(agent.state)).length +
    props.processes.filter(
      (process) =>
        process.kind === 'mcp-task' && ['queued', 'running'].includes(process.live_state),
    ).length;
  const currentTool = props.tools.findLast((tool) => ['pending', 'running'].includes(tool.state));
  const currentTask = props.tasks.findLast((task) => ['queued', 'running'].includes(task.state));

  return (
    <div className="min-w-0 flex-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            className="h-7 w-full min-w-0 justify-start gap-2 rounded-md px-2 text-muted-foreground hover:text-foreground"
            size="sm"
            type="button"
            variant="ghost"
          >
            {activeItems ? (
              <BrainCircuitIcon aria-hidden="true" className="size-4 text-info" />
            ) : (
              <ActivityIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-left font-medium">
              {currentTool
                ? getToolPresentation(currentTool).title
                : (currentTask?.title ??
                  (activeItems ? 'Agent work in progress' : 'Session details'))}
            </span>
            <ClioStatus
              className="hidden py-0.5 sm:inline-flex"
              label={activeItems ? `${activeItems} active` : 'Up to date'}
              value={activeItems ? 'running' : 'completed'}
            />
            <ChevronUpIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="pointer-events-auto w-[min(92vw,440px)] gap-0 overflow-hidden p-0"
          side="top"
          sideOffset={8}
        >
          <PopoverHeader className="border-b px-4 py-3">
            <PopoverTitle>Session details</PopoverTitle>
            <PopoverDescription>
              Agent work, child agents, tool evidence, activity, and context.
            </PopoverDescription>
          </PopoverHeader>
          <ObservabilityContent {...props} />
          {props.onOpenCanvas ? (
            <div className="border-t p-3">
              <Button
                className="w-full justify-between"
                onClick={props.onOpenCanvas}
                type="button"
                variant="outline"
              >
                Open full session view
                <PanelRightOpenIcon aria-hidden="true" className="size-4" />
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
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
  presentation = 'popover',
}: ClioObservabilityDockProps & { presentation?: 'popover' | 'canvas' }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hasSingleRowTabs = useContainerQuery(surfaceRef, 400);
  const hasGraphSpace = useContainerQuery(surfaceRef, 640);
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
          }),
        ),
        ...tools.map((tool): ActivityItem => {
          const outcome = getToolOutcome(tool);
          return {
            id: tool.id,
            kind: 'tool',
            label: getToolPresentation(tool).title,
            detail: getToolSummary(tool),
            state: outcome.value,
            statusLabel: outcome.label,
            statusDetail: outcome.detail,
            at: tool.completed_at ?? tool.started_at,
          };
        }),
        ...processes.map(
          (process): ActivityItem => ({
            id: process.id,
            kind: 'process',
            label: process.title,
            detail:
              process.kind === 'agent'
                ? `Child agent${process.placement ? `, ${process.placement}` : ''}`
                : `Background task${process.host ? `, ${process.host}` : ''}`,
            state: process.live_state,
            at: process.updated_at ?? process.created_at,
          }),
        ),
      ].sort((left, right) => (right.at ?? '').localeCompare(left.at ?? '')),
    [processes, runs, tools],
  );
  const backgroundProcesses = processes.filter((process) => process.kind === 'mcp-task');
  const workTools = useMemo(() => groupToolsForWork(tools), [tools]);

  return (
    <div className={cn('min-w-0', presentation === 'canvas' && 'h-full min-h-0')} ref={surfaceRef}>
      <Tabs
        className={cn('gap-0', presentation === 'canvas' && 'h-full min-h-0')}
        defaultValue="work"
      >
        <div className="border-b px-3 py-2">
          <TabsList
            className={cn(
              'grid h-auto w-full bg-muted/60',
              hasSingleRowTabs ? 'grid-cols-4' : 'grid-cols-2',
            )}
          >
            <TabsTrigger value="work">
              <ListChecksIcon aria-hidden="true" /> Work
            </TabsTrigger>
            <TabsTrigger value="activity">
              <ActivityIcon aria-hidden="true" /> Activity
            </TabsTrigger>
            <TabsTrigger value="evidence">
              <Layers3Icon aria-hidden="true" /> Evidence
            </TabsTrigger>
            <TabsTrigger value="context">
              <BracesIcon aria-hidden="true" /> Context
            </TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea
          className={presentation === 'canvas' ? 'min-h-0 flex-1' : 'h-[min(58vh,460px)]'}
        >
          <TabsContent className="m-0 grid gap-2 p-3" value="work">
            {presentation === 'canvas' ? <ClioProcessLanes processes={processes} /> : null}
            {presentation === 'canvas' && hasGraphSpace ? (
              <ClioWorkflowGraph
                onOpenSubagent={onOpenSubagent}
                processes={processes}
                subagents={subagents}
              />
            ) : presentation === 'canvas' && processes.some((process) => process.kind === 'agent') ? (
              <p className="rounded-lg border border-dashed p-3 text-xs leading-5 text-muted-foreground">
                The delegation map is available in a wider canvas. Maximize or widen this panel to
                explore the topology.
              </p>
            ) : null}
            {presentation === 'canvas' && processes.length ? (
              <ProcessSummary processes={processes} />
            ) : null}
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
            {subagents.map((agent) => (
              <ClioInteractiveRow
                actions={
                  agent.child_session_id && onOpenSubagent ? (
                    <Button
                      aria-label={`Open ${agent.title} in canvas`}
                      onClick={() => onOpenSubagent(agent, 'canvas')}
                      size="icon-xs"
                      title="Open in canvas"
                      variant="ghost"
                    >
                      <PanelRightOpenIcon aria-hidden="true" />
                    </Button>
                  ) : undefined
                }
                key={agent.id}
                running={agent.state === 'running'}
              >
                <button
                  className="flex w-full items-start gap-3 text-left outline-none"
                  disabled={!agent.child_session_id || !onOpenSubagent}
                  onClick={(event) =>
                    onOpenSubagent?.(agent, event.shiftKey ? 'canvas' : 'conversation')
                  }
                  onMouseDown={(event) => {
                    if (event.shiftKey) event.preventDefault();
                  }}
                  type="button"
                >
                  <BoxesIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{agent.title}</p>
                    {agent.summary ? (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {agent.summary}
                      </p>
                    ) : null}
                    <ClioStatus className="mt-2" value={agent.state} />
                    {agent.child_session_id && onOpenSubagent ? (
                      <p className="mt-2 text-xs font-medium text-primary">Open conversation →</p>
                    ) : null}
                  </div>
                </button>
              </ClioInteractiveRow>
            ))}
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
              <Timeline defaultValue={activity.length}>
                {activity.map((item, index) => (
                  <TimelineItem key={`${item.kind}:${item.id}`} step={index + 1}>
                    <TimelineIndicator />
                    <TimelineSeparator />
                    <TimelineDate dateTime={item.at}>
                      {item.at ? formatTimestamp(item.at) : 'Time unavailable'}
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

function ObservabilityContent(props: ClioObservabilityDockProps) {
  return <ClioObservabilityView {...props} presentation="popover" />;
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
