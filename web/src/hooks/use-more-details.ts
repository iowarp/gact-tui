import type { Session } from '@clio/core/v3';
import { SearchIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AgentAnswerTextSelection, SelectionAction } from '@/lib/selection-actions';
import { useRepository } from './use-repository';
import { useSelectionAction } from './use-selection-action';

/** The model route an aside question runs on: the parent session's own. */
export interface AsideModelRoute {
  provider_id: string;
  model_id: string;
}

/** The first question an aside asks about the passage it was opened on. */
export function firstAsideQuestion(text: string): string {
  const quoted = text
    .split(/\r?\n/u)
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');
  return `${quoted}\n\nExplain this part of your answer in more detail.`;
}

function newIdentity(): { client_message_id: string; idempotency_key: string } {
  const id = crypto.randomUUID();
  return { client_message_id: `aside-${id}`, idempotency_key: `aside-${id}` };
}

export interface MoreDetailsState {
  /** The open aside, once the service has created it. */
  side?: Session;
  /** The passage it was opened on. */
  selection?: AgentAnswerTextSelection;
  opening: boolean;
  /** Ask the aside a follow-up question. */
  ask: (text: string) => Promise<void>;
  close: () => void;
}

/**
 * Owns the "More details" aside for one session and registers its selection
 * action.
 *
 * Selecting text in an answer and choosing More details opens a read-only side
 * conversation on the service (it carries this session's context, may only run
 * tools that declare no side effects, and never writes here) and asks it about
 * the passage. Its answers stay in the aside; the only way into this session's
 * transcript is the person adding one to the chat. Closing the panel, opening a
 * new aside, or leaving the session deletes the aside.
 */
export function useMoreDetails(
  sessionId: string,
  route: AsideModelRoute | undefined,
): MoreDetailsState {
  const repository = useRepository();
  // Keyed by session: switching sessions reads as "no aside" without an effect.
  const [held, setHeld] = useState<{
    sessionId: string;
    side?: Session;
    selection?: AgentAnswerTextSelection;
  }>({ sessionId });
  const current = held.sessionId === sessionId ? held : { sessionId };
  const [opening, setOpening] = useState(false);
  const sideRef = useRef<Session | undefined>(undefined);
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  });

  const discard = useCallback(
    (session: Session | undefined) => {
      if (!session) return;
      void repository.deleteSession(session.id).catch((error: unknown) => {
        toast.error('The side conversation was not closed', {
          description: error instanceof Error ? error.message : 'The service rejected it.',
        });
      });
    },
    [repository],
  );

  const submit = useCallback(
    async (session: Session, text: string) => {
      const model = routeRef.current;
      if (!model) throw new Error('Choose an available provider and model.');
      await repository.submitMessage(session.id, {
        ...newIdentity(),
        behavior: { execution_mode: 'execute', confirmation_policy: 'ask' },
        delivery: 'start',
        model,
        parts: [{ type: 'text', text }],
      });
    },
    [repository],
  );

  const open = useCallback(
    async (target: AgentAnswerTextSelection) => {
      setHeld({ sessionId, selection: target });
      setOpening(true);
      try {
        const created = await repository.openSideSession(sessionId, {
          text: target.text,
          message_id: target.messageId,
        });
        // The service retired the previous aside of this session when it
        // opened this one; only the local handle changes here.
        sideRef.current = created;
        setHeld({ sessionId, side: created, selection: target });
        await submit(created, firstAsideQuestion(target.text));
      } catch (error) {
        toast.error('More details is unavailable', {
          description: error instanceof Error ? error.message : 'The service rejected it.',
        });
      } finally {
        setOpening(false);
      }
    },
    [repository, sessionId, submit],
  );

  const close = useCallback(() => {
    discard(sideRef.current);
    sideRef.current = undefined;
    setHeld({ sessionId });
  }, [discard, sessionId]);

  // Leaving the session (or the page) closes its aside.
  useEffect(
    () => () => {
      discard(sideRef.current);
      sideRef.current = undefined;
    },
    [discard, sessionId],
  );

  const ask = useCallback(
    async (text: string) => {
      const current = sideRef.current;
      if (!current || !text.trim()) return;
      await submit(current, text.trim());
    },
    [submit],
  );

  const action = useMemo<SelectionAction>(
    () => ({
      id: 'more-details',
      label: 'More details',
      icon: SearchIcon,
      order: 20,
      kinds: ['agent-answer-text'],
      // An aside answers about this session; it cannot open another aside.
      isAvailable: (target) => target.sessionId === sessionId,
      run: (target) => void open(target),
    }),
    [open, sessionId],
  );
  useSelectionAction(action);

  return { side: current.side, selection: current.selection, opening, ask, close };
}
