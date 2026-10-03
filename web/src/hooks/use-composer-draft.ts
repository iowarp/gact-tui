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
  scope: string;
  value: string;
}

type DraftPersistence = { persist: true; endpoint: string } | { persist: false };

function emptyDraft(scope: string, storageKey: string | null): HeldDraft {
  let value = '';
  if (storageKey && typeof window !== 'undefined') {
    try {
      value = window.sessionStorage.getItem(storageKey) ?? '';
    } catch {
      // Private browsing can deny storage; the in-memory draft still works.
    }
  }
  return { annotations: EMPTY_ANNOTATIONS, references: EMPTY_REFERENCES, scope, value };
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
 * Temporary entry composers never persist. Real sessions may opt into restoring
 * unsent text within the tab, scoped to both the agent endpoint and session ID.
 */
export function useComposerDraft(
  sessionId: string,
  persistence: DraftPersistence = { persist: false },
): ComposerDraft {
  const scope = JSON.stringify([persistence.persist ? persistence.endpoint : null, sessionId]);
  const storageKey = persistence.persist ? `clio:composer-draft:${scope}` : null;
  const [draft, setDraft] = useState<HeldDraft>(() => emptyDraft(scope, storageKey));
  const current = draft.scope === scope ? draft : emptyDraft(scope, storageKey);

  const patch = useCallback(
    (change: Partial<Omit<HeldDraft, 'scope'>>) =>
      setDraft((held) => ({
        ...(held.scope === scope ? held : emptyDraft(scope, storageKey)),
        ...change,
      })),
    [scope, storageKey],
  );
  const onValueChange = useCallback(
    (value: string) => {
      patch({ value });
      if (!storageKey) return;
      try {
        if (value) window.sessionStorage.setItem(storageKey, value);
        else window.sessionStorage.removeItem(storageKey);
      } catch {
        // The current tab retains the draft even if browser storage is unavailable.
      }
    },
    [patch, storageKey],
  );
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
