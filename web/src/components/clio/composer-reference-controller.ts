import type { WorkspaceReference } from '@clio/core/v3';
import { useCallback, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { ReferenceMenuHandle } from './composer-references';
import {
  workspaceReferenceIdentity,
  type InlineReferenceSelection,
} from '@/lib/composer-reference-domain';
import { editorCaretOffset } from './composer-editor-model';
import { hdf5DrillQuery, hdf5UpQuery, parseHdf5Mention } from './composer-hdf5-references';

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
  /**
   * Always undefined: the menu owns its highlight and the editor subscribes to
   * it directly, so arrowing through suggestions never re-renders the composer.
   * @deprecated Kept until the composer stops passing it to the editor.
   */
  activeOptionId?: string;
  dismiss: () => void;
  /** Consumes a key the popover owns; false leaves it to the composer. */
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => boolean;
  /** The open menu's handle: its highlighted row and how to move it. */
  menuRef: RefObject<ReferenceMenuHandle | null>;
  onCaretChange: (offset: number | undefined) => void;
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
 * Owns the composer's reference popover: which surface opened it, what the
 * typed mention searches for, and where a chosen reference lands in the draft.
 * The menu itself owns its highlight and the picker's search, so neither
 * re-renders the composer.
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
  const menuRef = useRef<ReferenceMenuHandle>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The exact caret-local mention dismissed with Escape. Moving to another
  // mention in the same draft may open it, while this one remains ordinary
  // sendable text until the person edits it.
  const [dismissedMention, setDismissedMention] = useState<string>();
  // The last caret the editor reported. Opening the picker moves focus into its
  // own search box, which ends the editor's selection, so the insertion point
  // has to be remembered rather than read back at selection time.
  const caretRef = useRef<number>(undefined);
  const pickerCaretRef = useRef<number>(undefined);
  // The mention whose suggestions the person has arrowed through. A bare `@`
  // only picks its highlighted row with Enter after that explicit choice.
  const navigatedMentionRef = useRef<string>(undefined);
  const [caret, setCaret] = useState<number>();

  const mention = referenceMentionAt(input, caret);
  const mentionIdentity = mention ? JSON.stringify([input, mention.start, mention.end]) : undefined;
  // Escape dismisses one mention until it is edited away. Deleting it and
  // typing the same `@` again is a new mention, so the menu offers itself again.
  if (dismissedMention !== undefined && mentionIdentity !== dismissedMention) {
    setDismissedMention(undefined);
  }
  const open =
    contextReferences &&
    Boolean(workspaceId) &&
    (pickerOpen || (Boolean(mention) && dismissedMention !== mentionIdentity));
  const query = pickerOpen ? '' : (mention?.query ?? '');

  const dismiss = useCallback(() => {
    setPickerOpen(false);
    setDismissedMention(mentionIdentity);
    focusEditor(pickerOpen ? pickerCaretRef.current : caretRef.current);
  }, [focusEditor, mentionIdentity, pickerOpen]);

  const openPicker = useCallback(() => {
    const insertionPoint = editorCaretOffset(editorRef.current) ?? caretRef.current ?? input.length;
    caretRef.current = insertionPoint;
    pickerCaretRef.current = insertionPoint;
    setCaret(insertionPoint);
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
      // Past the space that follows the reference, so the next word is its own.
      const caret = offset + 1;
      caretRef.current = caret;
      setCaret(caret);
      setPickerOpen(false);
      pickerCaretRef.current = undefined;
      setDismissedMention(undefined);
      focusEditor(caret);
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

  /**
   * Tab on an HDF5 file or group lists its contents instead of adding it: the
   * mention becomes `file.h5::/group/`, so the typed text and the listing agree.
   * Shift Tab (or Escape) goes back up one level. The picker's own search box
   * does both inside the menu.
   */
  const rewriteMention = useCallback(
    (next: string): boolean => {
      if (pickerOpen || !mention) return false;
      const nextInput = `${input.slice(0, mention.start + 1)}${next}${input.slice(mention.end)}`;
      const shift = nextInput.length - input.length;
      const offset = mention.start + 1 + next.length;
      setSelectedReferences(
        selectedReferences.map((selection) =>
          selection.offset >= mention.end
            ? { ...selection, offset: selection.offset + shift }
            : selection,
        ),
      );
      setInput(nextInput);
      caretRef.current = offset;
      setCaret(offset);
      focusEditor(offset);
      return true;
    },
    [focusEditor, input, mention, pickerOpen, selectedReferences, setInput, setSelectedReferences],
  );
  const drill = useCallback(
    (reference: WorkspaceReference): boolean => {
      const next = hdf5DrillQuery(reference);
      return next ? rewriteMention(next) : false;
    },
    [rewriteMention],
  );
  const up = useCallback((): boolean => {
    const inside = mention ? parseHdf5Mention(mention.query) : undefined;
    return inside ? rewriteMention(hdf5UpQuery(inside)) : false;
  }, [mention, rewriteMention]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): boolean => {
      if (!open) return false;
      // Back one step, then close: inside a file Escape goes up a level first.
      if (event.key === 'Escape' || (event.key === 'Tab' && event.shiftKey)) {
        if (up()) {
          event.preventDefault();
          return true;
        }
        if (event.key === 'Tab') return false;
        event.preventDefault();
        dismiss();
        return true;
      }
      const menu = menuRef.current;
      if (!menu) return false;
      if (event.key === 'PageDown' || event.key === 'PageUp') {
        if (!menu.moveGroup(event.key === 'PageDown' ? 1 : -1)) return false;
        event.preventDefault();
        navigatedMentionRef.current = mentionIdentity;
        return true;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!menu.move(event.key === 'ArrowDown' ? 1 : -1)) return false;
        event.preventDefault();
        navigatedMentionRef.current = mentionIdentity;
        return true;
      }
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing &&
        !pickerOpen &&
        mention?.query === '' &&
        navigatedMentionRef.current !== mentionIdentity
      ) {
        // A bare `@` names nothing yet. Enter closes the suggestions and keeps
        // the literal `@`; the next Enter sends it.
        event.preventDefault();
        dismiss();
        return true;
      }
      if (
        (event.key === 'Enter' || event.key === 'Tab') &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        const active = menu.active();
        if (!active) {
          if (event.key !== 'Enter' || !menu.offering()) return false;
          event.preventDefault();
          return true;
        }
        event.preventDefault();
        if (event.key === 'Tab' && drill(active)) return true;
        select(active);
        return true;
      }
      return false;
    },
    [dismiss, drill, mention?.query, mentionIdentity, open, pickerOpen, select, up],
  );

  const onCaretChange = useCallback((offset: number | undefined) => {
    if (offset === undefined) return;
    caretRef.current = offset;
    setCaret(offset);
  }, []);

  const restoreEditorFocus = useCallback(() => focusEditor(caretRef.current), [focusEditor]);

  return {
    activeOptionId: undefined,
    dismiss,
    handleKeyDown,
    menuRef,
    onCaretChange,
    open,
    openPicker,
    pickerOpen,
    popoverId,
    query,
    restoreEditorFocus,
    select,
  };
}
