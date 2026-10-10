import type {
  Artifact,
  AsyncProcess,
  ContextFile,
  ContextFrame,
  ContextSnapshot,
  ExecutionProvenanceDegradation,
  ExecutionProvenanceResult,
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
import { artifactDeliverables } from '@/lib/artifact-presentation';
import { BoxesIcon, PanelRightOpenIcon } from 'lucide-react';
import { useState, useSyncExternalStore, type RefObject } from 'react';
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
import { SessionEvidencePopover } from './session-evidence-popover';
import { EvidenceLayoutIcon } from './evidence-layout-icon';
import { ClioStatus, clioStatusLabel, type ClioStatusValue } from './status';
import { getToolPresentation } from './tool-presentation';
import type { SubagentOpenTarget } from './subagent-card';
import type { ObservabilityView } from './observability-view-storage';

export interface ClioObservabilityDockProps {
  artifacts: readonly Artifact[];
  contextFiles: readonly ContextFile[];
  contextFrames: readonly ContextFrame[];
  diffs: readonly SessionDiff[];
  messages: readonly Message[];
  interactions?: readonly PendingInteraction[];
  processes: readonly AsyncProcess[];
  onCancelTask?: (task: AsyncProcess) => Promise<void>;
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
  onOpenCanvas?: (view?: ObservabilityView) => void;
  requestedView?: { key: string; view: ObservabilityView };
  onOpenWork?: () => void;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenDiff?: (diff: SessionDiff) => void;
  onOpenFile?: (path: string) => void;
  onOpenResource?: (resource: WorkspaceResource) => void;
  sessionState?: RunState;
  sessionId?: string;
  workspaceId?: string;
  surfaceRef?: RefObject<HTMLElement | null>;
  toolbar?: boolean;
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
  return [
    'queued',
    'running',
    'working',
    'input_required',
    'waiting_permission',
    'waiting_user',
  ].includes(state);
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
    activeActivityCount || sessionActive || sessionNeedsAttention || activityCount,
  );
  const dockStatusValue: ClioStatusValue = props.sessionState ?? 'running';
  const activityCountLabel = `${activityCount.toLocaleString()} background ${activityCount === 1 ? 'activity' : 'activities'}`;
  const outputArtifacts = artifactDeliverables(props.artifacts).filter(
    (artifact) => artifact.session_relation !== 'used',
  );
  const dockLabel = currentTool
    ? getToolPresentation(currentTool).title
    : latestActiveProcess
      ? latestActiveProcess.title
      : currentTask
        ? currentTask.title
        : activityCount
          ? activityCountLabel
          : outputArtifacts.length
            ? `${outputArtifacts.length} outputs`
            : 'Activity';
  // The badge takes the session state's tone (red for failed), so its words must name that
  // same state: an idle fall-through label under a failed tone read as a red "Up to date".
  const dockStatus = activeActivityCount
    ? `${activeActivityCount} active`
    : sessionActive
      ? 'Working'
      : sessionNeedsAttention && props.sessionState
        ? clioStatusLabel(props.sessionState)
        : activityCount
          ? 'Settled'
          : 'No active work';

  const openChildAgent = (subagent: SubagentRun, target: SubagentOpenTarget) => {
    props.onOpenSubagent?.(subagent, target);
    setChildAgentsOpen(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-1" data-slot="composer-evidence">
      <SessionEvidencePopover evidence={props}>
        {({ layout, buttonRef, panelId, cycle }) => (
          <Button
            ref={buttonRef}
            aria-label={`Evidence layout: ${layout.charAt(0).toUpperCase() + layout.slice(1)}`}
            aria-expanded={layout !== 'none'}
            aria-controls={panelId}
            aria-haspopup="dialog"
            data-evidence-layout={layout}
            onClick={() => cycle(1)}
            onContextMenu={(event) => {
              event.preventDefault();
              cycle(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                cycle(event.key === 'ArrowLeft' ? -1 : 1);
              }
            }}
            className="h-7 min-w-0 gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground hover:text-foreground"
            size={props.toolbar ? 'icon-sm' : 'sm'}
            title={`Evidence: ${layout}. Click for next layout; right-click for previous. ${dockLabel}`}
            type="button"
            variant="ghost"
          >
            <EvidenceLayoutIcon layout={layout} />
            <span
              className={
                props.toolbar
                  ? 'sr-only'
                  : 'hidden min-w-0 max-w-40 truncate text-left font-medium @min-[50rem]/composer:inline'
              }
            >
              {dockLabel}
            </span>
            {!props.toolbar && presentationOverrideCount ? (
              <ClioStatus
                className="hidden py-0.5 @min-[65rem]/composer:inline-flex"
                label={`${presentationOverrideCount} display ${presentationOverrideCount === 1 ? 'fallback' : 'fallbacks'}`}
                value="degraded"
              />
            ) : null}
            {!props.toolbar && showDockStatusBadge ? (
              <ClioStatus className="shrink-0 py-0.5" label={dockStatus} value={dockStatusValue} />
            ) : null}
          </Button>
        )}
      </SessionEvidencePopover>
      {/* Always mounted (not conditionally toggled) so it exists before its text changes, and
          outside the Button so its content never factors into the Button's accessible name. */}
      <span aria-live="polite" className="sr-only">
        {dockStatus}
      </span>
      {!props.toolbar && props.subagents.length ? (
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
