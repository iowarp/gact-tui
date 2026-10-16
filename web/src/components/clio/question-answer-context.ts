import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/** Unsubmitted form values; accepted answers remain owned by the service. */
export interface QuestionResponseDraft {
  answer: string;
  selection: string;
  multiSelection: string[];
  optionComments: Record<string, string>;
  fields: Record<string, unknown>;
}

type Draft = Partial<QuestionResponseDraft>;

interface QuestionDraftState {
  values: Readonly<Record<string, Draft>>;
  update: (id: string, change: (draft: Draft) => Draft) => void;
}

/**
 * "This question is being answered in the main composer": the inline question
 * card's "Other answer" starts it, the notice over the composer shows it, and
 * the composer's submit routes the next message to that question.
 */
export interface QuestionAnswerState {
  /** Shared unsent values survive response-card and layout remounts. */
  responseDrafts?: QuestionDraftState;
  /** The workspace's live interaction inventory, shared by transcript and Work. */
  interactions?: readonly PendingInteraction[];
  /** The interaction id of the question the composer's next message answers. */
  answeringId?: string;
  openQuestion?: (interaction: PendingInteraction) => void;
  /** The loaded transcript location of a question, when its source is available. */
  questionLink?: (interaction: PendingInteraction) => string | undefined;
  surfaces?: Readonly<Record<string, A2UISurface>>;
  refetchSurfaces?: () => void;
  startAnswer: (interactionId: string) => void;
  stopAnswer: () => void;
}

export const QuestionAnswerContext = createContext<QuestionAnswerState | undefined>(undefined);

/** The composer-answer state, or `undefined` outside a workspace conversation. */
export function useQuestionAnswer(): QuestionAnswerState | undefined {
  return useContext(QuestionAnswerContext);
}

/** Hold form drafts in the existing session owner, pruning confirmed resolutions only. */
export function useQuestionDrafts(
  endpoint: string,
  sessionId: string,
  interactions: readonly PendingInteraction[],
): QuestionDraftState {
  const scope = JSON.stringify([endpoint, sessionId]);
  const [held, setHeld] = useState<{ scope: string; values: Record<string, Draft> }>(() => ({
    scope,
    values: {},
  }));
  const resolved = useMemo(
    () => new Set(interactions.filter((row) => row.status !== 'pending').map((row) => row.id)),
    [interactions],
  );
  if (held.scope !== scope || Object.keys(held.values).some((id) => resolved.has(id))) {
    const values = held.scope === scope ? { ...held.values } : {};
    for (const id of resolved) delete values[id];
    setHeld({ scope, values });
  }
  const update = useCallback<QuestionDraftState['update']>(
    (id, change) => {
      if (resolved.has(id)) return;
      setHeld((previous) => {
        const values = previous.scope === scope ? previous.values : {};
        return { scope, values: { ...values, [id]: change(values[id] ?? {}) } };
      });
    },
    [resolved, scope],
  );
  return useMemo(
    () => ({ values: held.scope === scope ? held.values : {}, update }),
    [held, scope, update],
  );
}

/** Bind an input to its Question rather than the particular mounted response surface. */
export function useQuestionDraftValue<Key extends keyof QuestionResponseDraft>(
  id: string,
  key: Key,
  initial: QuestionResponseDraft[Key] | (() => QuestionResponseDraft[Key]),
): [QuestionResponseDraft[Key], Dispatch<SetStateAction<QuestionResponseDraft[Key]>>] {
  const readInitial = () => (typeof initial === 'function' ? initial() : initial);
  const [local, setLocal] = useState(() => ({ id, value: readInitial() }));
  const fallback = local.id === id ? local.value : readInitial();
  const owner = useQuestionAnswer()?.responseDrafts;
  const value = owner?.values[id]?.[key] ?? fallback;
  const setValue = useCallback<Dispatch<SetStateAction<QuestionResponseDraft[Key]>>>(
    (action) => {
      const apply = (current: QuestionResponseDraft[Key]) =>
        typeof action === 'function' ? action(current) : action;
      if (owner) owner.update(id, (draft) => ({ ...draft, [key]: apply(draft[key] ?? fallback) }));
      else
        setLocal((previous) => ({
          id,
          value: apply(previous.id === id ? previous.value : fallback),
        }));
    },
    [fallback, id, key, owner],
  );
  return [value, setValue];
}
