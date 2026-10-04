import type { AttentionAvailable } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { RadarIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AgentAnswerTextSelection, SelectionAction } from '@/lib/selection-actions';
import { useRepository } from './use-repository';
import { useSelectionAction } from './use-selection-action';

export type AttentionModeState =
  | { status: 'idle' }
  | { status: 'loading'; selection: AgentAnswerTextSelection }
  | { status: 'shown'; selection: AgentAnswerTextSelection; data: AttentionAvailable }
  | { status: 'unavailable'; selection: AgentAnswerTextSelection; message: string };

/**
 * "Understand attention": select a passage of an agent answer, and see which
 * earlier transcript text it drew on (clio-agent `POST
 * /v1/sessions/{sid}/messages/{mid}/attention`). Registers the selection
 * action and owns the one attention view open for this session — a fresh
 * selection replaces it, and switching sessions (or unmounting) clears it
 * without a stray request landing on the wrong session.
 *
 * The endpoint always answers 200; `available: false` is a normal result
 * (shown as the server's own `message`, verbatim), not an error. Only a
 * transport failure (the request never reached or returned from the server)
 * is reported as an error toast, same as `useMoreDetails`.
 */
export function useAttentionMode(
  sessionId: string,
  /** Changes when the transcript gains messages, so new answers are re-checked. */
  transcriptRevision: number,
): {
  state: AttentionModeState;
  dismiss: () => void;
} {
  const repository = useRepository();
  // Which answers can show attention. The action is offered only on those, so
  // a CLIO without attention capture, or an answer from another provider, never
  // shows it.
  const availability = useQuery({
    queryKey: ['attention-availability', sessionId, transcriptRevision],
    queryFn: ({ signal }) => repository.attentionAvailability(sessionId, signal),
    enabled: Boolean(sessionId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const availableAnswers = availability.data?.enabled ? availability.data.messages : undefined;
  const [held, setHeld] = useState<{ sessionId: string; state: AttentionModeState }>({
    sessionId,
    state: { status: 'idle' },
  });
  const current = held.sessionId === sessionId ? held.state : { status: 'idle' as const };
  const requestTokenRef = useRef(0);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const setState = useCallback(
    (state: AttentionModeState) => setHeld({ sessionId, state }),
    [sessionId],
  );

  const dismiss = useCallback(() => {
    abortRef.current?.abort();
    requestTokenRef.current += 1;
    setState({ status: 'idle' });
  }, [setState]);

  // Leaving the session (or the page) drops any in-flight request.
  useEffect(() => () => abortRef.current?.abort(), [sessionId]);

  const request = useCallback(
    async (target: AgentAnswerTextSelection) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      requestTokenRef.current += 1;
      const token = requestTokenRef.current;
      setState({ status: 'loading', selection: target });
      try {
        const result = await repository.getAttention(
          target.sessionId,
          target.messageId,
          { text: target.text },
          controller.signal,
        );
        if (requestTokenRef.current !== token) return; // superseded by a newer selection
        if (result.available) setState({ status: 'shown', selection: target, data: result });
        else setState({ status: 'unavailable', selection: target, message: result.message });
      } catch (error) {
        if (controller.signal.aborted || requestTokenRef.current !== token) return;
        setState({ status: 'idle' });
        toast.error('Attention view is unavailable', {
          description: error instanceof Error ? error.message : 'The service rejected it.',
        });
      }
    },
    [repository, setState],
  );

  const action = useMemo<SelectionAction>(
    () => ({
      id: 'understand-attention',
      label: 'Understand attention',
      icon: RadarIcon,
      order: 30,
      kinds: ['agent-answer-text'],
      // Only this session's answers that the service reports attention for.
      isAvailable: (target) =>
        target.kind === 'agent-answer-text' &&
        target.sessionId === sessionId && availableAnswers?.[target.messageId] === true,
      run: (target) => {
        if (target.kind === 'agent-answer-text') void request(target);
      },
    }),
    [availableAnswers, request, sessionId],
  );
  useSelectionAction(action);

  return { state: current, dismiss };
}
