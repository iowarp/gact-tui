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
  BoxIcon,
  BoxesIcon,
  ExternalLinkIcon,
  FileDiffIcon,
  FileCode2Icon,
  FileTextIcon,
  ListChecksIcon,
  ListTreeIcon,
  PanelsTopLeftIcon,
  ServerCogIcon,
  WaypointsIcon,
  WrenchIcon,
} from 'lucide-react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatBytes, formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ClioInteractiveRow } from './interactive-row';
import { ClioArtifactCard } from './artifact-card';
import { getChildAgentAssignment } from './child-agent-presentation';
import {
  fileName,
  sessionDiffs,
  sessionFiles,
  sessionPlans,
  type EvidenceFile,
  type EvidencePlan,
} from './session-evidence-projection';
import { ClioStatus, type ClioStatusValue } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import { getToolActivityTitle, getToolStatus, getToolSummary } from './tool-presentation';

export interface ClioEvidenceViewProps {
  artifacts: readonly Artifact[];
  contextFiles: readonly ContextFile[];
  diffs: readonly SessionDiff[];
  messages: readonly Message[];
  processes: readonly AsyncProcess[];
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
  provenanceProvider?: ProvenanceProviderSummary;
  artifactProvenanceProvider?: ArtifactProvenanceProviderSummary;
  provenanceDegradation?: ExecutionProvenanceDegradation;
  resources?: readonly WorkspaceResource[];
}

