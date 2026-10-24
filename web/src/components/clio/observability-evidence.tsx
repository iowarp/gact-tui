import { subagentOpenTarget, SUBAGENT_OPEN_HINT } from './subagent-navigation';
import type {
  Artifact,
  ArtifactProvenanceProviderSummary,
  AsyncProcess,
  ContextFile,
  ExecutionProvenanceDegradation,
  ExecutionProvenanceResult,
  Message,
  PendingInteraction,
  ProvenanceProviderSummary,
  Run,
  SessionDiff,
  SubagentRun,
  Task,
  ToolInvocation,
  WorkspaceResource,
} from '@clio/core/v3';
import {
  ActivityIcon,
  BoxesIcon,
  BoxIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  FileDiffIcon,
  FileTextIcon,
  ListChecksIcon,
  ListTreeIcon,
  PanelRightOpenIcon,
  PanelsTopLeftIcon,
  ServerIcon,
  WaypointsIcon,
  WrenchIcon,
} from 'lucide-react';
import { InfoIcon } from '@/lib/icon-vocabulary';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { Accordion } from '@/components/ui/accordion';
import { useEvidenceSections } from '@/hooks/use-evidence-disclosures';
import { EvidenceSection } from './observability-evidence-section';
import { EvidenceRecord } from './observability-evidence-record';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatBytes, formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ClioInteractiveRow } from './interactive-row';
import { ClioArtifactCard } from './artifact-card';
import { ArtifactFilters } from './artifact-filters';
import { artifactDeliverables } from '@/lib/artifact-presentation';
import { FileTypeIcon } from './file-type-icon';
import { getChildAgentAssignment } from './child-agent-presentation';
import {
  fileName,
  sessionDiffs,
  sessionFiles,
  sessionPlans,
  type EvidenceFile,
  type EvidencePlan,
} from './session-evidence-projection';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import { getToolActivityTitle, getToolStatus, getToolSummary } from './tool-presentation';
import { AsyncTaskList, type TaskPageControls } from './async-task-list';
import { SessionEvidenceSummary } from './session-evidence-summary';
import { taskActivity } from './task-activity';
import { OpenQuestionsSection } from './open-question-list';
import { openHumanQuestions } from '@/lib/inline-question';

export interface ClioEvidenceViewProps {
  compact?: boolean;
  section?: 'data' | 'work';
  artifacts: readonly Artifact[];
  contextFiles: readonly ContextFile[];
  diffs: readonly SessionDiff[];
  messages: readonly Message[];
  processes: readonly AsyncProcess[];
  workPages?: TaskPageControls;
  onCancelTask?: (task: AsyncProcess) => Promise<void>;
  onControlTask?: (task: AsyncProcess, action: 'pause' | 'resume' | 'restart') => Promise<void>;
  interactions?: readonly PendingInteraction[];
  runs?: readonly Run[];
  subagents?: readonly SubagentRun[];
  tasks?: readonly Task[];
  tools?: readonly ToolInvocation[];
  executionProvenance?: ExecutionProvenanceResult;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenDiff?: (diff: SessionDiff) => void;
  onOpenFile?: (path: string) => void;
  onOpenResource?: (resource: WorkspaceResource) => void;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  /** Open a flow run's view: a task that runs a flow opens its run, not a chat. */
  onOpenFlow?: (handle: string, title: string) => void;
  onOpenWork?: () => void;
  onOpenActivity?: () => void;
  provenanceProvider?: ProvenanceProviderSummary;
  artifactProvenanceProvider?: ArtifactProvenanceProviderSummary;
  provenanceDegradation?: ExecutionProvenanceDegradation;
  resources?: readonly WorkspaceResource[];
}

