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
  type MessageProcessorOptions,
  type SurfaceModel,
} from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { useQueries } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { classifyA2uiRegistryFailure, shouldRetryA2uiRegistryFailure } from './registry-failure';
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

  // `retry: shouldRetryA2uiRegistryFailure` (S1 adversarial follow-up): a
  // transient network blip must not stick for the session's whole
  // `staleTime: 60_000` window the way an unconditional `retry: false` did --
  // it retries a real `network_error` a few times with the library's own
  // exponential backoff, but never a `route_unavailable` (404/501, an older
  // server) or a `decode_failed` (a malformed response will not decode
  // differently on a second try).
  const rowsQueries = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['a2ui-catalogs', id],
      queryFn: ({ signal }) => repository.a2uiCatalogs(id, signal),
      staleTime: 60_000,
      retry: shouldRetryA2uiRegistryFailure,
    })),
  });
  const capsQueries = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['a2ui-capabilities', id],
      queryFn: ({ signal }) => repository.a2uiCapabilities(id, signal),
      staleTime: 60_000,
      retry: shouldRetryA2uiRegistryFailure,
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
        // Handled once here, not thrown further: the REAL typed cause
        // (route_unavailable / decode_failed / network_error) is recorded,
        // not one blanket "server does not support the routes" message that
        // used to fire for a transient 500 or a malformed response exactly
        // the same as a genuine 404 from an older server (S1 adversarial
        // follow-up, `registry-failure.ts`). Prefers the catalogs query's
        // own error when both failed -- it is the one this session's
        // surfaces actually render from.
        const failure = classifyA2uiRegistryFailure(
          rowsQuery.isError ? rowsQuery.error : capsQuery.error,
        );
        markA2uiSessionRouteUnavailable(id, failure.code, failure.detail);
        return;
      }
      loadA2uiSessionCatalogs(
        id,
        rowsQuery.data?.rows,
        rowsQuery.data?.rejected,
        rowsQuery.isLoading && !rowsQuery.data,
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueIdsKey, rowsFingerprint, capsFingerprint]);

  // Dispose only the ids that LEFT the set. Disposing a still-referenced id
  // (e.g. the open session when a child session joins) would delete the
  // entry mounted surfaces are subscribed to and drop their registered
  // processors -- they would never see the reloaded registry.
  const ownedIdsRef = useRef<string[]>([]);
  useLayoutEffect(() => {
    const current = new Set(uniqueIds);
    for (const id of ownedIdsRef.current) {
      if (!current.has(id)) disposeA2uiSessionRegistry(id);
    }
    ownedIdsRef.current = uniqueIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueIdsKey]);
  useLayoutEffect(
    () => () => {
      setA2uiClientMetadataProvider(undefined);
      for (const id of ownedIdsRef.current) disposeA2uiSessionRegistry(id);
    },
    [],
  );

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
  /**
   * The exact message objects already folded into `processor`'s model, in
   * order. Compared by VALUE against each new `surface.messages` snapshot —
   * never by array length or index — because the server COMPACTS that array
   * in place: a corrected `updateComponents` drops the `updateComponents`
   * it supersedes (`gact/a2ui.py`'s `_apply_staged_message`, ~449-458), so
   * the array a later revision carries is not a stable append-only log an
   * index can safely replay against.
   */
  appliedMessages: A2uiMessage[];
  errorSubscribed: boolean;
  errorUnsubscribe: () => void;
}

const EMPTY_RESULT: A2uiProcessorResult = {};

/** Cheap structural identity for one wire message (plain JSON, no cycles). */
function fingerprintA2uiMessage(message: A2uiMessage): string {
  return JSON.stringify(message);
}

/**
 * How many LEADING messages of `incoming` are value-identical to `applied`.
 * Once the two streams disagree at some index, nothing after it can be
 * trusted to still line up, so the scan stops at the first mismatch rather
 * than at the shorter array's end.
 */
function commonAppliedPrefixLength(applied: A2uiMessage[], incoming: A2uiMessage[]): number {
  const max = Math.min(applied.length, incoming.length);
  let index = 0;
  while (
    index < max &&
    fingerprintA2uiMessage(applied[index]) === fingerprintA2uiMessage(incoming[index])
  ) {
    index++;
  }
  return index;
}

function createProcessorEntry(
  catalogs: Catalog<ReactComponentImplementation>[],
  catalogsKey: string,
  handleAction: (action: A2uiClientAction) => void | Promise<void>,
  version: NonNullable<MessageProcessorOptions['version']>,
): ProcessorEntry {
  return {
    processor: new MessageProcessor<ReactComponentImplementation>(catalogs, handleAction, {
      version,
    }),
    catalogsKey,
    appliedMessages: [],
    errorSubscribed: false,
    errorUnsubscribe: () => undefined,
  };
}

