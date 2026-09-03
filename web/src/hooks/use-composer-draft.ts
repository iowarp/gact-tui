import { useCallback, useState } from 'react';
import type { InlineReferenceSelection } from '@/lib/composer-reference-domain';

/** One session's unsent composer draft, held outside the composer. */
export interface ComposerDraft {
  onReferencesChange: (references: readonly InlineReferenceSelection[]) => void;
  onValueChange: (value: string) => void;
  references: readonly InlineReferenceSelection[];
  value: string;
}

const EMPTY_REFERENCES: readonly InlineReferenceSelection[] = [];

/**
 * Owns the draft for one session — its text and the references it carries.
 *
 * Both halves have to live here rather than inside the composer. The composer
 * is remounted whenever the session, the chosen model, the reasoning effort or
 * the welcome/docked layout branch changes, and a remount destroys component
 * state: a draft whose references lived inside the composer lost its chips
 * while the prose around them survived.
 *
 * The draft is keyed by session rather than cleared on navigation, so switching
 * away from a session and back reads as empty without a separate reset.
 */
export function useComposerDraft(sessionId: string): ComposerDraft {
  const [draft, setDraft] = useState<{
    references: readonly InlineReferenceSelection[];
    sessionId: string;
    value: string;
  }>({ references: EMPTY_REFERENCES, sessionId, value: '' });
  const current =
    draft.sessionId === sessionId ? draft : { references: EMPTY_REFERENCES, sessionId, value: '' };

  const onValueChange = useCallback(
    (value: string) =>
      setDraft((held) => ({
        references: held.sessionId === sessionId ? held.references : EMPTY_REFERENCES,
        sessionId,
        value,
      })),
    [sessionId],
  );

  const onReferencesChange = useCallback(
    (references: readonly InlineReferenceSelection[]) =>
      setDraft((held) => ({
        references,
        sessionId,
        value: held.sessionId === sessionId ? held.value : '',
      })),
    [sessionId],
  );

  return {
    onReferencesChange,
    onValueChange,
    references: current.references,
    value: current.value,
  };
}
