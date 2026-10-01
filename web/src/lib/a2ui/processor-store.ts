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
   * Advanced once every message in a revision's pending set has been
   * ATTEMPTED, whether or not all of them succeeded. This is a progress
   * marker for "nothing more to usefully do at this revision number", not a
   * success marker; `hasRenderableRoot` is what decides whether the result
   * is shown as a model or a failure.
   */
  appliedRevision: number;
  /**
   * The server's own `surface.part_id` (coordinator design, 2026-10-01): a
   * fresh transcript part id the server mints on every `createSurface`
   * (`gact/a2ui.py` ~412-421). A different part_id on a later reconcile
   * means this is a NEW surface lifecycle (a `deleteSurface` plus a
   * `createSurface`, delivered together, or a session resume) —
   * authoritative regardless of the revision number, since a recreate
   * starts the server's counter over. `undefined` only before the first
   * message has ever been applied.
   *
   * Replaces the earlier `createFingerprint` (hashing the `createSurface`
   * message's own content): two DIFFERENT createSurface lifecycles for the
   * same surface id can carry byte-identical content (the same catalogId,
   * no theme), which a content hash cannot tell apart but the server's own
   * minted part_id always can.
   */
  partId: string | undefined;
  /**
   * M2 (adversarial re-review): the merged `updateComponents` slot is
   * re-applied WHOLESALE on every component change to ANY id in it
   * (`applyPendingMessages`'s own doc comment) -- so an UNCHANGED bad
   * component is re-validated, and would be re-POSTed as a fresh
   * `VALIDATION_FAILED`, on every unrelated sibling edit. The server grants
   * one repair attempt per revision (S5), so that re-drives the agent on
   * every unrelated change forever. Keyed by component id, valued by a
   * fingerprint of the component definition last reported FOR that id in
   * the CURRENT create lifecycle -- a POST fires only when the (id,
   * definition) pair is new, i.e. the component is newly bad or its bad
   * definition actually changed. A fresh `Map` per `createProcessorEntry`
   * call already resets this on a recreate; nothing else to clear.
   */
  reportedFailures: Map<string, string>;
  /**
   * True once this surface has warned about talking to a server that
   * predates per-message revision stamps (`degradedProtocol`, below) --
   * reported once per surface lifetime (not once per rebuilt entry, since
   * the degraded path rebuilds `processor` on every revision by design), via
   * a separate ref the caller keeps across entry rebuilds.
   */
  errorSubscribed: boolean;
  errorUnsubscribe: () => void;
}

const EMPTY_RESULT: A2uiProcessorResult = {};

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
    partId: undefined,
    reportedFailures: new Map(),
    errorSubscribed: false,
    errorUnsubscribe: () => undefined,
  };
}

/** The surface's own root component — the renderability bar `@a2ui/react`'s `A2uiSurface` itself uses (`ROOT_COMPONENT_ID`, `node-resolver.js`): no root means an indefinite `LoadingPlaceholder`, not a crash. */
function hasRenderableRoot(model: SurfaceModel<ReactComponentImplementation> | undefined): boolean {
  return model?.componentsModel.get('root') !== undefined;
}

/** A human label for a component dict, for an inline notice/report -- never raw JSON. */
function componentLabel(component: unknown): string {
  if (component && typeof component === 'object') {
    const record = component as Record<string, unknown>;
    const type = typeof record.component === 'string' ? record.component : '';
    const id = typeof record.id === 'string' ? record.id : '';
    if (type || id) return `${type || 'Component'}${id ? ` (${id})` : ''}`;
  }
  return 'A component';
}

/** The component dict's own `id`, or a stable fallback for one with none (never thrown on). */
function componentIdOf(component: unknown): string {
  if (component && typeof component === 'object') {
    const id = (component as Record<string, unknown>).id;
    if (typeof id === 'string' && id) return id;
  }
  return '<no id>';
}

