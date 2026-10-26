import type {
  ExecutionProvenanceDegradation,
  ExecutionProvenanceResult,
  Message,
  SubagentRun,
  ToolInvocation,
  ProvenanceProviderSummary,
  ArtifactProvenanceProviderSummary,
} from '@clio/core/v3';
import {
  ActivityIcon,
  BracesIcon,
  ChartNoAxesGanttIcon,
  CircleAlertIcon,
  Layers3Icon,
  WaypointsIcon,
} from 'lucide-react';
import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { InfoIcon } from '@/lib/icon-vocabulary';
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
import { ObservabilityWork } from './observability-work';
import { ClioStatus } from './status';
import { TechnicalDetails } from './technical-details';
import { getToolActivityTitle, getToolStatus, getToolSummary } from './tool-presentation';
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
  workPages,
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
  onOpenFlow,
  onCancelTask,
  onControlTask,
  executionProvenance,
  provenanceProviders,
  artifactProvenanceProvider,
  provenanceProvider,
  provenancePending,
  provenanceDegradation,
  onProvenanceProviderChange,
  resources,
  sessionId,
  sessions,
  familyProvenance,
  familyProvenancePending,
  onLoadFamilyProvenance,
  requestedView,
  interactions = [],
}: ClioObservabilityDockProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<ObservabilityView>(
    () => requestedView?.view ?? restoredObservabilityView(sessionId),
  );
  useEffect(() => {
    if (activeView === 'work') onLoadFamilyProvenance?.();
  }, [activeView, onLoadFamilyProvenance]);
  // Reset the restored view when the session identity itself changes, without
  // an effect: adjusting state from a prop change during render (rather than
  // in a post-commit effect) avoids the extra render-then-reset flash.
  const [viewedSessionId, setViewedSessionId] = useState(sessionId);
  const [viewedRequestKey, setViewedRequestKey] = useState(requestedView?.key);
  if (sessionId !== viewedSessionId) {
    setViewedSessionId(sessionId);
    setViewedRequestKey(requestedView?.key);
    setActiveView(requestedView?.view ?? restoredObservabilityView(sessionId));
  } else if (requestedView && requestedView.key !== viewedRequestKey) {
    setViewedRequestKey(requestedView.key);
    setActiveView(requestedView.view);
  }
  useLayoutEffect(() => {
    if (!requestedView) return;
    if (sessionId)
      window.localStorage.setItem(observabilityViewStorageKey(sessionId), requestedView.view);
  }, [requestedView, sessionId]);
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
          (((tool.name === 'spawn_agent_task' || tool.name === 'spawn_agents_parallel') &&
            processes.some((candidate) => candidate.kind === 'agent')) ||
            // A started flow is its process row, labelled as the flow's run.
            ((tool.name === 'run_flow' || tool.name === 'run_workflow') &&
              processes.some((candidate) => candidate.flow)))
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
              rootSessionId: process.root_session_id,
              ownerSessionId: process.child_session_id ?? process.owner_session_id,
              ownerLabel: process.title,
              parentSessionId: process.parent_session_id,
              taskId: process.id,
              taskPath: process.task_path,
              depth: process.depth ?? process.task_path?.length,
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
          variant="line"
          className="no-scrollbar h-9 w-full shrink-0 justify-start gap-0 overflow-x-auto overflow-y-hidden rounded-none border-b px-1.5 py-0 group-data-horizontal/tabs:h-9"
        >
          <ObservabilityTab
            icon={<Layers3Icon className="size-3.5" />}
            label="Evidence"
            value="evidence"
          />
          <ObservabilityTab
            icon={<ActivityIcon className="size-3.5" />}
            label="Timeline"
            value="activity"
          />
          <ObservabilityTab
            icon={<ChartNoAxesGanttIcon className="size-3.5" />}
            label="Gantt"
            value="work"
          />
          <ObservabilityTab
            icon={<BracesIcon className="size-3.5" />}
            label="Context"
            value="context"
          />
        </TabsList>
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <TabsContent className="m-0 grid gap-2 p-3" value="work">
            <SectionState
              error={processesError}
              label="Background work"
              pending={processesPending}
            />
            <ObservabilityWork
              familyProvenance={familyProvenance}
              familyProvenancePending={familyProvenancePending}
              sessionId={sessionId}
              sessions={sessions}
              artifacts={artifacts}
              onOpenArtifact={onOpenArtifact}
              executionProvenance={executionProvenance}
              messages={messages}
              onOpenSubagent={onOpenSubagent}
              processes={processes}
              workPages={workPages}
              runs={runs}
              subagents={subagents}
              tools={tools}
            />
          </TabsContent>
          <TabsContent className="m-0 p-4" value="activity">
            <ClioActivityTimeline items={activity} messages={messages} />
          </TabsContent>
          <TabsContent
            className="mx-auto my-0 grid w-full max-w-5xl gap-2 px-3 py-2"
            value="evidence"
          >
            <SectionState error={diffsError} label="File changes" pending={diffsPending} />
            <SectionState
              error={contextFilesError}
              label="Attached context"
              pending={contextFilesPending}
            />
            <ProvenanceSourceBar
              execution={executionProvenance}
              onReview={() => selectView('activity')}
              artifactProvider={artifactProvenanceProvider}
              degradation={provenanceDegradation}
              onProviderChange={onProvenanceProviderChange}
              pending={provenancePending}
              provider={provenanceProvider}
              providers={provenanceProviders}
            />
            <ClioEvidenceView
              onCancelTask={onCancelTask}
              onControlTask={onControlTask}
              artifacts={artifacts}
              contextFiles={contextFiles}
              diffs={diffs}
              interactions={interactions}
              messages={messages}
              onOpenArtifact={onOpenArtifact}
              onOpenDiff={onOpenDiff}
              onOpenFile={onOpenFile}
              onOpenResource={onOpenResource}
              onOpenFlow={onOpenFlow}
              onOpenSubagent={onOpenSubagent}
              processes={processes}
              workPages={workPages}
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
              resources={resources}
              onOpenResource={onOpenResource}
              tools={tools}
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
  execution,
  onReview,
  artifactProvider,
  degradation,
  onProviderChange,
  pending,
  provider,
  providers,
}: {
  execution?: ExecutionProvenanceResult;
  onReview: () => void;
  artifactProvider?: ArtifactProvenanceProviderSummary;
  degradation?: ExecutionProvenanceDegradation;
  onProviderChange?: (provider: string) => void;
  pending?: boolean;
  provider?: string;
  providers?: readonly ProvenanceProviderSummary[];
}) {
  const [open, setOpen] = useState(false);
  const selected = providers?.find((item) => item.name === provider);
  const selectedDegradation =
    degradation && degradation.provider === selected?.name ? degradation : undefined;
  const issue = evidenceRecordIssue(
    selectedDegradation ?? (!selected ? degradation : undefined),
    execution,
    selected,
  );
  return (
    <div className="grid gap-1 border-b pb-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <WaypointsIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-xs font-medium">Evidence sources</span>
          {pending ? <span className="text-xs text-muted-foreground">Loading…</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {providers && providers.length > 1 && provider && onProviderChange ? (
            <Select onValueChange={onProviderChange} value={provider}>
              <SelectTrigger aria-label="Activity record source" className="w-auto" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    <span className="flex items-center gap-2">
                      <span>{recordSourceLabel(item.name)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                aria-label={issue?.label ?? 'About evidence records'}
                title={issue?.label ?? 'About evidence records'}
                size={issue ? 'sm' : 'icon-xs'}
                variant="ghost"
                className={
                  issue ? 'h-7 px-1.5 text-xs text-warning-foreground dark:text-warning' : undefined
                }
              >
                {issue ? (
                  <>
                    <CircleAlertIcon aria-hidden="true" className="size-3.5" />
                    <span>{issue.label}</span>
                  </>
                ) : (
                  <InfoIcon aria-hidden="true" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3 text-sm leading-6">
              <p className="font-medium">{issue?.title ?? 'About these records'}</p>
              <p>
                {issue?.explanation ??
                  'This view brings together saved activity, file use and artifact relationships for this conversation.'}
              </p>
              {issue ? <p className="text-muted-foreground">{issue.consequence}</p> : null}
              <dl className="grid gap-2 border-t pt-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Activity history</dt>
                  <dd>{selected ? recordSourceLabel(selected.name) : 'Source unavailable'}</dd>
                </div>
                {artifactProvider ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Artifact relationships</dt>
                    <dd>
                      {artifactProvider.provider === 'native'
                        ? 'CLIO artifact registry'
                        : recordSourceLabel(artifactProvider.provider)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() => {
                  setOpen(false);
                  onReview();
                }}
              >
                View activity timeline
              </Button>
              <TechnicalDetails title="Technical details" className="text-xs text-muted-foreground">
                <dl className="grid gap-1">
                  <div>Provider: {selected?.name ?? provider ?? 'unknown'}</div>
                  <div>Source: {selected?.source ?? 'unknown'}</div>
                  <div>Source availability: {selected?.status ?? 'unknown'}</div>
                  {artifactProvider ? (
                    <div>Artifact provider: {artifactProvider.provider}</div>
                  ) : null}
                </dl>
                {selectedDegradation ? (
                  <p className="mt-2 break-words">{selectedDegradation.reason}</p>
                ) : null}
                {selected?.health.last_error ? (
                  <p className="mt-2 break-words">Recording error: {selected.health.last_error}</p>
                ) : null}
              </TechnicalDetails>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

function recordSourceLabel(provider: string): string {
  return (
    (
      { native: 'Built-in CLIO records', flowcept: 'Flowcept', cmf: 'CMF' } as Record<
        string,
        string
      >
    )[provider] ?? provider
  );
}

/** Explain record coverage separately from whether its storage service can be queried. */
function evidenceRecordIssue(
  degradation: ExecutionProvenanceDegradation | undefined,
  execution: ExecutionProvenanceResult | undefined,
  source: ProvenanceProviderSummary | undefined,
): { label: string; title: string; explanation: string; consequence: string } | undefined {
  if (execution?.truncated)
    return {
      label: 'Limited history',
      title: 'Some activity is not shown',
      explanation: 'The recording source returned a limited number of records.',
      consequence:
        'This view cannot show the full sequence of work or all relationships between records.',
    };
  if (degradation?.partial && source?.name === 'native' && execution?.complete === false)
    return {
      label: 'Unfinished records',
      title: 'Some activity has no recorded finish',
      explanation: 'It may still be running, or its final update may be missing.',
      consequence: 'The history cannot confirm completion or duration for those records.',
    };
  if (degradation?.partial || source?.status === 'partial')
    return {
      label: 'Partial history',
      title: 'Activity history is incomplete',
      explanation:
        'The recording source cannot confirm that this view contains the full activity history.',
      consequence:
        'Some events or relationships may be missing. Review the available records before relying on the full sequence or timings.',
    };
  if (source && providerStatus(source.status, source.queryable) === 'degraded')
    return {
      label: 'Recording needs attention',
      title: 'Some records may be missing',
      explanation: 'The source can be read, but it reports a recording problem.',
      consequence:
        'Review the available activity with that limitation in mind. Technical details contain the source diagnostic.',
    };
  if (degradation || (source && providerStatus(source.status, source.queryable) !== 'healthy'))
    return {
      label: 'Recording unavailable',
      title: 'Activity records could not be read',
      explanation: 'The selected recording source is unavailable or reports a problem.',
      consequence:
        'The evidence shown here may be limited to records available from other parts of the conversation. Technical details contain the source diagnostic.',
    };
  return undefined;
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
    <TabsTrigger
      aria-label={label}
      className="h-full min-w-max shrink-0 gap-1 px-1.5 text-xs focus-visible:ring-inset group-data-horizontal/tabs:after:bottom-0"
      value={value}
    >
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
