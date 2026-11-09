import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { CommentAttachment } from '@clio/core/v3';
import type { InlineReferenceSelection } from '@/lib/composer-reference-domain';

/**
 * One session's unsent composer draft, held outside the composer.
 *
 * The text changes on every keystroke, so it is not part of the owner's render
 * state: read it with `readValue()` inside handlers, and render it with
 * `useComposerDraftValue(draft)` in the component that shows it.
 */
export interface ComposerDraft {
  annotations: readonly CommentAttachment[];
  onAnnotationsChange: (annotations: readonly CommentAttachment[]) => void;
  onReferencesChange: (references: readonly InlineReferenceSelection[]) => void;
  onValueChange: (value: string) => void;
  readValue: () => string;
  references: readonly InlineReferenceSelection[];
  subscribeValue: (listener: () => void) => () => void;
}

const EMPTY_REFERENCES: readonly InlineReferenceSelection[] = [];
const EMPTY_ANNOTATIONS: readonly CommentAttachment[] = [];

interface HeldDraft {
  annotations: readonly CommentAttachment[];
  references: readonly InlineReferenceSelection[];
  scope: string;
}

type DraftPersistence = { persist: true; endpoint: string } | { persist: false };

function emptyDraft(scope: string): HeldDraft {
  return { annotations: EMPTY_ANNOTATIONS, references: EMPTY_REFERENCES, scope };
}

function storedText(storageKey: string | null): string {
  if (!storageKey || typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(storageKey) ?? '';
  } catch {
    // Private browsing can deny storage; the in-memory draft still works.
    return '';
  }
}

/** The draft text for one scope at a time, with change listeners. */
function createTextStore() {
  const listeners = new Set<() => void>();
  let held: { scope: string; value: string } | null = null;
  const read = (scope: string, storageKey: string | null) => {
    if (held?.scope !== scope) held = { scope, value: storedText(storageKey) };
    return held.value;
  };
  return {
    read,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    write(scope: string, storageKey: string | null, value: string) {
      if (read(scope, storageKey) === value) return;
      held = { scope, value };
      for (const listener of listeners) listener();
    },
  };
}

/** Render the draft text; only the calling component re-renders as it changes. */
export function useComposerDraftValue(
  draft: Pick<ComposerDraft, 'readValue' | 'subscribeValue'>,
): string {
  return useSyncExternalStore(draft.subscribeValue, draft.readValue, draft.readValue);
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
  const [draft, setDraft] = useState<HeldDraft>(() => emptyDraft(scope));
  const [text] = useState(createTextStore);
  const current = draft.scope === scope ? draft : emptyDraft(scope);

  const patch = useCallback(
    (change: Partial<Omit<HeldDraft, 'scope'>>) =>
      setDraft((held) => ({
        ...(held.scope === scope ? held : emptyDraft(scope)),
        ...change,
      })),
    [scope],
  );
  const onValueChange = useCallback(
    (value: string) => {
      text.write(scope, storageKey, value);
      if (!storageKey) return;
      try {
        if (value) window.sessionStorage.setItem(storageKey, value);
        else window.sessionStorage.removeItem(storageKey);
      } catch {
        // The current tab retains the draft even if browser storage is unavailable.
      }
    },
    [scope, storageKey, text],
  );
  const readValue = useCallback(() => text.read(scope, storageKey), [scope, storageKey, text]);
  const onReferencesChange = useCallback(
    (references: readonly InlineReferenceSelection[]) => patch({ references }),
    [patch],
  );
  const onAnnotationsChange = useCallback(
    (annotations: readonly CommentAttachment[]) => patch({ annotations }),
    [patch],
  );

  return useMemo(
    () => ({
      annotations: current.annotations,
      onAnnotationsChange,
      onReferencesChange,
      onValueChange,
      readValue,
      references: current.references,
      subscribeValue: text.subscribe,
    }),
    [
      current.annotations,
      current.references,
      onAnnotationsChange,
      onReferencesChange,
      onValueChange,
      readValue,
      text,
    ],
  );
}