/**
 * Splits an `updateComponents` message into one message per component (F3,
 * coordinator design, 2026-10-01). `@a2ui/web_core`'s own
 * `processUpdateComponentsMessage` validates EVERY component in a message
 * before mutating ANY of them (atomic per call to `processMessages`), so a
 * message naming several components -- a bad one among good ones -- either
 * lands entirely or rejects entirely. Splitting makes each component its
 * own atomic unit: a bad one is skipped and reported (`applyPendingMessages`
 * below); its siblings, and every other pending message, still apply.
 *
 * Any other message type (`createSurface`/`updateDataModel`/`deleteSurface`)
 * is returned as its own single-element array, unsplit -- there is nothing
 * to split within one data-model write or one surface lifecycle event.
 */
function splitForPerComponentApply(message: A2uiMessage): A2uiMessage[] {
  if (!('updateComponents' in message)) return [message];
  const { surfaceId, components } = message.updateComponents;
  return components.map(
    (component) =>
      ({
        version: message.version,
        updateComponents: { surfaceId, components: [component] },
      }) as A2uiMessage,
  );
}

/**
 * Feeds `pending` into `entry.processor`, one component (or one whole
 * non-`updateComponents` message) at a time — never a multi-component
 * message through a single `processMessages` call, and never the whole
 * `pending` array through one call either, so a throw never stops later
 * work (F2/F3, coordinator design): every pending message, and every
 * component within an `updateComponents` message, is attempted regardless
 * of an earlier failure.
 *
 * G2 merge-gate finding (gact-tui#513 comment 5937313752) plus the
 * coordinator's adversarial follow-up: the real server keeps a bad
 * `updateComponents` in `surface.messages` forever (materialized into the
 * ONE current-state slot, `clio_agent/gact/a2ui_component_fold.py`, never
 * dropped), so a later, good change to a DIFFERENT component in that same
 * merged message arrives folded in ALONGSIDE the still-bad one, not in its
 * place -- the merged slot's stamp moves forward and the WHOLE slot is
 * re-applied, component by component, every time. A bad component is
 * skipped (its PREVIOUS value, if any, is left exactly as it was -- the
 * failed sub-message's mutation pass never ran) and reported through
 * `onValidationFailed`'s existing `VALIDATION_FAILED` door (no `path`, so
 * the generic inline notice fires -- unlike a rendered component's own
 * URL-scheme guard, a skipped component has no in-place replacement visual
 * of its own) so the repair lane can act on it, same as any other
 * client-detected violation.
 *
 * Returns the LAST failure encountered, if any — the caller only surfaces
 * the full failure card when the resulting model still has no renderable
 * root; otherwise a subsequent, successful message already overrode
 * whatever broke, or the failure never touched an already-good root, and a
 * full-card failure is moot (an inline notice already fired per component).
 *
 * M2 (adversarial re-review): the merged slot is re-applied WHOLESALE on
 * every change to ANY id in it, so an UNCHANGED bad component re-validates
 * -- and would re-POST a fresh `VALIDATION_FAILED` -- on every unrelated
 * sibling edit; the server grants one repair attempt per revision (S5), so
 * that re-drives the agent on every unrelated change forever.
 * `entry.reportedFailures` (component id -> last-reported definition) makes
 * the POST fire only when the (id, definition) pair is new. The inline
 * notice still fires every time (never suppressed) -- a `code` other than
 * `VALIDATION_FAILED` on a duplicate tells `a2ui-surface.tsx`'s handler to
 * show the local notice without re-POSTing anything.
 */
function applyPendingMessages(
  entry: ProcessorEntry,
  pending: A2uiMessage[],
  onValidationFailed: (error: { code: string; path?: string; message: string }) => void,
): A2uiProcessorFailure | undefined {
  let failure: A2uiProcessorFailure | undefined;
  for (const message of pending) {
    for (const part of splitForPerComponentApply(message)) {
      try {
        entry.processor.processMessages([part]);
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : 'The interactive surface could not be validated.';
        failure = { code: 'processor_error', message: detail };
        if ('updateComponents' in part) {
          const [component] = part.updateComponents.components;
          const componentId = componentIdOf(component);
          const definition = JSON.stringify(component);
          const alreadyReported = entry.reportedFailures.get(componentId) === definition;
          const noticeMessage = `${componentLabel(component)} could not be validated and was skipped: ${detail}`;
          if (alreadyReported) {
            onValidationFailed({ code: 'a2ui_component_failure_unchanged', message: noticeMessage });
          } else {
            entry.reportedFailures.set(componentId, definition);
            onValidationFailed({ code: 'VALIDATION_FAILED', message: noticeMessage });
          }
        }
      }
    }
  }
  return failure;
}

