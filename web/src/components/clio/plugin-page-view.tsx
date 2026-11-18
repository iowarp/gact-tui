import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import {
  TransportError,
  type PendingInteraction,
  type PendingInteractionResponse,
  type PluginPage,
} from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { invalidatePluginPages } from '@/lib/a2ui/plugin-pages';
import {
  dispatchPluginTabFrame,
  openPluginPage,
  pluginsUpdatedByFrame,
  releasePluginPage,
  rereadPluginPages,
  usePluginPageState,
} from '@/lib/a2ui/plugin-tab-store';
import { useA2uiCatalogRegistry, useA2uiSessionRegistry } from '@/lib/a2ui/processor-store';
import { serverSurfaceReason } from '@/lib/a2ui/server-surface';
import {
  dispatchServerSurfaceRefusalFrame,
  useServerSurfaceRefusals,
} from '@/lib/a2ui/server-surface-refusals';
import { connectionScope } from '@/lib/connection-scope';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioA2UISurface } from './a2ui-surface';
import { ClioPendingInteractions } from './pending-interactions';
import { StateView } from './primitives/state-view';
import { SettingsSectionHeading } from './settings-section-heading';
import { ServerSurfaceRefusalRow } from './server-surface-refusal-row';
import { ph, t } from '@lingui/core/macro';

/** After a dropped stream, wait this long before listening again. Unit: ms. */
const RECONNECT_MS = 2_000;

/**
 * Follows a page's context while the page shows: its surfaces' `plugin_page.*`
 * events, the views CLIO refused, and the questions and consent its server
 * asks. The replay is bounded, so a reconnect or a gap reads the page again.
 */
function usePluginPageStream(contextSessionId: string | undefined) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  useEffect(() => {
    if (!contextSessionId) return;
    const controller = new AbortController();
    const interactionsKey = [
      'plugin-page-interactions',
      connectionScope(settings),
      contextSessionId,
    ];
    const listen = async () => {
      let cursor: string | undefined;
      let first = true;
      while (!controller.signal.aborted) {
        try {
          if (!first) rereadPluginPages();
          first = false;
          for await (const frame of repository.stream(
            { connection_id: 'active', session_id: contextSessionId },
            cursor,
            controller.signal,
          )) {
            if (frame.cursor) cursor = frame.cursor;
            dispatchPluginTabFrame(frame, contextSessionId);
            dispatchServerSurfaceRefusalFrame(frame, contextSessionId);
            if (frame.eventName === 'stream.gap') rereadPluginPages();
            if (pluginsUpdatedByFrame(frame)) invalidatePluginPages(queryClient);
            if (frame.eventName?.startsWith('interaction.'))
              void queryClient.invalidateQueries({ queryKey: interactionsKey });
          }
        } catch {
          // A dropped stream reconnects below.
        }
        if (controller.signal.aborted) break;
        await new Promise((resolve) => window.setTimeout(resolve, RECONNECT_MS));
      }
    };
    void listen();
    return () => controller.abort();
  }, [contextSessionId, queryClient, repository, settings]);
}

/**
 * A plugin's own page in the main area (its left-bar entry): the surfaces its
 * server sends for the page, full width, with the questions and consent the
 * server asks shown on the page. Any plugin can offer one; the content is the
 * plugin's. Actions go back to the server through the page.
 */
export function PluginPageView({ page }: { page: PluginPage }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const pageId = page.id;
  const state = usePluginPageState(pageId);
  const reopen = useCallback(() => void openPluginPage(repository, pageId), [repository, pageId]);
  const needsRead = !state || state.stale;
  useEffect(() => {
    if (needsRead) reopen();
  }, [needsRead, reopen]);
  // The page's surfaces and watch end when it leaves the screen.
  useEffect(() => () => releasePluginPage(pageId), [pageId]);
  const contextSessionId = state?.contextSessionId ?? page.context_session_id ?? undefined;
  usePluginPageStream(contextSessionId);
  // The first open created the context: read the list again so the page's requests route here.
  const contextIsNew = Boolean(state?.contextSessionId) && !page.context_session_id;
  useEffect(() => {
    if (contextIsNew) invalidatePluginPages(queryClient);
  }, [contextIsNew, queryClient]);
  // The page is its context's only view, so it owns that context's catalogs.
  useA2uiSessionRegistry(contextSessionId ? [contextSessionId] : []);
  const catalogRegistry = useA2uiCatalogRegistry(contextSessionId ?? '');
  const refusals = useServerSurfaceRefusals(contextSessionId);
  const interactionsKey = ['plugin-page-interactions', connectionScope(settings), contextSessionId];
  const interactions = useQuery({
    queryKey: interactionsKey,
    queryFn: ({ signal }) =>
      repository.pendingInteractionProjection(contextSessionId!, true, signal),
    enabled: Boolean(contextSessionId),
    retry: false,
  });
  const respond = useCallback(
    async (interaction: PendingInteraction, response: PendingInteractionResponse) => {
      if (!contextSessionId) return;
      try {
        await repository.respondInteraction(contextSessionId, interaction.id, response);
      } finally {
        void queryClient.invalidateQueries({ queryKey: interactionsKey });
      }
    },
    // The key is rebuilt from these each render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [contextSessionId, queryClient, repository, settings],
  );
  const onRemoteAction = useCallback(
    async (message: { version: string; action: A2uiClientAction }) => {
      try {
        return await repository.pluginPageAction(pageId, message);
      } catch (error) {
        // The service forgot the page (it restarted): read it again.
        if (error instanceof TransportError && error.code === 'plugin_page_not_open') reopen();
        throw error;
      }
    },
    [repository, reopen, pageId],
  );

  const label = page.title;
  const reason = state?.reason ? serverSurfaceReason(state.reason) : undefined;
  const unavailable = state?.status === 'unavailable';
  let body;
  if (!state || (state.status === 'loading' && state.surfaces.length === 0))
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
  else if (state.surfaces.length === 0 && refusals.length === 0)
    body = (
      <StateView kind="empty" size="viewer" title={t`${ph({ label })} has nothing to show yet`} />
    );
  else
    body = (
      <div className="flex w-full min-w-0 flex-col gap-5">
        {unavailable ? (
          <p
            className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground"
            data-slot="plugin-page-unavailable"
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
            catalogRegistry={contextSessionId ? catalogRegistry : undefined}
            key={surface.id}
            onRemoteAction={onRemoteAction}
            ownerAttribution={false}
            readOnly={unavailable}
            surface={surface}
          />
        ))}
        {refusals.map((refusal) => (
          <ServerSurfaceRefusalRow key={refusal.id} refusal={refusal} />
        ))}
      </div>
    );
  const pending = interactions.data?.interactions ?? [];
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-plugin={page.plugin}
      data-slot="plugin-page"
    >
      <div className="clio-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="@container mx-auto flex w-full max-w-[960px] min-w-0 flex-col gap-3 px-4 pt-5 pb-8 sm:px-6">
          <SettingsSectionHeading title={label} />
          {body}
        </div>
      </div>
      {contextSessionId && pending.length ? (
        <div className="mx-auto w-full max-w-[960px] min-w-0 shrink-0 px-4 pb-3 sm:px-6">
          <ClioPendingInteractions
            interactions={pending}
            onResponse={respond}
            viewedSessionId={contextSessionId}
          />
        </div>
      ) : null}
    </div>
  );
}
