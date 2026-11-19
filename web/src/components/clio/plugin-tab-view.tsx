import { useCallback, useEffect } from 'react';
import { TransportError } from '@clio/core/v3';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import { AlertTriangleIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { RefreshIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import {
  cancelPluginTabOpen,
  openPluginTab,
  usePluginTabState,
} from '@/lib/a2ui/plugin-tab-store';
import { serverOwnerName, serverSurfaceReason } from '@/lib/a2ui/server-surface';
import { ClioA2UISurface } from './a2ui-surface';
import { PluginOpenWaitingLine, PluginOpenWaitingState } from './plugin-open-waiting';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import type { WorkbenchTab } from './workbench-shared';
import { t, ph } from '@lingui/core/macro';

/**
 * A plugin's own workbench tab (HS3): the surfaces its MCP server sends for
 * this conversation. Any plugin can offer one; the content is the plugin's.
 * Actions on them go back to that server through the tab.
 */
export function PluginTabView({ tab }: { tab: Extract<WorkbenchTab, { kind: 'plugin' }> }) {
  const repository = useRepository();
  const state = usePluginTabState(tab.sessionId, tab.tabId);
  const reopen = useCallback(
    () => void openPluginTab(repository, tab.sessionId, tab.tabId),
    [repository, tab.sessionId, tab.tabId],
  );
  const retry = useCallback(
    () => void openPluginTab(repository, tab.sessionId, tab.tabId, { retry: true }),
    [repository, tab.sessionId, tab.tabId],
  );
  const cancel = useCallback(
    () => cancelPluginTabOpen(tab.sessionId, tab.tabId),
    [tab.sessionId, tab.tabId],
  );
  // The tab keeps its surfaces while in the background; it reads again only
  // when it has none yet or missed an update. An unavailable tab waits for the
  // bar's Reload; one that failed to open also offers Retry.
  const needsRead = !state || state.stale;
  useEffect(() => {
    if (needsRead) reopen();
  }, [needsRead, reopen]);
  const onRemoteAction = useCallback(
    async (message: { version: string; action: A2uiClientAction }) => {
      try {
        return await repository.pluginTabAction(tab.sessionId, tab.tabId, message);
      } catch (error) {
        // The service forgot the tab (it restarted): read it again.
        if (error instanceof TransportError && error.code === 'plugin_tab_not_open') reopen();
        throw error;
      }
    },
    [repository, reopen, tab.sessionId, tab.tabId],
  );
  const label = tab.label;
  const reason = state?.reason ? serverSurfaceReason(state.reason) : undefined;
  const unavailable = state?.status === 'unavailable';
  const waiting = (
    <PluginOpenWaitingState label={label} onCancel={cancel} onRetry={retry} state={state} />
  );
  const longWait =
    state?.surfaces.length === 0 &&
    (state.status === 'cancelled' || (state.status === 'loading' && state.stillWaiting));
  let body;
  if (longWait) body = waiting;
  else if (!state || (state.status === 'loading' && state.surfaces.length === 0))
    body = <StateView kind="loading" size="viewer" title={t`Opening ${ph({ label })}`} />;
  else if (unavailable && state.surfaces.length === 0)
    body = (
      <StateView
        detail={reason ?? state.detail}
        kind="unavailable"
        size="viewer"
        title={t`${ph({ label })} is unavailable`}
      />
    );
  else if (state.status === 'error')
    body = (
      <StateView
        detail={state.detail}
        kind="error"
        size="viewer"
        title={t`${ph({ label })} could not be opened`}
      >
        {/* The same bordered Retry an action's error row carries. */}
        <Button
          className="rounded-[7px] border-input text-foreground"
          onClick={reopen}
          size="xs"
          variant="outline"
        >
          <RetryIcon aria-hidden="true" className="size-3.5" />
          {t`Retry`}
        </Button>
      </StateView>
    );
  else if (state.surfaces.length === 0)
    body = (
      <StateView
        detail={reason ? t`Its view was not shown. ${reason}` : undefined}
        kind="empty"
        size="viewer"
        title={t`${ph({ label })} has nothing to show yet`}
      />
    );
  else
    body = (
      <div className="clio-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-3">
          <PluginOpenWaitingLine label={label} onCancel={cancel} onRetry={retry} state={state} />
          {unavailable ? (
            <p
              className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground"
              data-slot="plugin-tab-unavailable"
              role="status"
            >
              <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                {reason
                  ? t`${ph({ label })} is unavailable, so this is its last view. ${reason}`
                  : t`${ph({ label })} is unavailable, so this is its last view.`}
              </span>
            </p>
          ) : null}
          {state.surfaces.map((surface) => (
            <ClioA2UISurface
              key={surface.id}
              onRemoteAction={onRemoteAction}
              ownerAttribution={false}
              readOnly={unavailable}
              surface={surface}
            />
          ))}
        </div>
      </div>
    );
  return (
    <section
      aria-label={label}
      className="flex h-full min-h-0 flex-col bg-background"
      data-plugin={tab.plugin}
      data-slot="plugin-tab"
    >
      <FrameBar
        actions={
          <IconButton
            disabled={state?.status === 'loading' && !state.stillWaiting}
            icon={<RefreshIcon />}
            label={t`Reload ${ph({ label })}`}
            onClick={state?.stillWaiting ? retry : reopen}
            size="sm"
            tooltipSide="bottom"
          />
        }
        label={t`${ph({ label })} actions`}
        where={
          <FrameCrumbs
            parts={[
              {
                label: serverOwnerName({
                  plugin: tab.plugin,
                  plugin_title: tab.pluginTitle || state?.owner?.plugin_title,
                  server: '',
                }),
              },
              { label },
            ]}
          />
        }
      />
      {body}
    </section>
  );
}
