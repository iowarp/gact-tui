import {
  buildA2uiClientCapabilities,
  buildA2uiClientDataModel,
  orderSupportedCatalogIds,
  setA2uiClientMetadataProvider,
} from '@clio/core/v3';
import type { A2UISurface } from '@clio/core/v3';
import {
  MessageProcessor,
  type A2uiClientAction,
  type A2uiMessage,
  type Catalog,
  type SurfaceModel,
} from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { useQueries } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import {
  collectA2uiClientDataModelSurfaces,
  disposeA2uiSessionRegistry,
  loadA2uiSessionCatalogs,
  markA2uiSessionRouteUnavailable,
  registerA2uiSurfaceProcessor,
  registrySnapshotSync,
  unregisterA2uiSurfaceProcessor,
  useA2uiRegistrySnapshot,
  type A2uiRegistrySnapshot,
} from './registry-store';

/**
 * OWNER — call once from the session's own data hook
 * (`web/src/hooks/use-workspace-data.ts`), never from a surface, with EVERY
 * session id a mounted surface can reference: the open session itself, any
 * session whose pending interaction owns an A2UI surface, and any session in
 * the open session's own subagent/child closure (a subagent canvas rendering
 * a child session's surface inline). Before S1 item A2, this only ever fetched
 * the "open" session — a surface keyed by another session id read a
 * lazily-created, never-populated registry entry (`registry-store.ts`'s
 * `entryFor`, which defaults `isLoading: true`) that nothing ever resolved,
 * so it stayed on "Resolving the interactive catalog…" forever.
 *
 * Fetches each session's catalogs and agent capability preference order,
 * resolves them into that session's own session-lifetime registry
 * (`registry-store.ts`), and registers the ONE client-metadata provider that
 * dispatches by the session id a repository door is actually calling for —
 * alive for as long as the owner itself is mounted, not tied to whether any
 * particular surface happens to be on screen right now (S6 adversarial
 * review, BLOCKING: a surface scrolling away must never clear the
 * advertisement, and a session with no surface at all must still advertise
 * on its first message).
 */
