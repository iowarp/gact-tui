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
import { formatBytes, formatDuration } from '@/lib/format';
import type { ClioEvidenceViewProps } from './observability-evidence';
import type { EvidenceFile, EvidencePlan } from './session-evidence-projection';
import { diffStatus, friendlyStatus, type EvidenceSource } from './observability-evidence-sources';
import { SessionSummaryRow } from './session-summary-row';
import { clioStatusLabel } from './status';
import { ClioToolInvocation } from './tool-invocation';
import { AsyncTaskList } from './async-task-list';
import { taskActivity } from './task-activity';

import type { SessionRailItem } from './session-rail-layout';
import { ArtifactRailRow } from './artifact-rail-row';

export type SessionEvidenceSummaryProps = Pick<
  ClioEvidenceViewProps,
  | 'onOpenArtifact'
  | 'onOpenFile'
  | 'onOpenDiff'
  | 'onOpenResource'
  | 'onOpenSubagent'
  | 'onOpenFlow'
  | 'onOpenWork'
  | 'onOpenActivity'
  | 'onCancelTask'
  | 'onControlTask'
  | 'workPages'
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
};

function isChildTask(process: AsyncProcess): boolean {
  return process.task_kind === 'Subagent' || (!process.task_kind && process.kind === 'agent');
}

/** Shared row content for the compact inventory and configurable session rail. */
export function sessionEvidenceItems({
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
}: SessionEvidenceSummaryProps): SessionRailItem[] {
  const childProcesses = backgroundProcesses.filter(isChildTask);
  const processes = backgroundProcesses.filter((process) => !isChildTask(process));
  const childCount = taskActivity(childProcesses, subagents).length;
  const history = actions.workPages?.history;
  const childHistory = history?.items.filter(isChildTask) ?? [];
  const backgroundPages = actions.workPages && {
    ...actions.workPages,
    history: history && {
      ...history,
      items: history.items.filter((process) => !isChildTask(process)),
    },
  };
  const childPages = actions.workPages && {
    ...actions.workPages,
    hasMore: false,
    history: history && { ...history, items: childHistory },
  };
  // Finished work sits behind Show completed work: a count of 0 would read as none ever ran.
  const finishedWorkHidden = Boolean(actions.workPages?.hasMore || history);
  return [
    ...(runs.length
      ? [
          {
            id: 'runs' as const,
            icon: ActivityIcon,
            count: runs.length,
            defaultOpen: true,
            content: (
              <>
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
              </>
            ),
          },
        ]
      : []),
    ...(tasks.length
      ? [
          {
            id: 'tasks' as const,
            icon: ListChecksIcon,
            count: tasks.length,
            defaultOpen: true,
            content: (
              <>
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
              </>
            ),
          },
        ]
      : []),
    ...(childCount || (history?.visible && childHistory.length)
      ? [
          {
            id: 'child-agents' as const,
            icon: BoxesIcon,
            count: childCount,
            summary: childCount ? undefined : 'none running',
            defaultOpen: true,
            content: (
              <>
                <AsyncTaskList
                  compact
                  processes={childProcesses}
                  subagents={subagents}
                  onOpenSubagent={actions.onOpenSubagent}
                  onOpenFlow={actions.onOpenFlow}
                  onCancelTask={actions.onCancelTask}
                  onControlTask={actions.onControlTask}
                  pagination={childPages}
                />
              </>
            ),
          },
        ]
      : []),
    ...(tools.length
      ? [
          {
            id: 'tools' as const,
            icon: WrenchIcon,
            count: tools.length,
            defaultOpen: false,
            content: (
              <>
                {tools.map((tool) => (
                  <ClioToolInvocation key={tool.id} tool={tool} compact />
                ))}
              </>
            ),
          },
        ]
      : []),
    ...(processes.length || actions.workPages?.hasMore || actions.workPages?.history
      ? [
          {
            id: 'background' as const,
            icon: ServerIcon,
            count: processes.length,
            summary: !processes.length && finishedWorkHidden ? 'none running' : undefined,
            defaultOpen: true,
            content: (
              <>
                <AsyncTaskList
                  compact
                  processes={processes}
                  onOpenSubagent={actions.onOpenSubagent}
                  onOpenFlow={actions.onOpenFlow}
                  onCancelTask={actions.onCancelTask}
                  onControlTask={actions.onControlTask}
                  pagination={backgroundPages}
                />
              </>
            ),
          },
        ]
      : []),
    ...(files.length
      ? [
          {
            id: 'files' as const,
            icon: FileTextIcon,
            count: files.length,
            defaultOpen: true,
            content: (
              <>
                {files.map((file) => (
                  <SessionSummaryRow
                    key={file.id}
                    icon={<FileTextIcon />}
                    label={file.displayPath}
                    metadata={file.size === undefined ? undefined : formatBytes(file.size)}
                    title={[file.path, ...file.facts].join(' — ')}
                    onOpen={actions.onOpenFile ? () => actions.onOpenFile?.(file.path) : undefined}
                  />
                ))}
              </>
            ),
          },
        ]
      : []),
    ...(diffs.length
      ? [
          {
            id: 'changes' as const,
            icon: FileDiffIcon,
            count: diffs.length,
            defaultOpen: true,
            content: (
              <>
                {diffs.map((diff) => (
                  <SessionSummaryRow
                    key={diff.id}
                    icon={<FileDiffIcon />}
                    label={diff.path}
                    metadata={friendlyStatus(diff.status) || clioStatusLabel(diffStatus(diff))}
                    onOpen={actions.onOpenDiff ? () => actions.onOpenDiff?.(diff) : undefined}
                  />
                ))}
              </>
            ),
          },
        ]
      : []),
    ...(outputs.length
      ? [
          {
            id: 'artifacts' as const,
            icon: BoxIcon,
            count: outputs.length,
            defaultOpen: true,
            content: (
              <>
                {outputs.map((artifact) => (
                  <ArtifactRailRow
                    key={artifact.id}
                    artifact={artifact}
                    onOpen={
                      actions.onOpenArtifact ? () => actions.onOpenArtifact?.(artifact) : undefined
                    }
                  />
                ))}
              </>
            ),
          },
        ]
      : []),
    ...(plans.length
      ? [
          {
            id: 'plans' as const,
            icon: ListTreeIcon,
            count: plans.length,
            defaultOpen: true,
            content: (
              <>
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
              </>
            ),
          },
        ]
      : []),
    ...(sources.length
      ? [
          {
            id: 'sources' as const,
            icon: WaypointsIcon,
            count: sources.length,
            defaultOpen: true,
            content: (
              <>
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
              </>
            ),
          },
        ]
      : []),
  ];
}
