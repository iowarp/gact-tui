import type { InfrastructureOperation } from '@clio/core/v3';
import { useEffect, useReducer, useRef } from 'react';
import { abortableDelay } from '@/components/clio/managed-service-target-utils';
import {
  initialOperationStream,
  operationStreamReducer,
  type OperationStreamState,
} from '@/components/clio/operation-progress-model';
import { useRepository } from './use-repository';

/** Reconnect backoff after a dropped stream: 1 s doubling to 15 s. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15_000;
/** Consecutive failed connections (no event received) before giving up. */
const MAX_RECONNECTS = 40;

type Action =
  | { type: 'reset'; operation?: InfrastructureOperation }
  | { type: 'event'; event: Parameters<typeof operationStreamReducer>[1] }
  | { type: 'connection'; connected: boolean };

interface StreamState extends OperationStreamState {
  connected: boolean;
}

function reducer(state: StreamState, action: Action): StreamState {
  if (action.type === 'reset') {
    return { ...initialOperationStream(action.operation), connected: false };
  }
  if (action.type === 'connection') return { ...state, connected: action.connected };
  return { ...state, ...operationStreamReducer(state, action.event) };
}

/**
 * Follow one infrastructure operation's live stream (progress, log, reuse)
 * until it completes. A dropped connection reconnects with the highest event
 * id held as Last-Event-ID, so nothing is shown twice or lost (a `gap` says
 * when the service no longer retains older lines).
 */
export function useOperationStream(
  operationId: string | undefined,
  initial?: InfrastructureOperation,
): StreamState {
  const repository = useRepository();
  const [state, dispatch] = useReducer(reducer, initial, (operation) => ({
    ...initialOperationStream(operation),
    connected: false,
  }));
  // Owned by the follow loop below (the reducer's copies lag a render behind).
  const cursor = useRef(0);
  const completed = useRef(false);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    if (!operationId) return;
    dispatch({ type: 'reset', operation: initialRef.current });
    cursor.current = 0;
    completed.current = false;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      let delay = RECONNECT_BASE_MS;
      let failures = 0;
      while (!signal.aborted && !completed.current && failures < MAX_RECONNECTS) {
        try {
          const events = repository.infrastructureOperationEvents(
            operationId,
            cursor.current || undefined,
            signal,
          );
          dispatch({ type: 'connection', connected: true });
          for await (const event of events) {
            delay = RECONNECT_BASE_MS;
            failures = 0;
            if (event.id > cursor.current) cursor.current = event.id;
            if (
              event.type === 'operation.completed' ||
              (event.type === 'operation.snapshot' &&
                !['queued', 'running'].includes(event.operation.state))
            ) {
              completed.current = true;
            }
            dispatch({ type: 'event', event });
          }
        } catch (error) {
          if (signal.aborted) return;
          // A deleted or unknown operation will not come back.
          if ((error as { status?: number } | undefined)?.status === 404) return;
          failures += 1;
        } finally {
          dispatch({ type: 'connection', connected: false });
        }
        if (completed.current) return;
        // The stream dropped mid-operation: resume after the last event held.
        try {
          await abortableDelay(delay, signal);
        } catch {
          return;
        }
        delay = Math.min(delay * 2, RECONNECT_MAX_MS);
      }
    })();
    return () => controller.abort();
  }, [operationId, repository]);

  return state;
}