export function useA2uiSessionRegistry(sessionIds: readonly string[]): void {
  const repository = useRepository();
  const uniqueIds = [...new Set(sessionIds.filter((id): id is string => Boolean(id)))];
  const uniqueIdsKey = uniqueIds.join('\u0000');

  const rowsQueries = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['a2ui-catalogs', id],
      queryFn: ({ signal }) => repository.a2uiCatalogs(id, signal),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const capsQueries = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['a2ui-capabilities', id],
      queryFn: ({ signal }) => repository.a2uiCapabilities(id, signal),
      staleTime: 60_000,
      retry: false,
    })),
  });

  // `useQueries` returns a fresh array reference every render regardless of
  // whether any query's status actually changed -- fingerprint the
  // terminal-relevant fields so the effects below only rerun on a REAL
  // status/data transition, never on an unrelated parent re-render. Loading
  // ends on the query's own terminal state (`dataUpdatedAt`/`status`
  // reaching success, or the error branch below) -- never a timer.
  const rowsFingerprint = uniqueIds
    .map((id, i) => `${id}:${rowsQueries[i]?.status}:${rowsQueries[i]?.dataUpdatedAt ?? 0}`)
    .join('|');
  const capsFingerprint = uniqueIds
    .map((id, i) => `${id}:${capsQueries[i]?.status}:${capsQueries[i]?.dataUpdatedAt ?? 0}`)
    .join('|');

  useLayoutEffect(() => {
    uniqueIds.forEach((id, index) => {
      const rowsQuery = rowsQueries[index];
      const capsQuery = capsQueries[index];
      if (!rowsQuery || !capsQuery) return;
      if (rowsQuery.isError || capsQuery.isError) {
        // Handled once here, not thrown further: an older server without
        // A2UI support (or a real network failure) degrades to a typed,
        // recorded reason -- never a retry loop or a console error.
        markA2uiSessionRouteUnavailable(
          id,
          'The session server does not support the A2UI catalog registry routes.',
        );
        return;
      }
      loadA2uiSessionCatalogs(id, rowsQuery.data, rowsQuery.isLoading && !rowsQuery.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueIdsKey, rowsFingerprint, capsFingerprint]);

  useLayoutEffect(() => {
    const ids = uniqueIds;
    return () => {
      setA2uiClientMetadataProvider(undefined);
      for (const id of ids) disposeA2uiSessionRegistry(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueIdsKey]);

  useLayoutEffect(() => {
    if (uniqueIds.length === 0) return;
    setA2uiClientMetadataProvider((requestedSessionId) => {
      const index = uniqueIds.indexOf(requestedSessionId);
      if (index === -1) return {};
      const rowsQuery = rowsQueries[index];
      const capsQuery = capsQueries[index];
      const routeUnavailable = Boolean(rowsQuery?.isError || capsQuery?.isError);
      const preferenceOrder = capsQuery?.data?.agent['v0.9'].supportedCatalogIds ?? [];
      // A plain callback invoked outside React (not a hook), so it reads the
      // shared store through its non-hook accessor.
      const resolvedIds = registrySnapshotSync(requestedSessionId).registry.supportedCatalogIds();
      // S1 item 3 (no-silent-fallback): a broken/unavailable registry route
      // advertises NO catalogs -- never the client's own well-known fallback
      // ids. Before this fix, a parse failure here still advertised
      // `[clio-workspace, basic]`, which happened to intersect the session's
      // producible set, so the server's `select_catalog` picked a catalog
      // this client could not actually render and `create_a2ui_surface`
      // returned `created: true` for it -- the root cause of "Interactive
      // surface unavailable" reported alongside a successful-looking tool
      // result. Advertising nothing makes the server refuse with a typed
      // `a2ui_catalog_no_client_match` reason instead.
      const orderedIds = routeUnavailable
        ? []
        : orderSupportedCatalogIds(resolvedIds, preferenceOrder);
      const dataModelSurfaces = collectA2uiClientDataModelSurfaces(requestedSessionId);
      return {
        a2uiClientCapabilities: buildA2uiClientCapabilities(orderedIds),
        a2uiClientDataModel: buildA2uiClientDataModel(dataModelSurfaces),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueIdsKey, rowsFingerprint, capsFingerprint]);
}

/**
 * CONSUMER — read the session-lifetime registry a surface's session already
 * has open. Never fetches, never registers the metadata provider, and is
 * unaffected by any other surface mounting or unmounting.
 */
export function useA2uiCatalogRegistry(sessionId: string): A2uiRegistrySnapshot {
  return useA2uiRegistrySnapshot(sessionId);
}

export interface A2uiProcessorFailure {
  code: 'processor_error';
  message: string;
}

export interface A2uiProcessorResult {
  model?: SurfaceModel<ReactComponentImplementation>;
  failure?: A2uiProcessorFailure;
}

interface ProcessorEntry {
  processor: MessageProcessor<ReactComponentImplementation>;
  catalogsKey: string;
  appliedCount: number;
  errorSubscribed: boolean;
  errorUnsubscribe: () => void;
}

const EMPTY_RESULT: A2uiProcessorResult = {};

/**
 * One `MessageProcessor` per surface id, incremental (`processMessages` runs
 * only on messages beyond the last applied index) and persistent across
 * revisions — the caller no longer remounts on `surface.revision`
 * (`docs/design/a2ui-compat-campaign-2026-09.md` S6 deletion: the
 * revision-keyed remount that wiped unsubmitted form state). `onError` is
 * wired exactly once per processor to `onValidationFailed`, so a component's
 * `surface.dispatchError` (the URL-scheme guard, `checks`, or any other
 * client-detected violation) reaches the server the same way a processor
 * throw during `processMessages` reaches the UI: one pipe, no duplicate
 * wiring. The processor also registers itself with the session-lifetime
 * registry store so the ONE metadata provider can aggregate
 * `getClientDataModel()` across every live `sendDataModel` surface (S6 item 3).
 *
 * All mutable state lives behind a ref and is only ever touched inside
 * `useLayoutEffect` (never during the render body itself) so the surface's
 * own commit still lands before paint — no visible flash — while keeping
 * render pure.
 */
export function useA2uiSurfaceModel(
  surface: A2UISurface,
  catalogs: Catalog<ReactComponentImplementation>[],
  catalogsLoading: boolean,
  handleAction: (action: A2uiClientAction) => void | Promise<void>,
  onValidationFailed: (error: { code: string; path?: string; message: string }) => void,
): A2uiProcessorResult {
  const entryRef = useRef<ProcessorEntry | undefined>(undefined);
  const [result, setResult] = useState<A2uiProcessorResult>(EMPTY_RESULT);
  const catalogIds = catalogs.map((catalog) => catalog.id).join(',');

  useLayoutEffect(() => {
    return () => {
      entryRef.current?.errorUnsubscribe();
      entryRef.current = undefined;
      unregisterA2uiSurfaceProcessor(surface.session_id, surface.id);
    };
    // Torn down only when the surface identity itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface.id, surface.session_id]);

  useLayoutEffect(() => {
    // The registry has not resolved this session's catalogs yet — an empty
    // `catalogs` array right now says nothing about whether the surface's own
    // catalogId will resolve, so no attempt (and no failure) is recorded
    // until the first real answer arrives.
    if (catalogsLoading) {
      setResult(EMPTY_RESULT);
      return;
    }

    if (!entryRef.current || entryRef.current.catalogsKey !== catalogIds) {
      entryRef.current?.errorUnsubscribe();
      const processor = new MessageProcessor<ReactComponentImplementation>(catalogs, handleAction, {
        version: `v${surface.protocol_version}`,
      });
      entryRef.current = {
        processor,
        catalogsKey: catalogIds,
        appliedCount: 0,
        errorSubscribed: false,
        errorUnsubscribe: () => undefined,
      };
      registerA2uiSurfaceProcessor(surface.session_id, surface.id, processor);
    }
    const entry = entryRef.current;

    try {
      const pending = surface.messages.slice(entry.appliedCount) as A2uiMessage[];
      if (pending.length > 0) {
        entry.processor.processMessages(pending);
        entry.appliedCount = surface.messages.length;
      }
    } catch (error) {
      setResult({
        failure: {
          code: 'processor_error',
          message:
            error instanceof Error
              ? error.message
              : 'The interactive surface could not be validated.',
        },
      });
      return;
    }

    const model = entry.processor.model.getSurface(surface.id);
    if (model && !entry.errorSubscribed) {
      entry.errorSubscribed = true;
      const subscription = model.onError.subscribe(
        (error: { code?: string; path?: string; message?: string }) => {
          onValidationFailed({
            code: typeof error.code === 'string' ? error.code : 'VALIDATION_FAILED',
            path: typeof error.path === 'string' ? error.path : undefined,
            message:
              typeof error.message === 'string'
                ? error.message
                : 'The interactive surface reported an error.',
          });
        },
      );
      entry.errorUnsubscribe = () => subscription.unsubscribe();
    }

    setResult({ model });
    // `surface` (not just its id/messages) intentionally drives this effect:
    // a new message array reference is the signal that there is pending work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, catalogs, catalogIds, catalogsLoading, handleAction, onValidationFailed]);

  return result;
}