/**
 * F2 fallback (coordinator design): a server that predates per-message
 * revision stamps (`surface.message_revisions` absent, or length-mismatched
 * against `surface.messages` -- an older pinned clio-agent) cannot be
 * incrementally trusted: there is no way to tell "this slot changed" from
 * "this slot is unchanged" without the stamps this whole design replaces
 * content-fingerprinting with. The caller falls back to tearing down and
 * replaying the WHOLE stream fresh on every revision that moves forward --
 * correct, if not as cheap as the stamped path. Reported once per surface
 * lifetime (`reportedRef`, kept across entry rebuilds), never silently: a
 * console warning plus the existing local-notice door
 * (`onValidationFailed`, `code` deliberately NOT `VALIDATION_FAILED` so
 * a2ui-surface.tsx's handler only shows the local notice and does not also
 * POST a client-detected-violation report the server never asked for).
 */
function reportDegradedProtocol(
  onValidationFailed: (error: { code: string; path?: string; message: string }) => void,
): void {
  // L1 (adversarial re-review): worded from what is actually missing on
  // THIS surface row (no revision stamp, or no lifecycle id) -- never "an
  // older version", which this condition does not actually establish (a
  // row from a current server could in principle be missing one field
  // without the other). Plainly states the concrete, user-visible cost:
  // anything typed but not yet submitted is lost on every rebuild.
  const message =
    "This surface's data is missing what incremental updates need (a per-message revision stamp or a lifecycle id), so it rebuilds fully on every change -- any input you have not submitted yet is lost each time.";
  // eslint-disable-next-line no-console -- deliberate, typed degradation surface (no-silent-fallback)
  console.warn(`[A2UI] ${message}`);
  onValidationFailed({ code: 'a2ui_stamps_unavailable', message });
}

