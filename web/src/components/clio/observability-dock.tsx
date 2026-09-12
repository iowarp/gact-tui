import type {
  Artifact,
  AsyncProcess,
  ContextFile,
  ContextFrame,
  ContextSnapshot,
  ExecutionProvenanceDegradation,
  ExecutionProvenanceResult,
  InfrastructureDependency,
  Message,
  PendingInteraction,
  Run,
  RunState,
  SessionDiff,
  SubagentRun,
  Task,
  ToolInvocation,
  ProvenanceProviderSummary,
  ArtifactProvenanceProviderSummary,
  WorkspaceResource,
} from '@clio/core/v3';
import {
  ActivityIcon,
  BrainCircuitIcon,
  BoxesIcon,
  BracesIcon,
  ChartNoAxesGanttIcon,
  Layers3Icon,
  PanelRightOpenIcon,
  WaypointsIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useContainerQuery } from '@/hooks/use-container-query';
import type { ClioContextTarget } from '@/lib/context-targets';
import { formatDuration } from '@/lib/format';
import {
  getPresentationOverrideCount,
  subscribePresentationOverrides,
} from '@/lib/presentation-overrides';
import { getChildAgentAssignment } from './child-agent-presentation';
import { ClioContextCanvasPanel } from './context-canvas-panel';
import { ClioInteractiveRow } from './interactive-row';
import { ClioInfrastructurePreparation } from './infrastructure-preparation';
import { infrastructurePreparationLabel } from './infrastructure-preparation-label';
import {
  asyncProcessDetail,
  agentInteractionActivityItems,
  childProjectionActivityItems,
  ClioActivityTimeline,
  type ObservabilityActivityItem,
} from './observability-activity';
import { ClioEvidenceView } from './observability-evidence';
import { ClioProcessLanes } from './observability-processes';
import { ClioStatus, type ClioStatusValue } from './status';
import {
  getToolActivityTitle,
  getToolPresentation,
  getToolStatus,
  getToolSummary,
} from './tool-presentation';
import type { SubagentOpenTarget } from './subagent-card';

export interface ClioObservabilityDockProps {
  artifacts: readonly Artifact[];
  contextFiles: readonly ContextFile[];
  contextFrames: readonly ContextFrame[];
  diffs: readonly SessionDiff[];
  messages: readonly Message[];
  interactions?: readonly PendingInteraction[];
  infrastructureDependencies?: readonly InfrastructureDependency[];
  activeTurnId?: string;
  activeTurnResponded?: boolean;
  processes: readonly AsyncProcess[];
  tasks: readonly Task[];
  tools: readonly ToolInvocation[];
  runs: readonly Run[];
  subagents: readonly SubagentRun[];
  context?: ContextSnapshot;
  contextError?: string;
  contextFilesError?: string;
  contextFilesPending?: boolean;
  contextFramesError?: string;
  contextFramesPending?: boolean;
  diffsError?: string;
  diffsPending?: boolean;
  processesError?: string;
  processesPending?: boolean;
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
  onOpenResource?: (resource: WorkspaceResource) => void;
  sessionState?: RunState;
  sessionId?: string;
  executionProvenance?: ExecutionProvenanceResult;
  provenanceProviders?: readonly ProvenanceProviderSummary[];
  artifactProvenanceProvider?: ArtifactProvenanceProviderSummary;
  provenanceProvider?: string;
  provenancePending?: boolean;
  provenanceDegradation?: ExecutionProvenanceDegradation;
  onProvenanceProviderChange?: (provider: string) => void;
  resources?: readonly WorkspaceResource[];
}

type ObservabilityView = 'evidence' | 'activity' | 'work' | 'context';

const OBSERVABILITY_VIEWS = new Set<ObservabilityView>(['evidence', 'activity', 'work', 'context']);

function observabilityViewStorageKey(sessionId: string): string {
  return `clio.observability-view:${sessionId}`;
}

function restoredObservabilityView(sessionId: string | undefined): ObservabilityView {
  if (!sessionId || typeof window === 'undefined') return 'evidence';
  const stored = window.localStorage.getItem(observabilityViewStorageKey(sessionId));
  return OBSERVABILITY_VIEWS.has(stored as ObservabilityView)
    ? (stored as ObservabilityView)
    : 'evidence';
}

function isActiveWork(state: string): boolean {
  return ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(state);
}

