import type { RefObject } from 'react';
import { useShortcut } from '@/lib/shortcuts/hooks';
import type { InlineReferenceSelection } from '@/lib/composer-reference-domain';
import { saveDraft, takeSavedDraft, useSavedDrafts } from '@/lib/composer-saved-drafts';

/** The drafts put aside for this conversation (or new one), and their shortcuts. */
export function useComposerSavedDrafts({
  sessionId,
  workspaceId,
  input,
  latestInputRef,
  setInput,
  selectedReferences,
  setSelectedReferences,
  focusEditorSoon,
  disabled,
  rootRef,
  inputRef,
}: {
  sessionId?: string;
  workspaceId: string;
  input: string;
  latestInputRef: RefObject<string>;
  setInput: (value: string) => void;
  selectedReferences: readonly InlineReferenceSelection[];
  setSelectedReferences: (references: readonly InlineReferenceSelection[]) => void;
  focusEditorSoon: () => void;
  disabled?: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLDivElement | null>;
}) {
  const savedDraftKey = sessionId ?? `new:${workspaceId}`;
  const savedDrafts = useSavedDrafts(savedDraftKey);
  const draftEmpty = !input.trim() && selectedReferences.length === 0;
  const putDraftAside = () => {
    const saved = saveDraft(savedDraftKey, {
      text: latestInputRef.current,
      references: selectedReferences,
    });
    if (!saved) return;
    setInput('');
    setSelectedReferences([]);
  };
  const restoreSavedDraft = (id?: string) => {
    const draft = takeSavedDraft(savedDraftKey, id);
    if (!draft) return;
    saveDraft(savedDraftKey, { text: latestInputRef.current, references: selectedReferences });
    setInput(draft.text);
    setSelectedReferences(draft.references);
    focusEditorSoon();
  };
  useShortcut('save-draft', putDraftAside, {
    enabled: !disabled,
    region: rootRef,
    allowInTextField: true,
  });
  useShortcut('restore-draft', () => restoreSavedDraft(), {
    enabled: !disabled && draftEmpty && savedDrafts.length > 0,
    region: inputRef,
    allowInTextField: true,
  });
  return { savedDraftKey, savedDrafts, draftEmpty, restoreSavedDraft };
}
