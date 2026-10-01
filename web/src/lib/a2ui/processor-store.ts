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
   * The server's own per-surface revision counter (`A2UISurface.revision`,
   * monotonic for one `createSurface` lifecycle — `gact/a2ui.py`'s
   * `_apply_staged_message` increments it once per applied message, and
   * resets to a FRESH count when a `deleteSurface` is followed by a new
   * `createSurface`). `-1` before anything has ever been applied, so the
   * very first revision (always >= 1) is never mistaken for stale.
   *
   * Only ever advanced after a FULLY successful apply pass — a batch that
   * throws partway through leaves it where it was, so a retry at the same
   * revision is not mistaken for a no-op.
   */
  appliedRevision: number;
  /**
   * Fingerprint of the `createSurface` message the current `processor` was
   * built from. A different fingerprint on a later revision means this is a
   * NEW surface lifecycle (a `deleteSurface` followed by a `createSurface`,
   * delivered together in one reconcile) — authoritative regardless of the
   * revision number, since a recreate starts the server's counter over.
   * `undefined` only before the first message has ever been applied.
   */
  createFingerprint: string | undefined;
  /**
   * Fingerprints of every message already folded into `processor`'s model
   * for the CURRENT create lifecycle. Membership, not array position,
   * decides what is new: the server COMPACTS `surface.messages` in place (a
   * corrected `updateComponents` drops every earlier `updateComponents` it
   * supersedes — `gact/a2ui.py`'s `_apply_staged_message`, ~449-458 — so a
   * later revision's array is a filtered-then-appended set, not a stable
   * append-only log an index or a prefix scan can safely replay against).
   * Each fingerprint is computed and cached exactly once, when the message
   * is applied, so a long-lived surface (inline chart data can be
   * thousands of rows) never re-stringifies its own history on a later
   * revision — only the current incoming array is fingerprinted, once each.
   */
  appliedFingerprints: Set<string>;
  errorSubscribed: boolean;
  errorUnsubscribe: () => void;
}

const EMPTY_RESULT: A2uiProcessorResult = {};

/** Cheap structural identity for one wire message (plain JSON, no cycles). */
function fingerprintA2uiMessage(message: A2uiMessage): string {
  return JSON.stringify(message);
}

/** The lifecycle-starting `createSurface` message, if `incoming` carries one. */
function findCreateSurfaceMessage(incoming: A2uiMessage[]): A2uiMessage | undefined {
  return incoming.find((message) => 'createSurface' in message);
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
    appliedRevision: -1,
    createFingerprint: undefined,
    appliedFingerprints: new Set(),
    errorSubscribed: false,
    errorUnsubscribe: () => undefined,
  };
}

interface PendingA2uiMessage {
  message: A2uiMessage;
  /** Computed once by the caller while filtering `incoming` -- never re-stringified here. */
  fingerprint: string;
}

/**
 * Feeds `pending` into `entry.processor` ONE message at a time — never the
 * whole batch through a single `processMessages` call — so a throw partway
 * through leaves `entry.appliedFingerprints` reflecting EXACTLY what the
 * model actually committed. A `createSurface` that lands before a sibling
 * `updateComponents` throws is recorded as applied; the next revision then
 * resumes after it instead of resending `createSurface` into a model that
 * already has it (`@a2ui/web_core`'s `Surface ${id} already exists.`, the
 * defect this replaces).
 */
function applyPendingMessages(
  entry: ProcessorEntry,
  pending: PendingA2uiMessage[],
): A2uiProcessorFailure | undefined {
  for (const { message, fingerprint } of pending) {
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
    entry.appliedFingerprints.add(fingerprint);
  }
  return undefined;
}

/**
 * One `MessageProcessor` per surface id, persistent across revisions — the
 * caller no longer remounts on `surface.revision`
 * (`docs/design/a2ui-compat-campaign-2026-09.md` S6 deletion: the
 * revision-keyed remount that wiped unsubmitted form state). Each revision
 * is reconciled against `entry`'s revision counter and fingerprint set,
 * never by replaying `surface.messages.slice(someIndex)` or rebuilding on
 * every change:
 * - a NEW create lifecycle (the incoming `createSurface` fingerprint
 *   differs from the one this processor was built from — a `deleteSurface`
 *   plus a `createSurface` delivered together in one reconcile) always
 *   rebuilds, regardless of its revision number, since a recreate starts
 *   the server's counter over;
 * - otherwise, a revision at or behind what is already applied (a post-gap
 *   REST reconcile racing the live stream, `processor-store-reconcile.
 *   test.tsx`) is never authoritative enough to regress an already-rendered
 *   surface, so it is a no-op;
 * - otherwise, every message in the new array NOT already applied — by
 *   fingerprint, not position, so a shrinking compaction (several earlier
 *   `updateComponents` replaced by one consolidating message) is still
 *   picked up — is applied, in order, as an UPSERT onto the EXISTING model
 *   (`updateComponents` on an existing component id replaces its
 *   properties in place, same as `@a2ui/web_core` already does for any
 *   repeat update). An ordinary same-id `updateComponents` therefore never
 *   rebuilds and never disturbs this surface's data model — a bound
 *   `TextField`'s typed input, a linked selection — because nothing is
 *   discarded; only unseen messages are folded in.
 *
 * The server never produces an array that requires UNDOING an already-
 * applied message within one lifecycle, so an upsert-only replay is always
 * sufficient short of an actual recreate.
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
    const incomingCreate = findCreateSurfaceMessage(incoming);
    const incomingCreateFingerprint = incomingCreate
      ? fingerprintA2uiMessage(incomingCreate)
      : undefined;
    const isRecreate =
      incomingCreateFingerprint !== undefined &&
      entry.createFingerprint !== undefined &&
      incomingCreateFingerprint !== entry.createFingerprint;

    if (isRecreate) {
      // A new create lifecycle (deleteSurface + createSurface delivered
      // together, e.g. in one reconcile) -- the server's revision counter
      // restarts for it, so it is authoritative regardless of its number.
      // Incremental replay cannot unwind the OLD lifecycle's applied
      // messages, so rebuild fresh and replay the new one from scratch.
      entry.errorUnsubscribe();
      entry = createProcessorEntry(catalogs, catalogIds, handleAction, version);
      entryRef.current = entry;
      registerA2uiSurfaceProcessor(surface.session_id, surface.id, entry.processor);
    } else if (entry.createFingerprint !== undefined && surface.revision <= entry.appliedRevision) {
      // Same lifecycle, but at or behind what is already applied (a
      // post-gap REST reconcile racing the live stream, `processor-store-
      // reconcile.test.tsx`) -- never authoritative enough to regress an
      // already-rendered surface. Wait for a revision that moves forward.
      return;
    }
    entry.createFingerprint = incomingCreateFingerprint ?? entry.createFingerprint;

    // Each incoming message is fingerprinted exactly once here; an already-
    // applied one is looked up in the cached `appliedFingerprints` set, not
    // re-stringified (a long-lived surface's inline data can be thousands of
    // rows, and most revisions only ever add one new message).
    const pending: PendingA2uiMessage[] = [];
    for (const message of incoming) {
      const fingerprint = fingerprintA2uiMessage(message);
      if (!entry.appliedFingerprints.has(fingerprint)) pending.push({ message, fingerprint });
    }
    if (pending.length > 0) {
      const failure = applyPendingMessages(entry, pending);
      if (failure) {
        setResult({ failure });
        return;
      }
    }
    entry.appliedRevision = surface.revision;

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