export function ClioObservabilityDock(props: ClioObservabilityDockProps) {
  const [childAgentsOpen, setChildAgentsOpen] = useState(false);
  const presentationOverrideCount = useSyncExternalStore(
    subscribePresentationOverrides,
    () => (props.sessionId ? getPresentationOverrideCount(props.sessionId) : 0),
    () => 0,
  );
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
  const sessionNeedsAttention =
    props.sessionState === 'waiting_permission' ||
    props.sessionState === 'waiting_user' ||
    props.sessionState === 'failed';
  const showDockStatusBadge = Boolean(
    activeActivityCount || sessionActive || sessionNeedsAttention,
  );
  const dockStatusValue: ClioStatusValue = props.sessionState ?? 'running';
  const currentAssistantStreaming = props.messages.some(
    (message) =>
      message.role === 'assistant' &&
      message.blocks.some(
        (block) =>
          (block.type === 'text' || block.type === 'reasoning') && block.streaming === true,
      ),
  );
  const assistantResponding = currentAssistantStreaming || props.activeTurnResponded === true;
  const startupVisible = Boolean(
    sessionActive && !currentTool && !latestActiveProcess && !currentTask && !assistantResponding,
  );
  const startupLabel = infrastructurePreparationLabel(props.infrastructureDependencies ?? []);
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
            ? assistantResponding
              ? 'Agent is responding'
              : startupLabel
            : 'Session details';
  const dockStatus = activeActivityCount
    ? `${activeActivityCount} active`
    : sessionActive
      ? assistantResponding
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
        {startupVisible ? (
          <ClioInfrastructurePreparation dependencies={props.infrastructureDependencies ?? []} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-left font-medium">{dockLabel}</span>
        )}
        {presentationOverrideCount ? (
          <ClioStatus
            className="hidden py-0.5 sm:inline-flex"
            label={`${presentationOverrideCount} display ${presentationOverrideCount === 1 ? 'fallback' : 'fallbacks'}`}
            value="degraded"
          />
        ) : null}
        {showDockStatusBadge ? (
          <ClioStatus className="shrink-0 py-0.5" label={dockStatus} value={dockStatusValue} />
        ) : null}
        <PanelRightOpenIcon aria-hidden="true" className="size-3.5 shrink-0" />
      </Button>
      {/* Always mounted (not conditionally toggled) so it exists before its text changes, and
          outside the Button so its content never factors into the Button's accessible name. */}
      <span aria-live="polite" className="sr-only">
        {startupVisible ? startupLabel : dockStatus}
      </span>
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
  contextFilesError,
  contextFilesPending,
  contextFramesError,
  contextFramesPending,
  contextTargets,
  diffsError,
  diffsPending,
  processesError,
  processesPending,
  selectedContextTargetId,
  compactContextPending,
  contextPreferencesPending,
  onCompactContext,
  onContextTargetChange,
  onUpdateContextPreferences,
  onOpenArtifact,
  onOpenDiff,
  onOpenFile,
  onOpenResource,
  onOpenSubagent,
  executionProvenance,
  provenanceProviders,
  artifactProvenanceProvider,
  provenanceProvider,
  provenancePending,
  provenanceDegradation,
  onProvenanceProviderChange,
  resources,
  sessionId,
  interactions = [],
}: ClioObservabilityDockProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<ObservabilityView>(() =>
    restoredObservabilityView(sessionId),
  );
  // Reset the restored view when the session identity itself changes, without
  // an effect: adjusting state from a prop change during render (rather than
  // in a post-commit effect) avoids the extra render-then-reset flash.
  const [viewedSessionId, setViewedSessionId] = useState(sessionId);
  if (sessionId !== viewedSessionId) {
    setViewedSessionId(sessionId);
    setActiveView(restoredObservabilityView(sessionId));
  }
  const hasMediumNavigation = useContainerQuery(surfaceRef, 320);
  const hasWideNavigation = useContainerQuery(surfaceRef, 520);
  const toolTurnContext = useMemo(() => toolActivityContext(messages), [messages]);
  const subagentTurnContext = useMemo(() => subagentActivityContext(messages), [messages]);
  const waitTurnContext = useMemo(
    () => waitActivityContext(tools, toolTurnContext),
    [toolTurnContext, tools],
  );
  const activity = useMemo<ObservabilityActivityItem[]>(() => {
    const projected = executionProvenance?.session_lineage;
    const lineageBySession = new Map(projected?.map((owner) => [owner.session_id, owner]) ?? []);
    const processByOwner = new Map(
      processes
        .filter(
          (process) =>
            process.kind === 'agent' && (process.owner_session_id || process.child_session_id),
        )
        .map((process) => [process.owner_session_id ?? process.child_session_id!, process]),
    );
    const knownToolIds = new Set(tools.map((tool) => tool.id));
    const items: ObservabilityActivityItem[] = [
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
      ...tools.flatMap((tool): ObservabilityActivityItem[] => {
        const eventAt = tool.completed_at ?? tool.started_at;
        const turnContext = toolTurnContext.get(tool.id);
        const process = processByOwner.get(tool.session_id);
        const owner = lineageBySession.get(tool.session_id);
        // Delegation is already represented by the branch-open lifecycle nodes.
        // Keeping a timestamp-less spawn tool beside those nodes repeats the same
        // event and can sort it away from the delegation it caused.
        if (
          !turnContext &&
          (tool.name === 'spawn_agent_task' || tool.name === 'spawn_agents_parallel') &&
          processes.some((candidate) => candidate.kind === 'agent')
        ) {
          return [];
        }
        return [
          {
            id: tool.id,
            kind: 'tool',
            label: getToolActivityTitle(tool),
            detail: getToolSummary(tool),
            state: getToolStatus(tool),
            at: eventAt ?? turnContext?.at,
            groupId: turnContext?.turnId,
            timing: eventAt ? 'event' : turnContext ? 'turn' : undefined,
            transcriptMessageId: turnContext?.messageId,
            rootSessionId: executionProvenance?.root_session_id ?? executionProvenance?.session_id,
            ownerSessionId: tool.session_id,
            ownerLabel: owner?.label,
            parentSessionId: owner?.parent_session_id,
            taskId: process?.id ?? owner?.task_id,
            taskPath: process?.task_path ?? owner?.task_path,
            depth: owner?.depth ?? process?.task_path?.length,
            causalOrder: turnContext?.causalOrder,
            causalMessageId: turnContext?.messageId,
          },
        ];
      }),
      // An empty session_lineage ([]) is a legal "no children" answer, not a
      // missing read — it must still fall back to the plain processes list, or
      // every process the Gantt shows below renders zero rows here.
      ...(projected && projected.length > 0
        ? childProjectionActivityItems(executionProvenance, processes, knownToolIds, onOpenFile)
        : processes.map(
            (process): ObservabilityActivityItem => ({
              id: process.id,
              kind: 'process',
              label: process.title,
              detail: asyncProcessDetail(process),
              state: process.live_state,
              at: process.updated_at ?? process.created_at,
              groupId:
                process.parent_turn_id ??
                (process.kind === 'mcp-task' ? `mcp-task:${process.id}` : undefined),
              timing: process.updated_at || process.created_at ? 'event' : undefined,
            }),
          )),
      ...agentInteractionActivityItems(
        interactions,
        processes,
        executionProvenance?.root_session_id ?? executionProvenance?.session_id,
      ),
    ];
    return items
      .map((item) => {
        const lifecycleContext =
          item.taskId && item.lifecycle && item.lifecycle !== 'event'
            ? subagentTurnContext.get(`${item.taskId}:${item.lifecycle}`)
            : undefined;
        const waitContext =
          item.taskId && item.lifecycle === 'close' ? waitTurnContext.get(item.taskId) : undefined;
        const orderedItem = waitContext
          ? {
              ...item,
              causalOrder: waitContext.causalOrder - 0.5,
              causalMessageId: waitContext.messageId,
              transcriptMessageId: item.transcriptMessageId ?? waitContext.messageId,
            }
          : lifecycleContext
            ? {
                ...item,
                causalOrder: lifecycleContext.causalOrder,
                causalMessageId: lifecycleContext.messageId,
                transcriptMessageId: item.transcriptMessageId ?? lifecycleContext.messageId,
              }
            : item;
        const subagent = findSubagent(subagents, item.taskId, item.ownerSessionId);
        return subagent && onOpenSubagent
          ? {
              ...orderedItem,
              onOpen: (target: SubagentOpenTarget) => onOpenSubagent(subagent, target),
            }
          : orderedItem;
      })
      .sort((left, right) => {
        const byTime = (right.at ?? '').localeCompare(left.at ?? '');
        return byTime;
      });
  }, [
    executionProvenance,
    interactions,
    onOpenFile,
    onOpenSubagent,
    processes,
    subagentTurnContext,
    runs,
    subagents,
    toolTurnContext,
    tools,
    waitTurnContext,
  ]);

  const selectView = (value: string) => {
    if (!OBSERVABILITY_VIEWS.has(value as ObservabilityView)) return;
    const next = value as ObservabilityView;
    setActiveView(next);
    if (sessionId) {
      window.localStorage.setItem(observabilityViewStorageKey(sessionId), next);
    }
  };
  return (
    <div className="h-full min-h-0 min-w-0" ref={surfaceRef}>
      <Tabs className="h-full min-h-0 gap-0" onValueChange={selectView} value={activeView}>
        <TabsList
          aria-label="Observability view"
          className={`mx-3 mt-2 grid h-auto! w-auto shrink-0 gap-1 p-1 ${
            hasWideNavigation ? 'grid-cols-4' : hasMediumNavigation ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          <ObservabilityTab icon={<Layers3Icon />} label="Evidence" value="evidence" />
          <ObservabilityTab icon={<ActivityIcon />} label="Timeline" value="activity" />
          <ObservabilityTab icon={<ChartNoAxesGanttIcon />} label="Gantt" value="work" />
          <ObservabilityTab icon={<BracesIcon />} label="Context" value="context" />
        </TabsList>
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <TabsContent className="m-0 grid gap-2 p-3" value="work">
            <SectionState
              error={processesError}
              label="Background work"
              pending={processesPending}
            />
            <ClioProcessLanes
              executionProvenance={executionProvenance}
              messages={messages}
              onOpenSubagent={onOpenSubagent}
              processes={processes}
              runs={runs}
              subagents={subagents}
              tools={tools}
            />
          </TabsContent>
          <TabsContent className="m-0 p-4" value="activity">
            <ClioActivityTimeline items={activity} messages={messages} />
          </TabsContent>
          <TabsContent className="m-0 grid gap-2 p-4" value="evidence">
            <SectionState error={diffsError} label="File changes" pending={diffsPending} />
            <SectionState
              error={contextFilesError}
              label="Attached context"
              pending={contextFilesPending}
            />
            <ProvenanceSourceBar
              artifactProvider={artifactProvenanceProvider}
              degradation={provenanceDegradation}
              onProviderChange={onProvenanceProviderChange}
              pending={provenancePending}
              provider={provenanceProvider}
              providers={provenanceProviders}
            />
            <ClioEvidenceView
              artifacts={artifacts}
              contextFiles={contextFiles}
              diffs={diffs}
              interactions={interactions}
              messages={messages}
              onOpenArtifact={onOpenArtifact}
              onOpenDiff={onOpenDiff}
              onOpenFile={onOpenFile}
              onOpenResource={onOpenResource}
              onOpenSubagent={onOpenSubagent}
              processes={processes}
              runs={runs}
              subagents={subagents}
              tasks={tasks}
              executionProvenance={executionProvenance}
              artifactProvenanceProvider={artifactProvenanceProvider}
              provenanceDegradation={provenanceDegradation}
              provenanceProvider={provenanceProviders?.find(
                (provider) => provider.name === provenanceProvider,
              )}
              resources={resources}
              tools={tools}
            />
          </TabsContent>
          <TabsContent className="m-0 grid gap-4 p-4" value="context">
            <SectionState
              error={contextFilesError}
              label="Attached context"
              pending={contextFilesPending}
            />
            <SectionState
              error={contextFramesError}
              label="Context frames"
              pending={contextFramesPending}
            />
            <ClioContextCanvasPanel
              compactPending={compactContextPending}
              context={context}
              error={contextError}
              files={contextFiles}
              frames={contextFrames}
              messages={messages}
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

function ProvenanceSourceBar({
  artifactProvider,
  degradation,
  onProviderChange,
  pending,
  provider,
  providers,
}: {
  artifactProvider?: ArtifactProvenanceProviderSummary;
  degradation?: ExecutionProvenanceDegradation;
  onProviderChange?: (provider: string) => void;
  pending?: boolean;
  provider?: string;
  providers?: readonly ProvenanceProviderSummary[];
}) {
  const selected = providers?.find((item) => item.name === provider);
  const selectedDegradation =
    degradation && degradation.provider === selected?.name ? degradation : undefined;
  const selectedStatus = selected
    ? selectedDegradation
      ? 'degraded'
      : providerStatus(selected.status, selected.queryable)
    : undefined;
  return (
    <div className="grid gap-1 px-1 py-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <WaypointsIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className="shrink-0 text-sm font-medium">Provenance</span>
          <span className="truncate text-xs text-muted-foreground">
            {pending ? 'Discovering providers' : (selected?.source ?? 'Unavailable')}
          </span>
          {artifactProvider && artifactProvider.provider !== selected?.name ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              Artifacts: {artifactProvider.provider}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {providers?.length && provider ? (
            <Select onValueChange={onProviderChange} value={provider}>
              <SelectTrigger
                aria-label="Execution provenance provider"
                className="w-auto"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    <span className="flex items-center gap-2">
                      <span>{item.name}</span>
                      <span className="text-muted-foreground">{item.status}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {selected ? (
            <ClioStatus
              compact
              detail={selectedDegradation?.reason ?? selected.status}
              label={`${selected.name} provenance ${selectedDegradation ? 'degraded' : selected.status}`}
              value={selectedStatus ?? 'unavailable'}
            />
          ) : null}
        </div>
      </div>
      {degradation ? (
        // Small body text needs the 4.5:1 AA contrast plain text-warning
        // doesn't clear against a light background (axe color-contrast,
        // serious); text-warning-foreground is the established fix already
        // used for warning text elsewhere (document-workspace.tsx,
        // model-picker.tsx).
        <p className="pl-6 text-xs leading-5 text-warning-foreground dark:text-warning">
          {degradation.reason}
        </p>
      ) : null}
    </div>
  );
}

function providerStatus(
  status: string,
  queryable: boolean,
): 'healthy' | 'degraded' | 'unavailable' {
  if (!queryable || status === 'unavailable' || status === 'disabled') return 'unavailable';
  if (status === 'degraded' || status === 'partial') return 'degraded';
  return 'healthy';
}

/** States an observability section the service could not deliver, or has not delivered yet. */
function SectionState({
  error,
  label,
  pending,
}: {
  error?: string;
  label: string;
  pending?: boolean;
}) {
  if (error)
    return <ClioStatus detail={error} label={`${label} unavailable`} value="unavailable" />;
  if (pending) return <ClioStatus label={`Loading ${label.toLowerCase()}`} value="connecting" />;
  return null;
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

interface TranscriptActivityContext {
  at: string;
  causalOrder: number;
  messageId: string;
  turnId?: string;
}

function orderedMessageBlocks(message: Message) {
  return message.blocks
    .map((block, index) => ({ block, index }))
    .sort((left, right) => {
      const leftSequence = left.block.sequence ?? left.index;
      const rightSequence = right.block.sequence ?? right.index;
      return leftSequence - rightSequence || left.index - right.index;
    });
}

function toolActivityContext(messages: readonly Message[]): Map<string, TranscriptActivityContext> {
  const context = new Map<string, TranscriptActivityContext>();
  let turnId: string | undefined;
  let causalOrder = 0;
  for (const message of [...messages].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  )) {
    if (message.role === 'user') turnId = message.id;
    for (const { block } of orderedMessageBlocks(message)) {
      causalOrder += 1;
      if (block.type === 'tool')
        context.set(block.tool_id, {
          at: message.created_at,
          causalOrder,
          messageId: message.id,
          turnId,
        });
    }
  }
  return context;
}

function subagentActivityContext(
  messages: readonly Message[],
): Map<string, TranscriptActivityContext> {
  const context = new Map<string, TranscriptActivityContext>();
  let turnId: string | undefined;
  let causalOrder = 0;
  for (const message of [...messages].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  )) {
    if (message.role === 'user') turnId = message.id;
    for (const { block } of orderedMessageBlocks(message)) {
      causalOrder += 1;
      if (block.type !== 'subagent') continue;
      const lifecycle = block.stage === 'delegate.started' ? 'open' : 'close';
      context.set(`${block.subagent_id}:${lifecycle}`, {
        at: message.created_at,
        causalOrder,
        messageId: message.id,
        turnId,
      });
    }
  }
  return context;
}

function waitActivityContext(
  tools: readonly ToolInvocation[],
  toolContext: ReadonlyMap<string, TranscriptActivityContext>,
): Map<string, TranscriptActivityContext> {
  const context = new Map<string, TranscriptActivityContext>();
  for (const tool of tools) {
    if (tool.name !== 'wait_agent_tasks') continue;
    const waitContext = toolContext.get(tool.id);
    if (!waitContext || !tool.input || typeof tool.input !== 'object') continue;
    const taskIds = Reflect.get(tool.input, 'task_ids');
    if (!Array.isArray(taskIds)) continue;
    for (const taskId of taskIds) {
      if (typeof taskId === 'string') context.set(taskId, waitContext);
    }
  }
  return context;
}

function findSubagent(
  subagents: readonly SubagentRun[],
  taskId?: string,
  ownerSessionId?: string,
): SubagentRun | undefined {
  return subagents.find(
    (candidate) =>
      Boolean(taskId && candidate.id === taskId) ||
      Boolean(ownerSessionId && candidate.child_session_id === ownerSessionId),
  );
}
