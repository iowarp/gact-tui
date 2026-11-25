import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { openRunsTab } from '@/lib/runs-tab';
import { useConnectionSettings } from '@/providers/connection-provider';
import { buildRows } from '@/routes/runs-rows';
import { useLiveStore } from '@/store/live-store';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { NamedTooltip } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { runKindName, runStateLabel } from './run-presentation';
import { RunStateWord } from './run-list-row';
import { RunSummary } from './run-tab';
import type { WorkbenchTab } from './workbench-shared';
import { t } from '@lingui/core/macro';

const RUN_TAB_POLL_MS = 3_000;

/**
 * A run opened from its conversation (a job card, a tool row, the context box):
 * the conversation › the run's name with its state, then its record — job, log,
 * questions, a delegated run's conversation and where it ran. Open in Runs
 * shows it among the others, with Stop and the run's menu.
 */
export function WorkbenchRunTab({ tab }: { tab: Extract<WorkbenchTab, { kind: 'run' }> }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const conversation = useLiveStore((state) => state.entities.sessions[tab.sessionId]);
  const workspace = useLiveStore((state) => state.entities.workspaces[tab.workspaceId]);
  const task = useQuery({
    queryKey: queryKeys.key('run-snapshot', settings.endpoint, tab.sessionId, tab.handle),
    queryFn: ({ signal }) => repository.sessionTask(tab.sessionId, tab.handle, signal),
    refetchInterval: (query) =>
      query.state.data === null || query.state.data?.terminal_at ? false : RUN_TAB_POLL_MS,
    retry: false,
  });
  const row = useMemo(
    () =>
      task.data
        ? buildRows(
            [task.data],
            conversation ? [conversation] : [],
            workspace ? [workspace] : [],
          )[0]
        : undefined,
    [conversation, task.data, workspace],
  );
  const label = row?.label ?? tab.label;
  const stateLabel = row ? runStateLabel(row, Boolean(row.cancelRequested)) : '';
  return (
    <section aria-label={t`Run: ${label}`} className="flex h-full min-h-0 flex-col bg-background">
      <FrameBar
        actions={
          <NamedTooltip label={t`Open in Runs`}>
            <Button
              aria-label={t`Open in Runs`}
              className="text-muted-foreground hover:bg-hover hover:text-foreground"
              onClick={() => openRunsTab({ run: tab.handle, sessionId: tab.sessionId })}
              size="icon-xs"
              variant="ghost"
            >
              <ExternalLinkIcon aria-hidden="true" />
            </Button>
          </NamedTooltip>
        }
        label={t`Run actions`}
        what={
          row ? (
            <>
              <span className="shrink-0" data-frame-position="">
                <RunStateWord row={row} stateLabel={stateLabel} />
              </span>
              {row.taskKind ? <span>{runKindName(row.taskKind)}</span> : null}
            </>
          ) : undefined
        }
        where={
          <FrameCrumbs
            parts={conversation?.title ? [{ label: conversation.title }, { label }] : [{ label }]}
          />
        }
      />
      <div className="clio-scrollbar min-h-0 flex-1 overflow-y-auto">
        {row ? (
          <RunSummary row={row} stateLabel={stateLabel} />
        ) : task.isError ? (
          <StateView
            detail={task.error.message}
            kind="error"
            title={t`This run could not be read`}
          />
        ) : task.data === null ? (
          <StateView
            detail={t`It may have been removed, or it belongs to another conversation. Runs lists every run.`}
            kind="empty"
            title={t`This run is not in this conversation`}
          />
        ) : (
          <StateView kind="loading" title={t`Reading the run`} />
        )}
      </div>
    </section>
  );
}
