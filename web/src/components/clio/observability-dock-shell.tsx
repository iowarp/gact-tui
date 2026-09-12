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
import { ActivityIcon, BrainCircuitIcon, BoxesIcon, PanelRightOpenIcon } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { ClioContextTarget } from '@/lib/context-targets';
import {
  getPresentationOverrideCount,
  subscribePresentationOverrides,
} from '@/lib/presentation-overrides';
import { getChildAgentAssignment } from './child-agent-presentation';
import { ClioInteractiveRow } from './interactive-row';
import { ClioInfrastructurePreparation } from './infrastructure-preparation';
import { infrastructurePreparationLabel } from './infrastructure-preparation-label';
import { ClioStatus, type ClioStatusValue } from './status';
import { getToolPresentation } from './tool-presentation';
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
