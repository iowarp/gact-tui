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
  FileDiffIcon,
  FileTextIcon,
  ListChecksIcon,
  ListTreeIcon,
  WaypointsIcon,
} from 'lucide-react';
import { formatBytes, formatDuration } from '@/lib/format';
import type { SessionEvidenceActions } from './session-evidence-types';
import type { EvidenceFile, EvidencePlan } from './session-evidence-projection';
import { diffStatus, friendlyStatus, type EvidenceSource } from './observability-evidence-sources';
import { SessionSummaryRow } from './session-summary-row';
import { clioStatusLabel } from './status';
import { ClioToolInvocation } from './tool-invocation';
import { AsyncTaskList } from './async-task-list';
import { showCompletedWork } from './task-history';
import { isSettledTaskActivity, taskActivity } from './task-activity';

import type { SessionRailItem } from './session-rail-layout';
import { ArtifactRailRow } from './artifact-rail-row';

/** "+48 ?3" when the diffs report line counts. */
export function changedLines(diffs: readonly SessionDiff[]): string | undefined {
  if (!diffs.some((diff) => diff.lines_added !== undefined || diff.lines_removed !== undefined))
    return undefined;
  const added = diffs.reduce((sum, diff) => sum + (diff.lines_added ?? 0), 0);
  const removed = diffs.reduce((sum, diff) => sum + (diff.lines_removed ?? 0), 0);
  return `+${added.toLocaleString()} \u2212${removed.toLocaleString()}`;
}

export type SessionEvidenceSummaryProps = Pick<
  SessionEvidenceActions,
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
  const history = actions.workPages?.history;
  const activity = taskActivity(backgroundProcesses, subagents);
  const activeCount = history
    ? activity.filter((entry) => !isSettledTaskActivity(entry)).length
    : activity.length;
  // Finished work sits behind Completed work: a count of 0 would read as none ever ran.
  const completedWork = showCompletedWork(history, activity);
  const finishedWorkHidden = Boolean(actions.workPages?.hasMore || completedWork);
  return [
    ...(runs.length
      ? [
          {
            id: 'runs' as const,
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
    ...(tools.length
      ? [
          {
            id: 'tools' as const,
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
    ...(activity.length || actions.workPages?.hasMore || completedWork
      ? [
          {
            id: 'running' as const,
            count: activeCount,
            summary: !activeCount && finishedWorkHidden ? 'none running' : undefined,
            defaultOpen: true,
            content: (
              <AsyncTaskList
                compact
                processes={backgroundProcesses}
                subagents={subagents}
                onOpenSubagent={actions.onOpenSubagent}
                onOpenFlow={actions.onOpenFlow}
                onCancelTask={actions.onCancelTask}
                onControlTask={actions.onControlTask}
                pagination={actions.workPages}
              />
            ),
          },
        ]
      : []),
    ...(files.length
      ? [
          {
            id: 'files' as const,
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
            count: diffs.length,
            summary: changedLines(diffs),
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
