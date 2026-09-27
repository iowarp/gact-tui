import { useCallback, useState } from 'react';
import type { ComposerAnnotation } from '@/lib/composer-annotations';
import type { InlineReferenceSelection } from '@/lib/composer-reference-domain';

/** One session's unsent composer draft, held outside the composer. */
export interface ComposerDraft {
  annotations: readonly ComposerAnnotation[];
  onAnnotationsChange: (annotations: readonly ComposerAnnotation[]) => void;
  onReferencesChange: (references: readonly InlineReferenceSelection[]) => void;
  onValueChange: (value: string) => void;
  references: readonly InlineReferenceSelection[];
  value: string;
}

const EMPTY_REFERENCES: readonly InlineReferenceSelection[] = [];
const EMPTY_ANNOTATIONS: readonly ComposerAnnotation[] = [];

interface HeldDraft {
  annotations: readonly ComposerAnnotation[];
  references: readonly InlineReferenceSelection[];
  sessionId: string;
  value: string;
}

function emptyDraft(sessionId: string): HeldDraft {
  return { annotations: EMPTY_ANNOTATIONS, references: EMPTY_REFERENCES, sessionId, value: '' };
}

/**
 * Owns the draft for one session — its text, the references it carries, and
 * the annotations (quoted selections) attached to it.
 *
 * All of it has to live here rather than inside the composer. The composer is
 * remounted whenever the session, the chosen model, the reasoning effort or the
 * welcome/docked layout branch changes, and a remount destroys component state:
 * a draft whose references lived inside the composer lost its chips while the
 * prose around them survived. Annotations are added from outside the composer
 * (a selection in the transcript), so they must live here too.
 *
 * The draft is keyed by session rather than cleared on navigation, so switching
 * away from a session and back reads as empty without a separate reset.
 */
export function useComposerDraft(sessionId: string): ComposerDraft {
  const [draft, setDraft] = useState<HeldDraft>(() => emptyDraft(sessionId));
  const current = draft.sessionId === sessionId ? draft : emptyDraft(sessionId);

  const patch = useCallback(
    (change: Partial<Omit<HeldDraft, 'sessionId'>>) =>
      setDraft((held) => ({
        ...(held.sessionId === sessionId ? held : emptyDraft(sessionId)),
        ...change,
      })),
    [sessionId],
  );
  const onValueChange = useCallback((value: string) => patch({ value }), [patch]);
  const onReferencesChange = useCallback(
    (references: readonly InlineReferenceSelection[]) => patch({ references }),
    [patch],
  );
  const onAnnotationsChange = useCallback(
    (annotations: readonly ComposerAnnotation[]) => patch({ annotations }),
    [patch],
  );

  return {
    annotations: current.annotations,
    onAnnotationsChange,
    onReferencesChange,
    onValueChange,
    references: current.references,
    value: current.value,
  };
}