export function ClioEvidenceView(props: ClioEvidenceViewProps) {
  const showActivity = props.section !== 'data';
  const questions = showActivity ? openHumanQuestions(props.interactions ?? []) : [];
  const showData = props.section !== 'work';
  const outputs = showData
    ? (props.compact ? artifactDeliverables(props.artifacts) : props.artifacts).filter(
        (artifact) => artifact.session_relation !== 'used',
      )
    : [];
  const backgroundProcesses = showActivity ? props.processes : [];
  const runs = showActivity ? (props.runs ?? []) : [];
  const subagents = showActivity ? (props.subagents ?? []) : [];
  const activity = taskActivity(backgroundProcesses, subagents);
  const separateSubagents = activity.flatMap((entry) =>
    !entry.process && entry.subagent ? [entry.subagent] : [],
  );
  const taskSubagents = activity.flatMap((entry) =>
    entry.process && entry.subagent ? [entry.subagent] : [],
  );
  // Finished work sits behind Show completed work: a count of 0 would read as none ever ran.
  const finishedWorkHidden = Boolean(props.workPages?.hasMore || props.workPages?.history);
  const tasks = showActivity ? (props.tasks ?? []) : [];
  const tools = showActivity ? (props.tools ?? []) : [];
  const files = showData
    ? sessionFiles(props.contextFiles, props.tools ?? [], props.executionProvenance)
    : [];
  const diffs = showData
    ? sessionDiffs(props.diffs, props.tools ?? [])
    : [];
  const plans = showActivity
    ? sessionPlans(props.messages, props.interactions ?? [], props.artifacts)
    : [];
  const sources = !showData
    ? []
    : sessionSources(
        props.messages,
        props.processes,
        props.resources ?? [],
        props.executionProvenance,
        props.artifacts,
      );
  const hasEvidence = Boolean(
    (showActivity && (props.workPages?.hasMore || props.workPages?.history)) ||
      diffs.length ||
      outputs.length ||
      sources.length ||
      plans.length ||
      files.length ||
      runs.length ||
      subagents.length ||
      tasks.length ||
      tools.length ||
      backgroundProcesses.length ||
      questions.length,
  );
  const hasProvenance = Boolean(props.provenanceProvider || props.artifactProvenanceProvider);
  const sections = useEvidenceSections('evidence-details', [
    'child-agents',
    'files',
    'changes',
    'sources',
  ]);

  if (props.compact)
    return (
      <>
        {showActivity ? <OpenQuestionsSection interactions={props.interactions} /> : null}
        <SessionEvidenceSummary
          {...props}
          outputs={outputs}
          files={files}
          diffs={diffs}
          plans={plans}
          sources={sources}
          runs={runs}
          tasks={tasks}
          tools={tools}
          subagents={subagents}
          backgroundProcesses={backgroundProcesses}
          workPages={showActivity ? props.workPages : undefined}
        />
      </>
    );

  if (!hasEvidence && !hasProvenance && !props.compact) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No session evidence or recorded activity is available.
      </p>
    );
  }

  return (
    <div className="min-w-0">
      {/* Radix's AccordionHeader always renders an h3 (no level prop); the
          removed Frame/FrameTitle summary (b4931b86) was this view's only
          heading anchor, so section h3s now follow the transcript's own h1
          with nothing between -- an axe heading-order violation. An h2 gives
          the h3 sections a correctly-leveled parent; aria-label (not text
          content) keeps it out of getByText so it doesn't reintroduce the
          "Session evidence" string the redesign deliberately dropped
          (test_observability_evidence.tsx:77 pins its absence). */}
      <h2 aria-label="Session evidence" className="sr-only" />
      {showActivity ? <OpenQuestionsSection interactions={props.interactions} /> : null}
      <Accordion
        className={
          props.compact
            ? '[&_[data-slot=accordion-content]>div>div]:max-h-none [&_[data-slot=accordion-content]>div>div]:overflow-visible'
            : undefined
        }
        {...sections}
        type="multiple"
      >
        {runs.length ? (
          <EvidenceSection icon={ActivityIcon} label="Agent runs" value="runs" count={runs.length}>
            <RunEvidence runs={runs} />
          </EvidenceSection>
        ) : null}
        {tasks.length ? (
          <EvidenceSection icon={ListChecksIcon} label="Tasks" value="tasks" count={tasks.length}>
            <TaskEvidence tasks={tasks} />
          </EvidenceSection>
        ) : null}
        {/* Always present: the list of child agents is the one place every
            delegated agent, child session, and standing watcher of this
            session can be found and opened, so its absence must read as
            "none yet", never as a missing feature. */}
        {showActivity && (!subagents.length || separateSubagents.length) ? (
          <EvidenceSection
            icon={BoxesIcon}
            label="Child agents"
            value="child-agents"
            count={separateSubagents.length + taskSubagents.length}
            summary={
              separateSubagents.length + taskSubagents.length === 0 && finishedWorkHidden
                ? 'none running'
                : undefined
            }
          >
            <SubagentEvidence
              onOpenSubagent={props.onOpenSubagent}
              subagents={separateSubagents}
              listedWithTasks={Boolean(taskSubagents.length) || finishedWorkHidden}
            />
          </EvidenceSection>
        ) : null}
        {tools.length ? (
          <EvidenceSection icon={WrenchIcon} label="Tool calls" value="tools" count={tools.length}>
            <ToolEvidence tools={tools} />
          </EvidenceSection>
        ) : null}
        {showActivity &&
        (backgroundProcesses.length || props.workPages?.hasMore || props.workPages?.history) ? (
          <EvidenceSection
            icon={ServerIcon}
            label="Background tasks"
            value="background"
            count={backgroundProcesses.length}
            summary={!backgroundProcesses.length && finishedWorkHidden ? 'none running' : undefined}
          >
            <AsyncTaskList
              processes={backgroundProcesses}
              subagents={taskSubagents}
              onOpenSubagent={props.onOpenSubagent}
              onOpenFlow={props.onOpenFlow}
              onCancelTask={props.onCancelTask}
              onControlTask={props.onControlTask}
              pagination={props.workPages}
            />
          </EvidenceSection>
        ) : null}
        {files.length ? (
          <EvidenceSection icon={FileTextIcon} label="Files" value="files" count={files.length}>
            <FileEvidence files={files} onOpenFile={props.onOpenFile} />
          </EvidenceSection>
        ) : null}
        {diffs.length ? (
          <EvidenceSection
            icon={FileDiffIcon}
            label="Changed files"
            value="changes"
            count={diffs.length}
          >
            <DiffEvidence
              diffs={diffs}
              onOpenDiff={props.onOpenDiff}
              onOpenFile={props.onOpenFile}
            />
          </EvidenceSection>
        ) : null}
        {outputs.length ? (
          <EvidenceSection
            icon={BoxIcon}
            label="Artifacts"
            value="artifacts"
            count={outputs.length}
          >
            <ArtifactEvidence
              artifacts={outputs}
              onOpenArtifact={props.onOpenArtifact}
              ownerLabels={artifactOwnerLabels(props.executionProvenance)}
              compact={props.compact}
            />
          </EvidenceSection>
        ) : null}
        {plans.length ? (
          <EvidenceSection icon={ListTreeIcon} label="Plans" value="plans" count={plans.length}>
            <PlanEvidence
              onOpenArtifact={props.onOpenArtifact}
              onOpenFile={props.onOpenFile}
              plans={plans}
            />
          </EvidenceSection>
        ) : null}
        {sources.length ? (
          <EvidenceSection
            icon={WaypointsIcon}
            label="Sources"
            value="sources"
            count={sources.length}
          >
            <SourceEvidence
              onOpenArtifact={props.onOpenArtifact}
              onOpenResource={props.onOpenResource}
              sources={sources}
            />
          </EvidenceSection>
        ) : null}
      </Accordion>
    </div>
  );
}

