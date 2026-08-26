import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { recordById } from '@/lib/entities';
import { FrameBatcher } from '@/lib/streaming/frame-batcher';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { listenForDesktopResume } from '@/tauri/desktop-lifecycle';
import { useRepository } from './use-repository';
import { sessionContextQueryKey } from './use-session-context';
import { sessionObservabilityQueryKey } from './use-session-observability';

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
    let reconnectDelay = 250;
    const consume = async () => {
      setStreamState('connecting');
      while (!controller.signal.aborted) {
        try {
          const cursor = latestCursor(useLiveStore.getState().entities.cursor, initialCursor);
          for await (const frame of repository.stream(
            { connection_id: 'active', workspace_id: workspaceId, session_id: sessionId },
            cursor,
            controller.signal,
          )) {
            reconnectDelay = 250;
            setStreamState('live');
            batcher.push(frame);
            if (isPendingInteractionEvent(frame.eventName)) {
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: ['pending-approvals', settings.endpoint, sessionId],
                }),
                queryClient.invalidateQueries({
                  queryKey: ['pending-questions', settings.endpoint, sessionId],
                }),
              ]);
            }
            if (isProcessEvent(frame.eventName)) {
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: [
                    ...sessionObservabilityQueryKey(settings.endpoint, sessionId),
                    'processes',
                  ],
                }),
                queryClient.invalidateQueries({
                  queryKey: ['sessions', settings.endpoint, 'all'],
                }),
              ]);
            }
            if (frame.eventName === 'semantic.event') {
              await queryClient.invalidateQueries({
                queryKey: [
                  ...sessionObservabilityQueryKey(settings.endpoint, sessionId),
                  'agent-iterations',
                ],
              });
            }
            if (isModelConfigurationEvent(frame.eventName)) {
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: ['capabilities', settings.endpoint],
                }),
                queryClient.invalidateQueries({
                  queryKey: ['language-model-configuration', settings.endpoint],
                }),
                queryClient.invalidateQueries({
                  queryKey: ['provider-models', settings.endpoint],
                }),
              ]);
            }
            if (frame.eventName === 'message.completed') {
              batcher.flush();
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: ['transcript', settings.endpoint, sessionId],
                }),
                queryClient.invalidateQueries({
                  queryKey: ['sessions', settings.endpoint, workspaceId],
                }),
                queryClient.invalidateQueries({
                  queryKey: ['sessions', settings.endpoint, 'all'],
                }),
                queryClient.invalidateQueries({
                  queryKey: sessionObservabilityQueryKey(settings.endpoint, sessionId),
                }),
                queryClient.invalidateQueries({
                  queryKey: sessionContextQueryKey(settings.endpoint, sessionId),
                }),
              ]);
            }
            if (frame.eventName === 'session.status_changed') {
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: ['sessions', settings.endpoint, workspaceId],
                }),
                queryClient.invalidateQueries({
                  queryKey: ['sessions', settings.endpoint, 'all'],
                }),
              ]);
            }
          }
          if (!controller.signal.aborted) setStreamState('reconnecting');
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
        queryClient.setQueryData(['workspaces', settings.endpoint], workspaces);
        queryClient.setQueryData(['sessions', settings.endpoint, workspaceId], sessions);
        queryClient.setQueryData(['transcript', settings.endpoint, sessionId], transcript);
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
  return eventName === 'lm.provider.changed' || eventName === 'lm.provider.failed';
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