export function ClioEvidenceView(props: ClioEvidenceViewProps) {
  const backgroundProcesses = props.processes.filter((process) => process.kind !== 'agent');
  const runs = props.runs ?? [];
  const subagents = props.subagents ?? [];
  const tasks = props.tasks ?? [];
  const tools = props.tools ?? [];
  const files = sessionFiles(props.contextFiles, tools, props.executionProvenance);
  const diffs = sessionDiffs(props.diffs, tools, props.executionProvenance);
  const plans = sessionPlans(props.messages, props.interactions ?? [], props.artifacts);
  const sources = sessionSources(
    props.messages,
    props.processes,
    props.resources ?? [],
    props.executionProvenance,
  );
  const hasEvidence = Boolean(
    diffs.length ||
      props.artifacts.length ||
      sources.length ||
      plans.length ||
      files.length ||
      runs.length ||
      subagents.length ||
      tasks.length ||
      tools.length ||
      backgroundProcesses.length,
  );
  const hasProvenance = Boolean(props.provenanceProvider || props.artifactProvenanceProvider);

  if (!hasEvidence && !hasProvenance) {
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
      <Accordion defaultValue={['child-agents', 'files', 'changes', 'sources']} type="multiple">
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
        {subagents.length ? (
          <EvidenceSection
            icon={BoxesIcon}
            label="Child agents"
            value="child-agents"
            count={subagents.length}
          >
            <SubagentEvidence onOpenSubagent={props.onOpenSubagent} subagents={subagents} />
          </EvidenceSection>
        ) : null}
        {tools.length ? (
          <EvidenceSection icon={WrenchIcon} label="Tool calls" value="tools" count={tools.length}>
            <ToolEvidence tools={tools} />
          </EvidenceSection>
        ) : null}
        {backgroundProcesses.length ? (
          <EvidenceSection
            icon={ServerCogIcon}
            label="Background tasks"
            value="background"
            count={backgroundProcesses.length}
          >
            <BackgroundEvidence processes={backgroundProcesses} />
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
        {sources.length ? (
          <EvidenceSection
            icon={WaypointsIcon}
            label="Sources"
            value="sources"
            count={sources.length}
          >
            <SourceEvidence onOpenResource={props.onOpenResource} sources={sources} />
          </EvidenceSection>
        ) : null}
        {props.artifacts.length ? (
          <EvidenceSection
            icon={BoxIcon}
            label="Artifacts"
            value="artifacts"
            count={props.artifacts.length}
          >
            <ArtifactEvidence
              artifacts={props.artifacts}
              onOpenArtifact={props.onOpenArtifact}
              ownerLabels={artifactOwnerLabels(props.executionProvenance)}
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
      </Accordion>
    </div>
  );
}

function EvidenceSection({
  icon: Icon,
  label,
  value,
  count,
  children,
}: {
  icon: typeof FileDiffIcon;
  label: string;
  value: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger aria-label={`${label}, ${count.toLocaleString()} recorded`}>
        <span className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {label}
          <Badge variant="secondary">{count}</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="clio-scrollbar grid max-h-[min(24rem,60vh)] gap-2 overflow-y-auto pr-1">
          {children}
        </div>
      </AccordionContent>
    </AccordionItem>
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
}: {
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: readonly SubagentRun[];
}) {
  return (
    <div className="grid gap-1">
      {subagents.map((subagent) => {
        const assignment = getChildAgentAssignment(subagent);
        const canOpen = Boolean(subagent.child_session_id && onOpenSubagent);
        return (
          <ClioInteractiveRow
            aria-label={canOpen ? `Open child conversation ${subagent.title}` : undefined}
            className={canOpen ? 'cursor-pointer' : undefined}
            disabled={!canOpen}
            key={subagent.id}
            onClick={canOpen ? () => onOpenSubagent?.(subagent, 'conversation') : undefined}
            role={canOpen ? 'button' : undefined}
            running={subagent.state === 'running'}
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

function BackgroundEvidence({ processes }: { processes: readonly AsyncProcess[] }) {
  return (
    <div className="grid gap-1">
      {processes.map((process) => (
        <ClioInteractiveRow key={process.id} running={process.live_state === 'running'}>
          <EvidenceRecord
            detail={[process.host, process.placement].filter(Boolean).join(', ') || undefined}
            icon={ServerCogIcon}
            label={process.title}
            state={process.live_state}
          />
        </ClioInteractiveRow>
      ))}
    </div>
  );
}

function EvidenceRecord({
  detail,
  icon: Icon,
  label,
  state,
}: {
  detail?: string;
  icon: typeof ActivityIcon;
  label: string;
  state: ClioStatusValue;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium" title={label}>
            {label}
          </p>
          <ClioStatus className="shrink-0 py-0.5" value={state} />
        </div>
        {detail ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{detail}</p>
        ) : null}
      </div>
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
      key={diff.path}
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
              aria-label={`Review diff for ${diff.path} in canvas`}
              onClick={() => onOpenDiff(diff)}
              size="icon-xs"
              title="Open review tab"
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
}: {
  sources: readonly EvidenceSource[];
  onOpenResource?: (resource: WorkspaceResource) => void;
}) {
  if (!sources.length) return <EmptyEvidence label="No source references were recorded." />;
  return (
    <div className="grid gap-2">
      {sources.map((source) => (
        <ClioInteractiveRow
          aria-label={source.resource && onOpenResource ? `Open source ${source.label}` : undefined}
          className={source.resource && onOpenResource ? 'cursor-pointer' : undefined}
          key={source.id}
          onClick={
            source.resource && onOpenResource
              ? () => onOpenResource(source.resource as WorkspaceResource)
              : undefined
          }
          role={source.resource && onOpenResource ? 'button' : undefined}
          tabIndex={source.resource && onOpenResource ? 0 : undefined}
        >
          <div className="flex items-start gap-3">
            <WaypointsIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{source.label}</p>
              {source.ownerLabel ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {source.relation ? `${friendlyStatus(source.relation)} by ` : ''}
                  {source.ownerLabel}
                </p>
              ) : null}
              {source.link && source.value ? (
                <a
                  aria-label={`${source.label}: ${source.value}`}
                  className="mt-1 flex items-center gap-1 break-all text-xs text-primary hover:underline"
                  href={source.value}
                  rel="noreferrer"
                  target="_blank"
                >
                  {source.value}
                  <ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
                </a>
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
}: {
  artifacts: readonly Artifact[];
  onOpenArtifact?: (artifact: Artifact) => void;
  ownerLabels: ReadonlyMap<string, string>;
}) {
  if (!artifacts.length) return <EmptyEvidence label="No artifacts were produced." />;
  return (
    <div className="grid gap-2">
      {artifacts.map((artifact) => (
        <div key={artifact.id}>
          <ClioArtifactCard artifact={artifact} onOpen={onOpenArtifact} preview={false} />
          {ownerLabels.get(artifact.id) ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {`Generated by ${ownerLabels.get(artifact.id)}`}
            </p>
          ) : null}
        </div>
      ))}
    </div>
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
