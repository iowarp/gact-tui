import type {
  Artifact,
  AsyncProcess,
  Run,
  SessionDiff,
  SubagentRun,
  Task,
  ToolInvocation,
} from '@clio/core/v3';
import {
  ActivityIcon,
  BoxesIcon,
  BoxIcon,
  FileDiffIcon,
  FileTextIcon,
  ListChecksIcon,
  ListTreeIcon,
  ServerIcon,
  WaypointsIcon,
  WrenchIcon,
} from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { formatBytes, formatDuration } from '@/lib/format';
import { fileFormatLabel } from '@/lib/media-types';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { EvidenceSection } from './observability-evidence-section';
import type { ClioEvidenceViewProps } from './observability-evidence';
import type { EvidenceFile, EvidencePlan } from './session-evidence-projection';
import { diffStatus, friendlyStatus, type EvidenceSource } from './observability-evidence-sources';
import { SessionSummaryRow } from './session-summary-row';
import { clioStatusLabel } from './status';
import { ClioToolInvocation } from './tool-invocation';

/** Compact inventory of the same authoritative evidence used by the full view. */
export function SessionEvidenceSummary({
  outputs,
  files,
  diffs,
  plans,
  sources,
  runs,
  tasks,
  tools,
  subagents,
  backgroundProcesses,
  ...actions
}: Pick<
  ClioEvidenceViewProps,
  | 'onOpenArtifact'
  | 'onOpenFile'
  | 'onOpenDiff'
  | 'onOpenResource'
  | 'onOpenSubagent'
  | 'onOpenWork'
  | 'onOpenActivity'
> & {
  outputs: readonly Artifact[];
  files: readonly EvidenceFile[];
  diffs: readonly SessionDiff[];
  plans: readonly EvidencePlan[];
  sources: readonly EvidenceSource[];
  runs: readonly Run[];
  tasks: readonly Task[];
  tools: readonly ToolInvocation[];
  subagents: readonly SubagentRun[];
  backgroundProcesses: readonly AsyncProcess[];
}) {
  return (
    <Accordion
      type="multiple"
      defaultValue={[
        'runs',
        'tasks',
        'tools',
        'child-agents',
        'background',
        'files',
        'changes',
        'artifacts',
        'plans',
        'sources',
      ]}
    >
      {runs.length ? (
        <EvidenceSection
          compact
          icon={ActivityIcon}
          label="Agent runs"
          value="runs"
          count={runs.length}
        >
          {runs.map((run) => (
            <SessionSummaryRow
              key={run.id}
              icon={<ActivityIcon />}
              label={run.summary || 'Agent run'}
              metadata={
                run.elapsed_ms === undefined
                  ? clioStatusLabel(run.state)
                  : formatDuration(run.elapsed_ms)
              }
              timestamp={run.completed_at ?? run.started_at}
              onOpen={actions.onOpenActivity}
            />
          ))}
        </EvidenceSection>
      ) : null}
      {tasks.length ? (
        <EvidenceSection
          compact
          icon={ListChecksIcon}
          label="Tasks"
          value="tasks"
          count={tasks.length}
        >
          {tasks.map((task) => (
            <SessionSummaryRow
              key={task.id}
              icon={<ListChecksIcon />}
              label={task.title}
              metadata={clioStatusLabel(task.state)}
              title={task.detail}
              onOpen={actions.onOpenWork}
            />
          ))}
        </EvidenceSection>
      ) : null}
      {subagents.length ? (
        <EvidenceSection
          compact
          icon={BoxesIcon}
          label="Child agents"
          value="child-agents"
          count={subagents.length}
        >
          {subagents.map((agent) => (
            <SessionSummaryRow
              key={agent.id}
              icon={<BoxesIcon />}
              label={agent.title}
              metadata={clioStatusLabel(agent.state)}
              onOpen={
                agent.child_session_id && actions.onOpenSubagent
                  ? (event) =>
                      actions.onOpenSubagent?.(agent, event.shiftKey ? 'canvas' : 'conversation')
                  : undefined
              }
            />
          ))}
        </EvidenceSection>
      ) : null}
      {tools.length ? (
        <EvidenceSection
          compact
          icon={WrenchIcon}
          label="Tool calls"
          value="tools"
          count={tools.length}
        >
          {tools.map((tool) => (
            <ClioToolInvocation key={tool.id} tool={tool} compact />
          ))}
        </EvidenceSection>
      ) : null}
      {backgroundProcesses.length ? (
        <EvidenceSection
          compact
          icon={ServerIcon}
          label="Background tasks"
          value="background"
          count={backgroundProcesses.length}
        >
          {backgroundProcesses.map((process) => (
            <SessionSummaryRow
              key={process.id}
              icon={<ServerIcon />}
              label={process.title}
              metadata={clioStatusLabel(process.live_state)}
              onOpen={actions.onOpenActivity}
            />
          ))}
        </EvidenceSection>
      ) : null}
      {files.length ? (
        <EvidenceSection
          compact
          icon={FileTextIcon}
          label="Files"
          value="files"
          count={files.length}
        >
          {files.map((file) => (
            <SessionSummaryRow
              key={file.id}
              icon={<FileTextIcon />}
              label={file.displayPath}
              metadata={file.size === undefined ? undefined : formatBytes(file.size)}
              title={[file.path, ...file.facts].join(' · ')}
              onOpen={actions.onOpenFile ? () => actions.onOpenFile?.(file.path) : undefined}
            />
          ))}
        </EvidenceSection>
      ) : null}
      {diffs.length ? (
        <EvidenceSection
          compact
          icon={FileDiffIcon}
          label="Changed files"
          value="changes"
          count={diffs.length}
        >
          {diffs.map((diff) => (
            <SessionSummaryRow
              key={diff.path}
              icon={<FileDiffIcon />}
              label={diff.path}
              metadata={friendlyStatus(diff.status) || clioStatusLabel(diffStatus(diff))}
              onOpen={actions.onOpenDiff ? () => actions.onOpenDiff?.(diff) : undefined}
            />
          ))}
        </EvidenceSection>
      ) : null}
      {outputs.length ? (
        <EvidenceSection
          compact
          icon={BoxIcon}
          label="Artifacts"
          value="artifacts"
          count={outputs.length}
        >
          {outputs.map((artifact) => (
            <SessionSummaryRow
              key={artifact.id}
              icon={<ArtifactTypeIcon artifact={artifact} />}
              label={artifact.name}
              metadata={[
                fileFormatLabel(artifact.name, artifact.media_type),
                artifact.size === undefined ? undefined : formatBytes(artifact.size),
              ]
                .filter(Boolean)
                .join(' · ')}
              timestamp={artifact.created_at}
              timestampLabel="Created"
              onOpen={actions.onOpenArtifact ? () => actions.onOpenArtifact?.(artifact) : undefined}
            />
          ))}
        </EvidenceSection>
      ) : null}
      {plans.length ? (
        <EvidenceSection
          compact
          icon={ListTreeIcon}
          label="Plans"
          value="plans"
          count={plans.length}
        >
          {plans.map((plan) => (
            <SessionSummaryRow
              key={plan.id}
              icon={<ListTreeIcon />}
              label={plan.title}
              title={plan.detail}
              onOpen={
                plan.artifact && actions.onOpenArtifact
                  ? () => actions.onOpenArtifact?.(plan.artifact!)
                  : plan.path && actions.onOpenFile
                    ? () => actions.onOpenFile?.(plan.path!)
                    : actions.onOpenWork
              }
            />
          ))}
        </EvidenceSection>
      ) : null}
      {sources.length ? (
        <EvidenceSection
          compact
          icon={WaypointsIcon}
          label="Sources"
          value="sources"
          count={sources.length}
        >
          {sources.map((source) => (
            <SessionSummaryRow
              key={source.id}
              icon={<WaypointsIcon />}
              label={source.label}
              title={source.value}
              href={source.link ? source.value : undefined}
              onOpen={
                source.artifact && actions.onOpenArtifact
                  ? () => actions.onOpenArtifact?.(source.artifact!)
                  : source.resource && actions.onOpenResource
                    ? () => actions.onOpenResource?.(source.resource!)
                    : undefined
              }
            />
          ))}
        </EvidenceSection>
      ) : null}
    </Accordion>
  );
}