function RunEvidence({ runs }: { runs: readonly Run[] }) {
  return (
    <div className="grid gap-1">
      {runs.map((run) => (
        <ClioInteractiveRow key={run.id} running={run.state === 'running'}>
          <EvidenceRecord
            detail={run.elapsed_ms === undefined ? undefined : formatDuration(run.elapsed_ms)}
            icon={ActivityIcon}
            label={run.summary || 'Agent run'}
            state={run.state}
          />
        </ClioInteractiveRow>
      ))}
    </div>
  );
}

function TaskEvidence({ tasks }: { tasks: readonly Task[] }) {
  return (
    <div className="grid gap-1">
      {tasks.map((task) => (
        <ClioInteractiveRow key={task.id} running={task.state === 'running'}>
          <EvidenceRecord
            detail={task.detail}
            icon={ListChecksIcon}
            label={task.title}
            state={task.state}
          />
        </ClioInteractiveRow>
      ))}
    </div>
  );
}

function SubagentEvidence({
  onOpenSubagent,
  subagents,
  listedWithTasks,
}: {
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: readonly SubagentRun[];
  /** Child agents that have a task row are shown there, not here. */
  listedWithTasks: boolean;
}) {
  if (!subagents.length) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground">
        {listedWithTasks
          ? 'Child agents are listed with their tasks under Background tasks; finished ones under Show completed work.'
          : 'No child agents in this session yet.'}
      </p>
    );
  }
  return (
    <div className="grid gap-1">
      {subagents.map((subagent) => {
        const assignment = getChildAgentAssignment(subagent);
        const canOpen = Boolean(subagent.child_session_id && onOpenSubagent);
        // Child activation keeps the parent visible; Shift makes the child central.
        return (
          <ClioInteractiveRow
            actions={
              canOpen ? (
                <Button
                  aria-label={`Open ${subagent.title} in canvas`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenSubagent?.(subagent, 'canvas');
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
            aria-label={canOpen ? `Open child conversation ${subagent.title}` : undefined}
            className={canOpen ? 'cursor-pointer' : undefined}
            disabled={!canOpen}
            key={subagent.id}
            onClick={
              canOpen ? (event) => onOpenSubagent?.(subagent, subagentOpenTarget(event)) : undefined
            }
            onKeyDown={
              canOpen
                ? (event) => {
                    if (event.shiftKey && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onOpenSubagent?.(subagent, 'conversation');
                    }
                  }
                : undefined
            }
            onMouseDown={
              canOpen
                ? (event) => {
                    if (event.shiftKey) event.preventDefault();
                  }
                : undefined
            }
            role={canOpen ? 'button' : undefined}
            running={subagent.state === 'running'}
            title={canOpen ? SUBAGENT_OPEN_HINT : undefined}
          >
            <EvidenceRecord
              detail={assignment.detail ?? assignment.label}
              icon={BoxesIcon}
              label={subagent.title}
              state={subagent.state}
            />
          </ClioInteractiveRow>
        );
      })}
    </div>
  );
}

function ToolEvidence({ tools }: { tools: readonly ToolInvocation[] }) {
  return (
    <div className="grid gap-1">
      {tools.map((tool) => (
        <ClioInteractiveRow key={tool.id} running={tool.state === 'running'}>
          <EvidenceRecord
            detail={getToolSummary(tool)}
            icon={WrenchIcon}
            label={getToolActivityTitle(tool)}
            state={getToolStatus(tool)}
          />
        </ClioInteractiveRow>
      ))}
    </div>
  );
}

function DiffEvidence({
  diffs,
  onOpenDiff,
  onOpenFile,
}: {
  diffs: readonly SessionDiff[];
  onOpenDiff?: (diff: SessionDiff) => void;
  onOpenFile?: (path: string) => void;
}) {
  if (!diffs.length) return <EmptyEvidence label="No file changes were recorded." />;
  return diffs.map((diff) => (
    <CodeBlock
      code={diff.unified_diff || 'Diff content unavailable.'}
      key={diff.id}
      language="diff"
    >
      <CodeBlockHeader>
        <CodeBlockTitle title={diff.path}>
          <FileDiffIcon aria-hidden="true" className="size-3.5" />
          <CodeBlockFilename>{fileName(diff.path)}</CodeBlockFilename>
          <ClioStatus label={friendlyStatus(diff.status)} value={diffStatus(diff)} />
        </CodeBlockTitle>
        <CodeBlockActions>
          {onOpenDiff ? (
            <Button
              aria-label={`Open the change to ${diff.path} in canvas`}
              onClick={() => onOpenDiff(diff)}
              size="icon-xs"
              title="Open change tab"
              variant="ghost"
            >
              <PanelsTopLeftIcon aria-hidden="true" />
            </Button>
          ) : null}
          {onOpenFile ? (
            <Button
              aria-label={`Open current ${diff.path} in workspace`}
              onClick={() => onOpenFile(diff.path)}
              size="icon-xs"
              title="Open current file"
              variant="ghost"
            >
              <FileCode2Icon aria-hidden="true" />
            </Button>
          ) : null}
          {diff.unified_diff ? (
            <CodeBlockCopyButton aria-label={`Copy diff for ${diff.path}`} />
          ) : null}
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  ));
}

import type { EvidenceSource } from './observability-evidence-sources';
import {
  artifactOwnerLabels,
  diffStatus,
  friendlyStatus,
  sessionSources,
  sourceDisplayValue,
} from './observability-evidence-sources';

function SourceEvidence({
  sources,
  onOpenResource,
  onOpenArtifact,
}: {
  sources: readonly EvidenceSource[];
  onOpenResource?: (resource: WorkspaceResource) => void;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  if (!sources.length) return <EmptyEvidence label="No source references were recorded." />;
  return (
    <div className="grid gap-2">
      {sources.map((source) => (
        <ClioInteractiveRow
          actions={
            source.artifact ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    aria-label={`Details for source ${source.label}`}
                    onClick={(event) => event.stopPropagation()}
                    size="icon-xs"
                    title="Source details"
                    variant="ghost"
                  >
                    <InfoIcon aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="space-y-2 text-xs">
                  <p className="break-words font-medium">{source.label}</p>
                  <p className="break-all">{source.value}</p>
                </PopoverContent>
              </Popover>
            ) : undefined
          }
          aria-label={
            (source.resource && onOpenResource) || (source.artifact && onOpenArtifact)
              ? `Open source ${source.label}`
              : undefined
          }
          className={
            (source.resource && onOpenResource) || (source.artifact && onOpenArtifact)
              ? 'cursor-pointer'
              : undefined
          }
          key={source.id}
          onClick={
            source.artifact && onOpenArtifact
              ? () => onOpenArtifact(source.artifact as Artifact)
              : source.resource && onOpenResource
                ? () => onOpenResource(source.resource as WorkspaceResource)
                : undefined
          }
          role={
            (source.resource && onOpenResource) || (source.artifact && onOpenArtifact)
              ? 'button'
              : undefined
          }
          tabIndex={
            (source.resource && onOpenResource) || (source.artifact && onOpenArtifact)
              ? 0
              : undefined
          }
        >
          <div className="flex items-start gap-3">
            {source.artifact ? (
              <FileTypeIcon
                name={source.artifact.name}
                mediaType={source.artifact.media_type}
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
            ) : (
              <WaypointsIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="break-words text-xs font-medium" title={source.label}>
                {source.label}
              </p>
              {source.ownerLabel ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {source.relation ? `${friendlyStatus(source.relation)} by ` : ''}
                  {source.ownerLabel}
                </p>
              ) : null}
              {source.link && source.value ? (
                <ExternalLink
                  aria-label={`${source.label}: ${source.value}`}
                  className="mt-1 flex items-center gap-1 break-all text-xs text-primary hover:underline"
                  href={source.value}
                >
                  {source.value}
                  <ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
                </ExternalLink>
              ) : source.detailParts ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {source.detailParts.map((part) => (
                    <span key={part.id} title={part.title}>
                      {part.text}
                    </span>
                  ))}
                </div>
              ) : (
                <p
                  className="mt-1 break-all text-xs text-muted-foreground"
                  title={
                    source.value === undefined || sourceDisplayValue(source.value) === source.value
                      ? undefined
                      : source.value
                  }
                >
                  {source.value === undefined ? '' : sourceDisplayValue(source.value)}
                </p>
              )}
            </div>
          </div>
        </ClioInteractiveRow>
      ))}
    </div>
  );
}

function ArtifactEvidence({
  artifacts,
  onOpenArtifact,
  ownerLabels,
  compact,
}: {
  artifacts: readonly Artifact[];
  onOpenArtifact?: (artifact: Artifact) => void;
  ownerLabels: ReadonlyMap<string, string>;
  compact?: boolean;
}) {
  if (!artifacts.length) return <EmptyEvidence label="No artifacts were produced." />;
  return (
    <ArtifactFilters artifacts={artifacts}>
      {(visible) => (
        <div className="grid min-w-0 grid-cols-1 gap-2">
          {visible.map((artifact) => (
            <div key={artifact.id} title={compact ? ownerLabels.get(artifact.id) : undefined}>
              <ClioArtifactCard
                artifact={artifact}
                onOpen={onOpenArtifact}
                preview={false}
                presentation="evidence"
              />
              {!compact && ownerLabels.get(artifact.id) ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {`Generated by ${ownerLabels.get(artifact.id)}`}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </ArtifactFilters>
  );
}

function FileEvidence({
  files,
  onOpenFile,
}: {
  files: readonly EvidenceFile[];
  onOpenFile?: (path: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {files.map((file) => (
        <ClioInteractiveRow
          className={cn('border-border bg-muted/20', onOpenFile && 'cursor-pointer')}
          key={file.path}
          onClick={() => onOpenFile?.(file.path)}
          role={onOpenFile ? 'button' : undefined}
          tabIndex={onOpenFile ? 0 : undefined}
        >
          <div className="flex items-center gap-3">
            <FileTextIcon aria-hidden="true" className="size-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={file.path}>
                {file.displayPath}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {file.facts.map((fact) => (
                  <span key={fact}>{fact}</span>
                ))}
                {file.size === undefined ? null : <span>{formatBytes(file.size)}</span>}
              </div>
            </div>
          </div>
        </ClioInteractiveRow>
      ))}
    </div>
  );
}

function PlanEvidence({
  onOpenArtifact,
  onOpenFile,
  plans,
}: {
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenFile?: (path: string) => void;
  plans: readonly EvidencePlan[];
}) {
  return (
    <div className="grid gap-2">
      {plans.map((plan) => {
        const canOpen = Boolean((plan.artifact && onOpenArtifact) || (plan.path && onOpenFile));
        return (
          <ClioInteractiveRow
            className={canOpen ? 'cursor-pointer' : undefined}
            key={plan.id}
            onClick={
              canOpen
                ? () =>
                    plan.artifact
                      ? onOpenArtifact?.(plan.artifact)
                      : plan.path
                        ? onOpenFile?.(plan.path)
                        : undefined
                : undefined
            }
            role={canOpen ? 'button' : undefined}
            tabIndex={canOpen ? 0 : undefined}
          >
            <p className="truncate text-sm font-medium" title={plan.path}>
              {plan.title}
            </p>
            {plan.detail ? (
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {plan.detail}
              </p>
            ) : null}
          </ClioInteractiveRow>
        );
      })}
    </div>
  );
}

function EmptyEvidence({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">{label}</p>
  );
}
