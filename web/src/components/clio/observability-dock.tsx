import type {
  ExecutionProvenanceDegradation,
  Message,
  SubagentRun,
  ToolInvocation,
  ProvenanceProviderSummary,
  ArtifactProvenanceProviderSummary,
} from '@clio/core/v3';
import { ActivityIcon, BracesIcon, ChartNoAxesGanttIcon, Layers3Icon, WaypointsIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
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
import { formatDuration } from '@/lib/format';
import { ClioContextCanvasPanel } from './context-canvas-panel';
import {
  asyncProcessDetail,
  agentInteractionActivityItems,
  childProjectionActivityItems,
  ClioActivityTimeline,
  type ObservabilityActivityItem,
} from './observability-activity';
import { ClioEvidenceView } from './observability-evidence';
import { ClioProcessLanes } from './observability-processes';
import { ClioStatus } from './status';
import {
  getToolActivityTitle,
  getToolStatus,
  getToolSummary,
} from './tool-presentation';
import type { SubagentOpenTarget } from './subagent-card';

import type { ObservabilityView } from './observability-view-storage';
export type { ObservabilityView } from './observability-view-storage';
import {
  OBSERVABILITY_VIEWS,
  observabilityViewStorageKey,
  restoredObservabilityView,
} from './observability-view-storage';

import type { ClioObservabilityDockProps } from './observability-dock-shell';
export { ClioObservabilityDock, type ClioObservabilityDockProps } from './observability-dock-shell';

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