/**
 * Feeds `pending` into `entry.processor` ONE message at a time — never the
 * whole batch through a single `processMessages` call — so a throw partway
 * through leaves `entry.appliedMessages` reflecting EXACTLY what the model
 * actually committed. A `createSurface` that lands before a sibling
 * `updateComponents` throws is recorded as applied; the next revision then
 * resumes right after it instead of resending `createSurface` into a model
 * that already has it (`@a2ui/web_core`'s `Surface ${id} already exists.`,
 * the defect this replaces).
 */
function applyPendingMessages(
  entry: ProcessorEntry,
  pending: A2uiMessage[],
): A2uiProcessorFailure | undefined {
  for (const message of pending) {
    try {
      entry.processor.processMessages([message]);
    } catch (error) {
      return {
        code: 'processor_error',
        message:
          error instanceof Error
            ? error.message
            : 'The interactive surface could not be validated.',
      };
    }
    entry.appliedMessages.push(message);
  }
  return undefined;
}

/**
 * One `MessageProcessor` per surface id, persistent across revisions — the
 * caller no longer remounts on `surface.revision`
 * (`docs/design/a2ui-compat-campaign-2026-09.md` S6 deletion: the
 * revision-keyed remount that wiped unsubmitted form state). Each revision
 * is reconciled against `entry.appliedMessages` **by value**, never by
 * replaying `surface.messages.slice(someIndex)`:
 * - a pure extension (everything already applied still matches the new
 *   array's prefix) is applied incrementally, same as before;
 * - a snapshot SHORTER than what's already applied (a post-gap REST
 *   reconcile racing the live stream, `processor-store-reconcile.test.tsx`)
 *   is never authoritative enough to regress an already-rendered surface, so
 *   it's a no-op;
 * - anything else — the new array disagrees with a message this processor
 *   already applied, whether from server-side compaction rewriting it in
 *   place or from a prior batch that threw partway through — rebuilds: a
 *   fresh processor replays the FULL compacted stream from scratch. A
 *   rebuild necessarily resets any in-progress local component state (e.g.
 *   unsubmitted form input) for this surface; that is the honest cost of a
 *   stream the processor cannot incrementally unwind, and it only happens on
 *   a genuine divergence, not on every revision.
 *
 * `onError` is wired exactly once per processor to `onValidationFailed`, so a
 * component's `surface.dispatchError` (the URL-scheme guard, `checks`, or any
 * other client-detected violation) reaches the server the same way a
 * processor throw during `processMessages` reaches the UI: one pipe, no
 * duplicate wiring. The processor also registers itself with the
 * session-lifetime registry store so the ONE metadata provider can aggregate
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

    // `surface.protocol_version` is `typeof A2UI_VERSION` ('0.9.1' today), so
    // this is always a real `MessageProcessorOptions['version']` member; the
    // cast only exists because a plain template literal widens to `string`.
    const version = `v${surface.protocol_version}` as NonNullable<MessageProcessorOptions['version']>;
    if (!entryRef.current || entryRef.current.catalogsKey !== catalogIds) {
      entryRef.current?.errorUnsubscribe();
      entryRef.current = createProcessorEntry(catalogs, catalogIds, handleAction, version);
      registerA2uiSurfaceProcessor(surface.session_id, surface.id, entryRef.current.processor);
    }
    let entry = entryRef.current;

    const incoming = surface.messages as A2uiMessage[];
    if (incoming.length < entry.appliedMessages.length) {
      // Behind what this processor already rendered -- never discard an
      // already-rendered surface (and whatever local state it holds) for a
      // snapshot that carries less than we already applied. Wait for a
      // revision that is a forward extension instead.
      return;
    }
    if (commonAppliedPrefixLength(entry.appliedMessages, incoming) < entry.appliedMessages.length) {
      // Genuine divergence: the new stream disagrees with a message this
      // processor already committed. Incremental replay cannot unwind an
      // applied message, so rebuild fresh and replay the full compacted
      // stream -- this is also what lets a surface that failed partway
      // through an earlier batch recover instead of resending a
      // `createSurface` the (old) model already has.
      entry.errorUnsubscribe();
      entry = createProcessorEntry(catalogs, catalogIds, handleAction, version);
      entryRef.current = entry;
      registerA2uiSurfaceProcessor(surface.session_id, surface.id, entry.processor);
    }

    const pending = incoming.slice(entry.appliedMessages.length);
    if (pending.length > 0) {
      const failure = applyPendingMessages(entry, pending);
      if (failure) {
        setResult({ failure });
        return;
      }
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
