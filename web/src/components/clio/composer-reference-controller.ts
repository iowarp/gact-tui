import type { WorkspaceReference } from '@clio/core/v3';
import { useCallback, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import {
  workspaceReferenceIdentity,
  type InlineReferenceSelection,
} from '@/lib/composer-reference-domain';
import { editorCaretOffset } from './composer-editor-model';

/**
 * The `@` mention the person is in the middle of typing: the last run of
 * non-space characters after an `@` at the end of the draft.
 */
const REFERENCE_TOKEN = /(?:^|\s)@([^\s]*)$/u;

interface ComposerReferenceControllerInput {
  contextReferences: boolean;
  editorRef: RefObject<HTMLDivElement | null>;
  focusEditor: () => void;
  input: string;
  selectedReferences: readonly InlineReferenceSelection[];
  setInput: (value: string) => void;
  setSelectedReferences: (references: readonly InlineReferenceSelection[]) => void;
  workspaceId: string;
}

export interface ComposerReferenceController {
  activeOptionId?: string;
  activeReferenceId?: string;
  dismiss: () => void;
  /** Consumes a key the popover owns; false leaves it to the composer. */
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => boolean;
  onActiveOptionChange: (optionId: string | undefined) => void;
  onActiveReferenceChange: (identity: string) => void;
  onOptionsChange: (references: readonly WorkspaceReference[]) => void;
  onCaretChange: (offset: number | undefined) => void;
  onQueryChange: (query: string) => void;
  open: boolean;
  openPicker: () => void;
  pickerOpen: boolean;
  popoverId: string;
  query: string;
  select: (reference: WorkspaceReference) => void;
}

/** Where a reference lands, and what the draft text around it becomes. */
export function insertReferenceAt(
  input: string,
  at: number,
): { nextInput: string; offset: number } {
  const insertAt = Math.max(0, Math.min(at, input.length));
  const head = input.slice(0, insertAt);
  const tail = input.slice(insertAt);
  const prefix = head && !/\s$/u.test(head) ? `${head} ` : head;
  const suffix = tail ? (/^\s/u.test(tail) ? tail : ` ${tail}`) : ' ';
  return { nextInput: `${prefix}${suffix}`, offset: prefix.length };
}

/** The character index of the `@` that opened the token, if the draft has one. */
export function referenceTokenStart(token: RegExpMatchArray): number {
  // The match may begin at the whitespace before the `@`, and the query itself
  // can contain further `@`s — so the index comes from the match, never from
  // searching the draft for the last `@`.
  return (token.index ?? 0) + (token[0]?.startsWith('@') ? 0 : 1);
}

/**
 * Owns the composer's reference popover: which surface opened it, what it is
 * searching for, which option is highlighted, and where a chosen reference
 * lands in the draft.
 */
export function useComposerReferenceController({
  contextReferences,
  editorRef,
  focusEditor,
  input,
  selectedReferences,
  setInput,
  setSelectedReferences,
  workspaceId,
}: ComposerReferenceControllerInput): ComposerReferenceController {
  const popoverId = `${useId()}-composer-references`;
  const [options, setOptions] = useState<readonly WorkspaceReference[]>([]);
  const [activeReferenceId, setActiveReferenceId] = useState<string>();
  const [activeOptionId, setActiveOptionId] = useState<string>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // The draft as it read when the person dismissed the popover. Escape closes
  // the popover without touching the text, so without this the very next render
  // would reopen it on the same token and `ping @alice` could never be sent.
  const [dismissedDraft, setDismissedDraft] = useState<string>();
  // The last caret the editor reported. Opening the picker moves focus into its
  // own search box, which ends the editor's selection, so the insertion point
  // has to be remembered rather than read back at selection time.
  const caretRef = useRef<number>(undefined);

  const token = input.match(REFERENCE_TOKEN);
  const open =
    contextReferences &&
    Boolean(workspaceId) &&
    (pickerOpen || (Boolean(token) && dismissedDraft !== input));
  const query = pickerOpen ? searchQuery : (token?.[1] ?? '');
  const effectiveActiveReferenceId =
    activeReferenceId &&
    options.some((reference) => workspaceReferenceIdentity(reference) === activeReferenceId)
      ? activeReferenceId
      : options[0]
        ? workspaceReferenceIdentity(options[0])
        : undefined;

  const dismiss = useCallback(() => {
    setPickerOpen(false);
    setSearchQuery('');
    setDismissedDraft(input);
    focusEditor();
  }, [focusEditor, input]);

  const openPicker = useCallback(() => {
    setSearchQuery('');
    setDismissedDraft(undefined);
    setPickerOpen(true);
  }, []);

  const select = useCallback(
    (reference: WorkspaceReference) => {
      const identity = workspaceReferenceIdentity(reference);
      const alreadySelected = selectedReferences.some(
        (candidate) => workspaceReferenceIdentity(candidate.reference) === identity,
      );
      if (alreadySelected) {
        // Nothing to add. Consuming the typed query here would delete text the
        // person still has to see to understand why nothing happened.
        dismiss();
        return;
      }

      const caret = editorCaretOffset(editorRef.current) ?? caretRef.current;
      const at = token ? referenceTokenStart(token) : Math.min(caret ?? input.length, input.length);
      const withoutToken = token
        ? input.slice(0, at) + input.slice((token.index ?? 0) + token[0].length)
        : input;
      const { nextInput, offset } = insertReferenceAt(withoutToken, at);
      const shift = nextInput.length - withoutToken.length;

      setSelectedReferences([
        ...selectedReferences.map((selection) =>
          selection.offset >= at ? { ...selection, offset: selection.offset + shift } : selection,
        ),
        { offset, reference },
      ]);
      setInput(nextInput);
      setPickerOpen(false);
      setSearchQuery('');
      setDismissedDraft(undefined);
      setOptions([]);
      setActiveReferenceId(undefined);
      setActiveOptionId(undefined);
      focusEditor();
    },
    [
      dismiss,
      editorRef,
      focusEditor,
      input,
      selectedReferences,
      setInput,
      setSelectedReferences,
      token,
    ],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): boolean => {
      if (!open) return false;
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
        return true;
      }
      if (options.length === 0) return false;
      const activeIndex = options.findIndex(
        (reference) => workspaceReferenceIdentity(reference) === effectiveActiveReferenceId,
      );
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (Math.max(activeIndex, 0) + direction + options.length) % options.length;
        setActiveReferenceId(workspaceReferenceIdentity(options[nextIndex]!));
        return true;
      }
      if (
        (event.key === 'Enter' || event.key === 'Tab') &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        select(options[Math.max(activeIndex, 0)]!);
        return true;
      }
      return false;
    },
    [dismiss, effectiveActiveReferenceId, open, options, select],
  );

  return {
    activeOptionId: open ? activeOptionId : undefined,
    activeReferenceId: effectiveActiveReferenceId,
    dismiss,
    handleKeyDown,
    onActiveOptionChange: setActiveOptionId,
    onActiveReferenceChange: setActiveReferenceId,
    onCaretChange: (offset: number | undefined) => {
      caretRef.current = offset;
    },
    onOptionsChange: setOptions,
    onQueryChange: setSearchQuery,
    open,
    openPicker,
    pickerOpen,
    popoverId,
    query,
    select,
  };
}
