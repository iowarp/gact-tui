import { useEffect, useState } from 'react';
import { useQueryClient, type Query, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { recordById } from '@/lib/entities';
import { queryKeys } from '@/lib/query-keys';
import {
  CONNECTION_PROBE_TIMEOUT_MS,
  LIVE_PROVENANCE_REFRESH_MS,
  LIVE_SESSION_LIST_REFRESH_MS,
  STREAM_OFFLINE_AFTER_MS,
  STREAM_RECONNECT_BASE_MS,
  TRANSCRIPT_PAGE_SIZE,
} from '@/lib/runtime-limits';
import { serviceUnreachable } from '@/lib/connection-attempt';
import { clearCachedSessionModelReferences } from '@/lib/session-model-state';
import { FrameBatcher } from '@/lib/streaming/frame-batcher';
import { abortableDelay, nextReconnectDelay } from '@/lib/streaming/reconnect';
import { streamNoticeForFrame } from '@/lib/streaming/stream-notices';
import { LiveSourceRefresher } from '@/lib/streaming/live-source-updates';
import { ScienceEntryMerger } from '@/lib/streaming/science-log-updates';
import { taskUpdateForFrame } from '@/lib/streaming/task-updates';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { listenForDesktopResume } from '@/tauri/desktop-lifecycle';
import { dispatchMcpAppToolCallFrame } from '@/components/clio/mcp-app-view-tools';
import { useRepository } from './use-repository';

interface SessionLiveStreamInput {
  enabled: boolean;
  initialCursor?: string;
  sessionId: string;
  workspaceId: string;
}

/** Owns focused-session streaming, reconnect backoff, and gap reconciliation. */
export function useSessionLiveStream({
  enabled,
  initialCursor,
  sessionId,
  workspaceId,
}: SessionLiveStreamInput): string | undefined {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const streamState = useLiveStore((state) => state.entities.stream);
  const gapCount = useLiveStore((state) => state.entities.streamGaps ?? 0);
  const streamError = useLiveStore((state) => state.error);
  const applyFrames = useLiveStore((state) => state.applyFrames);
  const clearSessionModelReferences = useLiveStore((state) => state.clearSessionModelReferences);
  const reconcileSnapshots = useLiveStore((state) => state.reconcileSnapshots);
  const setStreamError = useLiveStore((state) => state.setStreamError);
  const setStreamState = useLiveStore((state) => state.setStreamState);
  const [reconnectEpoch, setReconnectEpoch] = useState(0);
  const [documentVisible, setDocumentVisible] = useState(
    () => document.visibilityState === 'visible',
  );

  useEffect(() => {
    let lastReconnectAt = Number.NEGATIVE_INFINITY;
    const reconnect = () => {
      const now = performance.now();
      if (now - lastReconnectAt < STREAM_RECONNECT_BASE_MS) return;
      lastReconnectAt = now;
      setReconnectEpoch((value) => value + 1);
    };
    const reconnectWhenVisible = () => {
      const visible = document.visibilityState === 'visible';
      setDocumentVisible(visible);
      if (visible) reconnect();
    };
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', reconnectWhenVisible);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenForDesktopResume(reconnect).then(
      (dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      },
      () => undefined,
    );
    return () => {
      disposed = true;
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', reconnectWhenVisible);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !sessionId || !documentVisible) return;
    const { claimStream, releaseStream } = useLiveStore.getState();
    claimStream();
    const controller = new AbortController();
    const batcher = new FrameBatcher(applyFrames);
    const invalidations = new QueryInvalidationBatcher(queryClient);
    // Science log entries merge into the study read once per display frame.
    const science = new ScienceEntryMerger(queryClient, settings.endpoint, sessionId);
    const liveSources = new LiveSourceRefresher(queryClient, settings.endpoint, sessionId);
    let reconnectDelay = STREAM_RECONNECT_BASE_MS;
    let resumeCursor = initialCursor;
    let reconcileBeforeConnect = false;
    let failingSince: number | undefined;
    // Whether /v1/health could not be reached. A health check that is merely slow
    // (a warming agent can take many seconds) is not an outage.
    const serviceDown = async () => {
      const probe = new AbortController();
      const stop = () => probe.abort();
      controller.signal.addEventListener('abort', stop, { once: true });
      const timer = window.setTimeout(stop, CONNECTION_PROBE_TIMEOUT_MS);
      try {
        await repository.serviceHealth(probe.signal);
        return false;
      } catch (error) {
        if (probe.signal.aborted) return false;
        return serviceUnreachable(error instanceof Error ? error : undefined);
      } finally {
        window.clearTimeout(timer);
        controller.signal.removeEventListener('abort', stop);
      }
    };
    // A drop reads "Resuming updates" at first. Once it has lasted past the
    // reconnect window, a retry that could not reach the service, or a failed
    // /v1/health probe after any other drop, reads offline until it answers.
    const reportDrop = async (error?: unknown) => {
      reconcileBeforeConnect = true;
      failingSince ??= performance.now();
      if (performance.now() - failingSince < STREAM_OFFLINE_AFTER_MS) {
        setStreamState('reconnecting');
        return;
      }
      const down =
        serviceUnreachable(error instanceof Error ? error : undefined) || (await serviceDown());
      if (!controller.signal.aborted) setStreamState(down ? 'offline' : 'reconnecting');
    };
    const reconcileAfterDisconnect = async () => {
      const [workspaces, sessions, transcript, surfaces] = await Promise.all([
        repository.workspaces(controller.signal),
        repository.sessionFamily(sessionId, controller.signal),
        repository.transcript(sessionId, controller.signal, { limit: TRANSCRIPT_PAGE_SIZE }),
        // The surfaces route folds every part, so a surface whose creation is older than
        // the transcript page, or that a background script feeds, is not lost on reconnect.
        repository.surfaces(sessionId, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      queryClient.setQueryData(queryKeys.workspaces(settings.endpoint), workspaces);
      queryClient.setQueryData(queryKeys.sessionFamily(settings.endpoint, sessionId), sessions);
      queryClient.setQueryData(queryKeys.transcriptPage(settings.endpoint, sessionId), transcript);
      reconcileSnapshots({
        workspaces: recordById(workspaces),
        sessions: recordById(sessions),
        messages: recordById(transcript.messages),
        tools: recordById(transcript.tools),
        tasks: recordById(transcript.tasks),
        subagents: recordById(transcript.subagents),
        artifacts: recordById(transcript.artifacts),
        surfaces: { ...recordById(transcript.surfaces), ...recordById(surfaces) },
        revisions: {},
      });
      resumeCursor = transcript.cursor ?? resumeCursor;
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: queryKeys.capabilities(settings.endpoint) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.languageModelConfiguration(settings.endpoint),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providerModels(settings.endpoint) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providerCatalog(settings.endpoint) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessionArtifacts(settings.endpoint, sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessionObservability(settings.endpoint, sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessionContext(settings.endpoint, sessionId),
        }),
        // A queued message drained while the stream was down leaves no event to replay.
        queryClient.invalidateQueries({
          queryKey: queryKeys.queuedMessages(settings.endpoint, sessionId),
        }),
      ]);
    };
    const consume = async () => {
      setStreamState('connecting');
      while (!controller.signal.aborted) {
        try {
          if (reconcileBeforeConnect) {
            await reconcileAfterDisconnect();
            if (controller.signal.aborted) break;
            reconcileBeforeConnect = false;
          }
          const cursor = latestCursor(useLiveStore.getState().entities.cursor, resumeCursor);
          for await (const frame of repository.stream(
            { connection_id: 'active', workspace_id: workspaceId, session_id: sessionId },
            cursor,
            controller.signal,
          )) {
            reconnectDelay = STREAM_RECONNECT_BASE_MS;
            failingSince = undefined;
            setStreamState('live');
            if (frame.eventName === 'lm.provider.changed') {
              clearCachedSessionModelReferences(queryClient, settings.endpoint);
              clearSessionModelReferences();
            }
            batcher.push(frame);
            science.push(frame);
            liveSources.push(frame);
            dispatchMcpAppToolCallFrame(frame);
            if (frame.eventName === 'message.completed') {
              batcher.flush();
            }
            const taskUpdate = taskUpdateForFrame(frame);
            invalidations.push(
              ...queryInvalidationKeysForEvent({
                endpoint: settings.endpoint,
                eventName: frame.eventName,
                sessionId,
                workspaceId,
                taskOwnerSessionId: taskUpdate?.owner_session_id,
                taskInvocationId: taskUpdate?.invocation_id,
                cursor: frame.cursor,
              }),
            );
            if (frame.eventName === 'message.completed') invalidations.flushThrottled();
            const notice = streamNoticeForFrame(frame);
            if (notice)
              toast.error(notice.title, { id: notice.id, description: notice.description });
          }
          // The iterator ended without the consumer aborting it — whether or
          // not a frame ever arrived, the connection is gone (server close,
          // idle timeout, network drop). Reporting 'live' here would be a
          // status lie; the next loop iteration's first frame flips it back.
          if (!controller.signal.aborted) await reportDrop();
        } catch (error) {
          if (controller.signal.aborted) break;
          if (error instanceof Error && error.name === 'AbortError') {
            reconcileBeforeConnect = true;
            setStreamState('reconnecting');
            break;
          }
          await reportDrop(error);
        }
        await abortableDelay(controller, reconnectDelay);
        reconnectDelay = nextReconnectDelay(reconnectDelay);
      }
    };
    void consume();
    return () => {
      releaseStream();
      controller.abort();
      batcher.stop({ flush: true });
      invalidations.stop({ flush: true });
      science.stop({ flush: true });
      liveSources.stop({ flush: true });
    };
  }, [
    applyFrames,
    clearSessionModelReferences,
    documentVisible,
    enabled,
    initialCursor,
    queryClient,
    reconcileSnapshots,
    reconnectEpoch,
    repository,
    sessionId,
    setStreamState,
    settings.endpoint,
    workspaceId,
  ]);

  useEffect(() => {
    if (streamState !== 'gapped' || !workspaceId || !sessionId) return;
    const controller = new AbortController();
    const reconcile = async () => {
      try {
        const [workspaces, sessions, transcript] = await Promise.all([
          repository.workspaces(controller.signal),
          repository.sessionFamily(sessionId, controller.signal),
          repository.transcript(sessionId, controller.signal, { limit: TRANSCRIPT_PAGE_SIZE }),
        ]);
        if (controller.signal.aborted) return;
        queryClient.setQueryData(queryKeys.workspaces(settings.endpoint), workspaces);
        queryClient.setQueryData(queryKeys.sessionFamily(settings.endpoint, sessionId), sessions);
        queryClient.setQueryData(
          queryKeys.transcriptPage(settings.endpoint, sessionId),
          transcript,
        );
        reconcileSnapshots({
          workspaces: recordById(workspaces),
          sessions: recordById(sessions),
          messages: recordById(transcript.messages),
          tools: recordById(transcript.tools),
          tasks: recordById(transcript.tasks),
          subagents: recordById(transcript.subagents),
          artifacts: recordById(transcript.artifacts),
          surfaces: recordById(transcript.surfaces),
          revisions: {},
        });
        setStreamState('live');
      } catch (error) {
        if (controller.signal.aborted) return;
        setStreamError(
          `Gap recovery failed: ${error instanceof Error ? error.message : 'authoritative snapshot unavailable'}`,
        );
      }
    };
    void reconcile();
    return () => controller.abort();
  }, [
    queryClient,
    reconcileSnapshots,
    repository,
    sessionId,
    setStreamError,
    setStreamState,
    settings.endpoint,
    streamState,
    gapCount, // a later gap restarts the reconcile with a fresh snapshot
    workspaceId,
  ]);

  return streamError;
}

function isPendingInteractionEvent(eventName: string): boolean {
  return [
    'permission.',
    'user_question.',
    'approval.',
    'question.',
    'a2ui.',
    'mcp.task.',
    'mcp_task.',
    'agent.task.',
    'agent_task.',
    'task.',
    'agent_elicitation_',
  ].some((prefix) => eventName.startsWith(prefix));
}

function isProcessEvent(eventName: string): boolean {
  return [
    'task.',
    'agent.task.',
    'agent_task.',
    'mcp.task.',
    'mcp_task.',
    'run.',
    'subagent.',
  ].some((prefix) => eventName.startsWith(prefix));
}

function isModelConfigurationEvent(eventName: string): boolean {
  return (
    eventName === 'lm.provider.changed' ||
    eventName === 'lm.provider.failed' ||
    eventName === 'provider_catalog.refreshed'
  );
}

function isPendingSteerEvent(eventName: string): boolean {
  return (
    eventName === 'message.accepted' ||
    eventName === 'message.cancelled' ||
    eventName.startsWith('pending_steer.') ||
    eventName === 'message.upserted' ||
    // A promotion submits the queued message, which becomes a pending steer
    // whenever the turn it joins is already running.
    eventName === 'queued_message.promoted'
  );
}

function isQueuedMessageEvent(eventName: string): boolean {
  return (
    eventName.startsWith('queued_message.') ||
    // The service drains a queued message into the next turn as a new user
    // message and sends no queued_message.* event for it.
    eventName === 'message.upserted'
  );
}

function isResourceEvent(eventName: string): boolean {
  return eventName.startsWith('resource.');
}

function isSessionArtifactEvent(eventName: string): boolean {
  return [
    'artifact.created',
    'artifact.version.added',
    'artifact.alias.moved',
    'artifact.used',
    'artifact.enriched',
  ].includes(eventName);
}

/**
 * The extra reads one resource event changes, beyond the workspace list.
 *
 * Kept per event rather than blanket: an upload progress tick must not refetch
 * derivatives, structure and deliveries for the whole workspace.
 */
function resourceInvalidationKeys(
  eventName: string,
  endpoint: string,
  workspaceId: string,
): QueryKey[] {
  // A conversion that ended — completed, failed, or cancelled — settles the
  // derivatives and the structure alike; a cancellation leaves exactly the same
  // reads stale as a failure does.
  if (
    eventName === 'resource.processing_completed' ||
    eventName === 'resource.processing_failed' ||
    eventName === 'resource.processing_cancelled'
  ) {
    return [
      queryKeys.workspaceResourceDerivatives(endpoint, workspaceId),
      queryKeys.workspaceResourceStructure(endpoint, workspaceId),
      queryKeys.workspaceResourceStructureNode(endpoint, workspaceId),
    ];
  }
  if (eventName === 'resource.delivery_resolved') {
    return [queryKeys.workspaceResourceDeliveries(endpoint, workspaceId)];
  }
  return [];
}

interface QueryInvalidationEvent {
  cursor?: string;
  taskOwnerSessionId?: string;
  taskInvocationId?: string;
  endpoint: string;
  eventName: string;
  sessionId: string;
  workspaceId: string;
}

/** Maps wire events to the authoritative REST snapshots that must be refreshed. */
export function queryInvalidationKeysForEvent({
  endpoint,
  eventName,
  sessionId,
  workspaceId,
  taskOwnerSessionId,
  taskInvocationId,
  cursor,
}: QueryInvalidationEvent): QueryKey[] {
  // A background script's live feed sends transient upserts (no cursor) every tick;
  // they change a surface, never a pending interaction, so nothing is refetched.
  if (eventName === 'a2ui.surface.upserted' && cursor === '') return [];
  const keys: QueryKey[] = [];
  if (eventName === 'task.updated' && taskOwnerSessionId === sessionId && taskInvocationId) {
    keys.push(queryKeys.transcript(endpoint, sessionId));
  }
  if (isPendingInteractionEvent(eventName)) {
    // Approvals and questions are both read unscoped now (a descendant
    // session can raise either), so the invalidation must be the
    // endpoint-level prefix each query is actually keyed under, not a
    // per-session key that would never match the shared cache entry.
    keys.push(
      // The sessions waiting on a person change with every pending interaction.
      queryKeys.sessionsWaiting(endpoint),
      queryKeys.pendingInteractions(endpoint),
      queryKeys.pendingApprovals(endpoint),
      queryKeys.key('pending-questions', endpoint),
    );
  }
  if (isProcessEvent(eventName)) {
    keys.push(
      queryKeys.sessionObservabilityDetail(endpoint, sessionId, 'processes'),
      queryKeys.allSessionReads(endpoint),
    );
  }
  if (eventName === 'semantic.event') {
    keys.push(queryKeys.sessionObservabilityDetail(endpoint, sessionId, 'agent-iterations'));
    keys.push(['session-work', endpoint, sessionId]);
  }
  // The agent wrote its plan or todos: the Work rail refreshes now, not on its next poll.
  if (eventName === 'session.work.updated') {
    keys.push(['session-work', endpoint, sessionId]);
  }
  // A turn ended (a scheduled one included) or work changed: next runs may have moved.
  if (eventName === 'session.work.updated' || eventName === 'message.completed') {
    keys.push(['session-work-schedules', endpoint, sessionId]);
  }
  // A browser page opened, changed or closed: the Browser tabs and the Work rail refresh.
  if (eventName.startsWith('browser.page.')) {
    keys.push(['browser-pages', endpoint, sessionId]);
  }
  if (isModelConfigurationEvent(eventName)) {
    keys.push(
      queryKeys.capabilities(endpoint),
      queryKeys.languageModelConfiguration(endpoint),
      queryKeys.providerModels(endpoint),
      queryKeys.providerCatalog(endpoint),
    );
  }
  if (eventName === 'lm.provider.changed') {
    keys.push(queryKeys.key('sessions', endpoint), queryKeys.key('session-defaults', endpoint));
  }
  if (isPendingSteerEvent(eventName)) {
    keys.push(queryKeys.pendingSteers(endpoint, sessionId));
  }
  if (isQueuedMessageEvent(eventName)) {
    keys.push(queryKeys.queuedMessages(endpoint, sessionId));
  }
  if (isResourceEvent(eventName)) {
    keys.push(
      queryKeys.workspaceResources(endpoint, workspaceId),
      ...resourceInvalidationKeys(eventName, endpoint, workspaceId),
    );
  }
  if (isSessionArtifactEvent(eventName)) {
    keys.push(queryKeys.sessionArtifacts(endpoint, sessionId));
  }
  if (eventName === 'message.completed') {
    keys.push(
      queryKeys.transcript(endpoint, sessionId),
      queryKeys.allSessionReads(endpoint),
      // Artifact lifecycle records are emitted as semantic events on current
      // runtimes. Reconcile the registry at the authoritative turn boundary so
      // a newly returned resource link never waits for a page reload.
      queryKeys.sessionArtifacts(endpoint, sessionId),
      queryKeys.sessionObservability(endpoint, sessionId),
      queryKeys.sessionContext(endpoint, sessionId),
    );
  }
  // The Files view no longer has a live-event trigger (owner decision: the
  // server-side watcher was dropped after an event-storm defect). It refreshes
  // via polling while mounted + visible (use-workspace-data.ts's
  // refetchInterval), an immediate refetch on open, and the manual Refresh
  // button -- see workbench-resource-browser.tsx's FileBrowser. This is
  // deliberately NOT restoring the old message.completed/fs-or-shell-tool
  // triggers: polling already covers what those approximated, without a
  // hand-maintained event list.
  if (eventName === 'session.status_changed' || eventName === 'session.upserted') {
    keys.push(queryKeys.allSessionReads(endpoint));
  }
  // Execution provenance is a durable projection over the semantic ledger,
  // child lifecycle and artifact custody records. Refresh its provider-keyed
  // queries at those authoritative boundaries so the Timeline does not freeze
  // at the first snapshot it happened to read while a run was still active.
  if (
    eventName === 'semantic.event' ||
    eventName === 'message.completed' ||
    isProcessEvent(eventName) ||
    isSessionArtifactEvent(eventName)
  ) {
    // A child's recorded activity also changes its ancestor's family projection.
    // Prefix invalidation refreshes mounted family queries without polling or fanout.
    keys.push(queryKeys.key('execution-provenance', endpoint));
  }
  return keys;
}

/**
 * Reads refreshed at most once per window while a turn streams, in milliseconds:
 * the first event refreshes now, later ones in the window refresh once at its end,
 * and the turn's `message.completed` refreshes them all at once. Execution
 * provenance is a graph read that takes seconds on a long session, so per-event
 * refetches cancelled each other and never settled; the session lists are read
 * by many queries and change with every process and status event.
 */
const THROTTLED_INVALIDATION_MS: Readonly<Record<string, number>> = {
  'execution-provenance': LIVE_PROVENANCE_REFRESH_MS,
  sessions: LIVE_SESSION_LIST_REFRESH_MS,
  'session-work': LIVE_SESSION_LIST_REFRESH_MS,
};

/**
 * A query that a session's stream must not refresh: its data belongs to another
 * conversation, so this stream's events never change it (`meta`).
 */
export const OUTSIDE_LIVE_STREAM = { liveStreamInvalidation: false } as const;

function refreshedByStream(query: Query): boolean {
  return query.meta?.liveStreamInvalidation !== false;
}

class QueryInvalidationBatcher {
  private readonly pending = new Map<string, QueryKey>();
  /** Window-opening refreshes of throttled reads; they never abort a read in flight. */
  private readonly leading = new Map<string, QueryKey>();
  private readonly throttled = new Map<string, { key: QueryKey; due: boolean; timer?: number }>();
  private readonly lastRefresh = new Map<string, number>();
  private scheduled = false;
  private stopped = false;

  constructor(
    private readonly queryClient: Pick<QueryClient, 'invalidateQueries' | 'isFetching'>,
  ) {}

  push(...keys: QueryKey[]): void {
    if (this.stopped) return;
    for (const key of keys) {
      const id = JSON.stringify(key);
      const windowMs = THROTTLED_INVALIDATION_MS[String(key[0])];
      if (windowMs === undefined) {
        this.pending.set(id, key);
        continue;
      }
      const elapsed = Date.now() - (this.lastRefresh.get(id) ?? 0);
      const entry = this.throttled.get(id);
      if (entry) {
        entry.due = true;
      } else if (elapsed >= windowMs) {
        this.leading.set(id, key);
        this.lastRefresh.set(id, Date.now());
        this.throttled.set(id, { key, due: false, timer: this.windowEnd(id, windowMs) });
      } else {
        this.throttled.set(id, { key, due: true, timer: this.windowEnd(id, windowMs - elapsed) });
      }
    }
    if (this.scheduled || this.pending.size + this.leading.size === 0) return;
    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }

  /**
   * The turn ended: refresh every throttled read now, with nothing left waiting.
   * A read already in flight is allowed to finish and is then read once more, so
   * the final state arrives without aborting a request.
   */
  flushThrottled(): void {
    for (const [id, entry] of this.throttled) {
      window.clearTimeout(entry.timer);
      if (entry.due) this.refreshAfterInFlight(entry.key);
      this.lastRefresh.set(id, Date.now());
    }
    this.throttled.clear();
  }

  flush(): void {
    this.scheduled = false;
    const keys = [...this.pending.values()];
    const leading = [...this.leading.values()];
    this.pending.clear();
    this.leading.clear();
    this.invalidate(keys, true);
    this.invalidate(leading, false);
  }

  stop({ flush }: { flush: boolean }): void {
    if (flush) {
      this.flushThrottled();
      this.flush();
    }
    for (const entry of this.throttled.values()) window.clearTimeout(entry.timer);
    this.throttled.clear();
    this.stopped = true;
    this.pending.clear();
    this.leading.clear();
  }

  private windowEnd(id: string, delayMs: number): number {
    return window.setTimeout(() => {
      const entry = this.throttled.get(id);
      this.throttled.delete(id);
      if (!entry?.due || this.stopped) return;
      this.lastRefresh.set(id, Date.now());
      // A read still in flight from the window's start is kept, not restarted.
      this.invalidate([entry.key], false);
    }, delayMs);
  }

  private refreshAfterInFlight(queryKey: QueryKey): void {
    const inFlight = this.queryClient.isFetching({ queryKey, predicate: refreshedByStream }) > 0;
    const refresh = () =>
      this.queryClient.invalidateQueries(
        { queryKey, predicate: refreshedByStream },
        { cancelRefetch: false },
      );
    void refresh()
      .catch(() => undefined)
      .then(() => {
        if (inFlight && !this.stopped) return refresh();
      })
      .catch(() => undefined);
  }

  private invalidate(keys: readonly QueryKey[], cancelRefetch: boolean): void {
    if (keys.length === 0) return;
    void Promise.allSettled(
      keys.map((queryKey) =>
        this.queryClient.invalidateQueries(
          { queryKey, predicate: refreshedByStream },
          { cancelRefetch },
        ),
      ),
    );
  }
}

function latestCursor(
  current: string | undefined,
  snapshot: string | undefined,
): string | undefined {
  // Once streaming owns entities, REST hydration deliberately cannot overwrite
  // them. A newer snapshot cursor therefore does not prove its updates were
  // applied. Resume after the last consumed frame, or completions between the
  // two cursors disappear when a hidden tab returns or a snapshot refetches.
  return current || snapshot;
}
