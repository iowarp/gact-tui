import { useEffect, useState } from 'react';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { recordById } from '@/lib/entities';
import { queryKeys } from '@/lib/query-keys';
import { FrameBatcher } from '@/lib/streaming/frame-batcher';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { listenForDesktopResume } from '@/tauri/desktop-lifecycle';
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
  const streamError = useLiveStore((state) => state.error);
  const applyFrames = useLiveStore((state) => state.applyFrames);
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
      if (now - lastReconnectAt < 250) return;
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
    const controller = new AbortController();
    const batcher = new FrameBatcher(applyFrames);
    const invalidations = new QueryInvalidationBatcher(queryClient);
    let reconnectDelay = 250;
    const consume = async () => {
      setStreamState('connecting');
      while (!controller.signal.aborted) {
        let receivedFrame = false;
        try {
          const cursor = latestCursor(useLiveStore.getState().entities.cursor, initialCursor);
          for await (const frame of repository.stream(
            { connection_id: 'active', workspace_id: workspaceId, session_id: sessionId },
            cursor,
            controller.signal,
          )) {
            receivedFrame = true;
            reconnectDelay = 250;
            setStreamState('live');
            batcher.push(frame);
            if (frame.eventName === 'message.completed') {
              batcher.flush();
            }
            invalidations.push(
              ...queryInvalidationKeysForEvent({
                endpoint: settings.endpoint,
                eventName: frame.eventName,
                sessionId,
                workspaceId,
              }),
            );
          }
          if (!controller.signal.aborted && !receivedFrame) setStreamState('reconnecting');
        } catch (error) {
          if (controller.signal.aborted) break;
          setStreamState('reconnecting');
          if (error instanceof Error && error.name === 'AbortError') break;
        }
        await abortableDelay(controller, reconnectDelay);
        reconnectDelay = Math.min(8_000, reconnectDelay * 2);
      }
    };
    void consume();
    return () => {
      controller.abort();
      batcher.stop({ flush: true });
      invalidations.stop({ flush: true });
    };
  }, [
    applyFrames,
    documentVisible,
    enabled,
    initialCursor,
    queryClient,
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
          repository.sessions(workspaceId, controller.signal),
          repository.transcript(sessionId, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        queryClient.setQueryData(queryKeys.workspaces(settings.endpoint), workspaces);
        queryClient.setQueryData(queryKeys.sessions(settings.endpoint, workspaceId), sessions);
        queryClient.setQueryData(queryKeys.transcript(settings.endpoint, sessionId), transcript);
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
    workspaceId,
  ]);

  return streamError;
}

function isPendingInteractionEvent(eventName: string): boolean {
  return ['permission.', 'user_question.', 'approval.', 'question.'].some((prefix) =>
    eventName.startsWith(prefix),
  );
}

function isProcessEvent(eventName: string): boolean {
  return ['agent.task.', 'agent_task.', 'mcp.task.', 'mcp_task.', 'run.', 'subagent.'].some(
    (prefix) => eventName.startsWith(prefix),
  );
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
    eventName === 'message.upserted'
  );
}

function isQueuedMessageEvent(eventName: string): boolean {
  return eventName.startsWith('queued_message.');
}

function isResourceEvent(eventName: string): boolean {
  return eventName.startsWith('resource.');
}

interface QueryInvalidationEvent {
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
}: QueryInvalidationEvent): QueryKey[] {
  const keys: QueryKey[] = [];
  if (isPendingInteractionEvent(eventName)) {
    keys.push(
      queryKeys.pendingApprovals(endpoint, sessionId),
      queryKeys.pendingQuestions(endpoint, sessionId),
    );
  }
  if (isProcessEvent(eventName)) {
    keys.push(
      queryKeys.sessionObservabilityDetail(endpoint, sessionId, 'processes'),
      queryKeys.sessions(endpoint, 'all'),
    );
  }
  if (eventName === 'semantic.event') {
    keys.push(queryKeys.sessionObservabilityDetail(endpoint, sessionId, 'agent-iterations'));
  }
  if (isModelConfigurationEvent(eventName)) {
    keys.push(
      queryKeys.capabilities(endpoint),
      queryKeys.languageModelConfiguration(endpoint),
      queryKeys.providerModels(endpoint),
      queryKeys.providerCatalog(endpoint),
    );
  }
  if (isPendingSteerEvent(eventName)) {
    keys.push(queryKeys.pendingSteers(endpoint, sessionId));
  }
  if (isQueuedMessageEvent(eventName)) {
    keys.push(queryKeys.queuedMessages(endpoint, sessionId));
  }
  if (isResourceEvent(eventName)) {
    keys.push(queryKeys.workspaceResources(endpoint, workspaceId));
  }
  if (eventName === 'message.completed') {
    keys.push(
      queryKeys.sessions(endpoint, workspaceId),
      queryKeys.sessions(endpoint, 'all'),
      queryKeys.sessionObservability(endpoint, sessionId),
      queryKeys.sessionContext(endpoint, sessionId),
    );
  }
  if (eventName === 'session.status_changed' || eventName === 'session.upserted') {
    keys.push(queryKeys.sessions(endpoint, workspaceId), queryKeys.sessions(endpoint, 'all'));
  }
  return keys;
}

class QueryInvalidationBatcher {
  private readonly pending = new Map<string, QueryKey>();
  private scheduled = false;
  private stopped = false;

  constructor(private readonly queryClient: Pick<QueryClient, 'invalidateQueries'>) {}

  push(...keys: QueryKey[]): void {
    if (this.stopped) return;
    for (const key of keys) this.pending.set(JSON.stringify(key), key);
    if (this.scheduled || this.pending.size === 0) return;
    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }

  flush(): void {
    this.scheduled = false;
    const keys = [...this.pending.values()];
    this.pending.clear();
    if (keys.length === 0) return;
    void Promise.allSettled(
      keys.map((queryKey) => this.queryClient.invalidateQueries({ queryKey })),
    );
  }

  stop({ flush }: { flush: boolean }): void {
    if (flush) this.flush();
    this.stopped = true;
    this.pending.clear();
  }
}

function abortableDelay(controller: AbortController, milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    controller.signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

function latestCursor(
  current: string | undefined,
  snapshot: string | undefined,
): string | undefined {
  if (!current) return snapshot;
  if (!snapshot) return current;
  const currentNumber = Number(current);
  const snapshotNumber = Number(snapshot);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(snapshotNumber)) return current;
  return snapshotNumber > currentNumber ? snapshot : current;
}
