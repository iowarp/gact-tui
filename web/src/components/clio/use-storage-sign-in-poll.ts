import type { ClioRepository } from '@clio/core/v3';
import { useEffect, useRef, useState } from 'react';

type Repository = Pick<ClioRepository, 'completeSourceSignIn'>;
type Flow = { flow_id: string; interval?: number };

/** Complete browser authorization through the initiating CLIO, without exposing tokens. */
export function useStorageSignInPoll({
  flow,
  repository,
  workspaceId,
  sourceId,
  onComplete,
  onSettled,
}: {
  flow?: Flow;
  repository: Repository;
  workspaceId: string;
  sourceId: string;
  onComplete: () => void;
  onSettled: () => void;
}) {
  const [error, setError] = useState<string>();
  const callbacks = useRef({ repository, onComplete, onSettled });
  useEffect(() => {
    callbacks.current = { repository, onComplete, onSettled };
  }, [repository, onComplete, onSettled]);
  useEffect(() => {
    if (!flow) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await callbacks.current.repository.completeSourceSignIn(
          workspaceId,
          sourceId,
          flow.flow_id,
          '',
        );
        if (cancelled) return;
        if (result.authenticated) {
          callbacks.current.onSettled();
          callbacks.current.onComplete();
        } else timer = setTimeout(() => void poll(), (flow.interval ?? 1) * 1000);
      } catch (cause) {
        if (!cancelled) {
          callbacks.current.onSettled();
          setError(cause instanceof Error ? cause.message : 'Sign-in could not finish. Try again.');
        }
      }
    };
    timer = setTimeout(() => void poll(), (flow.interval ?? 1) * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [flow, workspaceId, sourceId]);
  return { error, clearError: () => setError(undefined) };
}