/**
 * One `MessageProcessor` per surface id, persistent across revisions — the
 * caller no longer remounts on `surface.revision`
 * (`docs/design/a2ui-compat-campaign-2026-09.md` S6 deletion: the
 * revision-keyed remount that wiped unsubmitted form state).
 *
 * Reconciliation (coordinator design, 2026-10-01 adversarial review of G2):
 * applies BY REVISION, never by content bytes. `surface.message_revisions`
 * stamps each slot in `surface.messages` (same index, same length) with the
 * revision that produced its CURRENT content — the merged `updateComponents`
 * slot (`a2ui_component_fold.py`) is re-stamped on every component change,
 * however small; every other slot keeps the stamp it was created with. A
 * slot is pending whenever `stamp > entry.appliedRevision`, full stop:
 * - a NEW create lifecycle (`surface.part_id` differs from the one this
 *   processor was built from) always rebuilds, regardless of revision
 *   number, since a recreate starts the server's counter over;
 * - otherwise, a revision at or behind what is already applied (a post-gap
 *   REST reconcile racing the live stream) is a no-op;
 * - otherwise, every slot whose stamp moved forward is (re-)applied, in
 *   stream order, as an UPSERT onto the EXISTING model
 *   (`updateComponents` on an existing component id replaces its
 *   properties in place). The merged slot is re-applied WHOLESALE on every
 *   bump — harmless, since an upsert of an already-current component is a
 *   no-op, and it is exactly how a REVERT (A -> B -> A) renders correctly:
 *   the third message's content is byte-identical to the first's, so a
 *   content fingerprint would have wrongly treated it as "already applied"
 *   and skipped it forever. Comparing the stamp instead of the bytes is the
 *   whole fix.
 *
 * `applyPendingMessages` splits a multi-component `updateComponents` slot
 * into one apply per component (F3) so one bad component is skipped and
 * reported without blocking its siblings or any other pending message
 * (F2). The failure card only replaces the rendered surface when NO
 * renderable root remains once the whole pending set has been tried
 * (`hasRenderableRoot`) — a bad component that never touched an
 * already-good root, or one a sibling message doesn't even reference yet,
 * must not block rendering everything else.
 *
 * A server that predates `message_revisions` gets the degraded, always-
 * rebuild-fresh fallback (`reportDegradedProtocol`), never silently.
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
  const degradedProtocolReportedRef = useRef(false);
  const [result, setResult] = useState<A2uiProcessorResult>(EMPTY_RESULT);
  const catalogIds = catalogs.map((catalog) => catalog.id).join(',');

  useLayoutEffect(() => {
    return () => {
      entryRef.current?.errorUnsubscribe();
      entryRef.current = undefined;
      degradedProtocolReportedRef.current = false;
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
    const stamps = surface.message_revisions;
    const hasRevisionStamps =
      Array.isArray(stamps) && stamps.length === incoming.length && surface.part_id !== undefined;

    // M1 (adversarial re-review): computed BEFORE branching on stamp
    // availability, and checked in BOTH branches below. A recreate (a fresh
    // `part_id`, the server's revision counter restarted for it) is
    // authoritative regardless of its revision number OR whether this
    // particular server happens to send stamps -- an older, stamp-less
    // server (e.g. 0.9.4.24) still sends a fresh `part_id` on every
    // `createSurface`. Computing this only inside the stamped branch meant
    // the degraded branch's own "at or behind" check ran first and returned
    // early, so a recreate delivered at a LOWER revision than the old
    // lifecycle was never even noticed against a stamp-less server.
    const isRecreate =
      entry.partId !== undefined &&
      surface.part_id !== undefined &&
      entry.partId !== surface.part_id;

    let pending: A2uiMessage[];

    if (hasRevisionStamps) {
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
      } else if (entry.partId !== undefined && surface.revision <= entry.appliedRevision) {
        // Same lifecycle, but at or behind what is already applied (a
        // post-gap REST reconcile racing the live stream) -- never
        // authoritative enough to regress an already-rendered surface.
        return;
      }
      entry.partId = surface.part_id;
      pending = incoming.filter((_, index) => stamps[index] > entry.appliedRevision);
    } else {
      if (!degradedProtocolReportedRef.current) {
        degradedProtocolReportedRef.current = true;
        reportDegradedProtocol(onValidationFailed);
      }
      if (!isRecreate && entry.partId !== undefined && surface.revision <= entry.appliedRevision) {
        return;
      }
      // No stamps to incrementally trust -- tear down and replay the WHOLE
      // stream fresh, whether this is a recreate or just a revision ahead.
      // `entry.partId` is still tracked (from `surface.part_id` when the
      // server sends one) purely so the no-op check above still skips a
      // redundant rebuild at an unchanged revision of the SAME lifecycle.
      entry.errorUnsubscribe();
      entry = createProcessorEntry(catalogs, catalogIds, handleAction, version);
      entryRef.current = entry;
      registerA2uiSurfaceProcessor(surface.session_id, surface.id, entry.processor);
      entry.partId = surface.part_id;
      pending = incoming;
    }

    const failure = pending.length > 0 ? applyPendingMessages(entry, pending, onValidationFailed) : undefined;
    entry.appliedRevision = surface.revision;

    const model = entry.processor.model.getSurface(surface.id);
    if (failure && !hasRenderableRoot(model)) {
      // The resulting state is still not renderable -- either nothing has
      // ever defined `root` yet and the one message that tried just failed,
      // or (same effect) a message that WOULD have fixed an already-broken
      // root never arrived. Show the failure; a missing root with no
      // failure at all (component data pending, not any error) instead
      // falls through to `setResult({ model })` below and
      // `@a2ui/react`'s own `LoadingPlaceholder`.
      setResult({ failure });
      return;
    }

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
