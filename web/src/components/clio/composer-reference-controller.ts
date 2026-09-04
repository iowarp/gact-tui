import type { WorkspaceReference } from '@clio/core/v3';
import { useCallback, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import {
  workspaceReferenceIdentity,
  type InlineReferenceSelection,
} from '@/lib/composer-reference-domain';
import { editorCaretOffset } from './composer-editor-model';

/**
 * The `@` mention the person is in the middle of typing. It is applied only to
 * the text before the caret, so the same expression works in the middle of a
 * longer draft rather than treating the draft's final word as authoritative.
 */
const REFERENCE_TOKEN = /(?:^|\s)@([^\s]*)$/u;

interface ComposerReferenceControllerInput {
  contextReferences: boolean;
  editorRef: RefObject<HTMLDivElement | null>;
  focusEditor: (offset?: number) => void;
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
  restoreEditorFocus: () => void;
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

export interface ReferenceMention {
  /** First character after the mention's `@`, up to the caret. */
  query: string;
  /** Inclusive index of the mention's `@`. */
  start: number;
  /** Exclusive index of the entire non-space mention, including text after the caret. */
  end: number;
}

/** The mention that contains the caret, rather than merely the last `@` in the draft. */
export function referenceMentionAt(
  input: string,
  caret: number | undefined,
): ReferenceMention | undefined {
  if (caret === undefined || caret < 0 || caret > input.length) return undefined;
  const beforeCaret = input.slice(0, caret);
  const token = beforeCaret.match(REFERENCE_TOKEN);
  if (!token) return undefined;
  const start = (token.index ?? 0) + (token[0]?.startsWith('@') ? 0 : 1);
  let end = caret;
  while (end < input.length && !/\s/u.test(input[end]!)) end += 1;
  return { end, query: input.slice(start + 1, caret), start };
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
  // The exact caret-local mention dismissed with Escape. Moving to another
  // mention in the same draft may open it, while this one remains ordinary
  // sendable text until the person edits it.
  const [dismissedMention, setDismissedMention] = useState<string>();
  // The last caret the editor reported. Opening the picker moves focus into its
  // own search box, which ends the editor's selection, so the insertion point
  // has to be remembered rather than read back at selection time.
  const caretRef = useRef<number>(undefined);
  const pickerCaretRef = useRef<number>(undefined);
  const [caret, setCaret] = useState<number>();

  const mention = referenceMentionAt(input, caret);
  const mentionIdentity = mention
    ? JSON.stringify([input, mention.start, mention.end])
    : undefined;
  const open =
    contextReferences &&
    Boolean(workspaceId) &&
    (pickerOpen || (Boolean(mention) && dismissedMention !== mentionIdentity));
  const query = pickerOpen ? searchQuery : (mention?.query ?? '');
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
    setDismissedMention(mentionIdentity);
    focusEditor(pickerOpen ? pickerCaretRef.current : caretRef.current);
  }, [focusEditor, mentionIdentity, pickerOpen]);

  const openPicker = useCallback(() => {
    const insertionPoint = editorCaretOffset(editorRef.current) ?? caretRef.current ?? input.length;
    caretRef.current = insertionPoint;
    pickerCaretRef.current = insertionPoint;
    setCaret(insertionPoint);
    setSearchQuery('');
    setDismissedMention(undefined);
    setPickerOpen(true);
  }, [editorRef, input.length]);

  const select = useCallback(
    (reference: WorkspaceReference) => {
      const identity = workspaceReferenceIdentity(reference);
      // Draft invariant: a canonical workspace reference appears at most once.
      // That makes its durable identity a safe token key without inventing an
      // occurrence id that the wire cannot preserve across queue/retry paths.
      const alreadySelected = selectedReferences.some(
        (candidate) => workspaceReferenceIdentity(candidate.reference) === identity,
      );
      if (alreadySelected) {
        // Nothing to add. Consuming the typed query here would delete text the
        // person still has to see to understand why nothing happened.
        dismiss();
        return;
      }

      const liveCaret = pickerOpen
        ? pickerCaretRef.current
        : (editorCaretOffset(editorRef.current) ?? caretRef.current);
      // The + menu always inserts at its remembered caret. A typed mention owns
      // the token under the caret and replaces the whole token, including a
      // suffix to the right when the person moved into its middle.
      const activeMention = pickerOpen ? undefined : mention;
      const at = activeMention?.start ?? Math.min(liveCaret ?? input.length, input.length);
      const editEnd = activeMention?.end ?? at;
      const withoutMention = input.slice(0, at) + input.slice(editEnd);
      const { nextInput, offset } = insertReferenceAt(withoutMention, at);
      const shift = nextInput.length - input.length;

      setSelectedReferences([
        ...selectedReferences.map((selection) =>
          selection.offset >= editEnd
            ? { ...selection, offset: selection.offset + shift }
            : selection,
        ),
        { offset, reference },
      ]);
      setInput(nextInput);
      caretRef.current = offset;
      setCaret(offset);
      setPickerOpen(false);
      pickerCaretRef.current = undefined;
      setSearchQuery('');
      setDismissedMention(undefined);
      setOptions([]);
      setActiveReferenceId(undefined);
      setActiveOptionId(undefined);
      focusEditor(offset);
    },
    [
      dismiss,
      editorRef,
      focusEditor,
      input,
      mention,
      pickerOpen,
      selectedReferences,
      setInput,
      setSelectedReferences,
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

  const onCaretChange = useCallback((offset: number | undefined) => {
    if (offset === undefined) return;
    caretRef.current = offset;
    setCaret(offset);
  }, []);

  const restoreEditorFocus = useCallback(() => focusEditor(caretRef.current), [focusEditor]);

  return {
    activeOptionId: open ? activeOptionId : undefined,
    activeReferenceId: effectiveActiveReferenceId,
    dismiss,
    handleKeyDown,
    onActiveOptionChange: setActiveOptionId,
    onActiveReferenceChange: setActiveReferenceId,
    onCaretChange,
    onOptionsChange: setOptions,
    onQueryChange: setSearchQuery,
    open,
    openPicker,
    pickerOpen,
    popoverId,
    query,
    restoreEditorFocus,
    select,
  };
}
