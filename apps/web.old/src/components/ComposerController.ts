/**
 * Controller for Composer: imperative glue/effects wiring the component to its model.
 */
import { createEffect, createMemo, createSignal } from 'solid-js';
import { createComposerAttachmentState } from './ComposerAttachmentState.js';
import {
  buildModelItems,
  buildPermissionItems,
  selectedModelForId,
} from './ComposerPickerModel.js';
import { createComposerDraftPersistence, createComposerHistory } from './ComposerState.js';
import {
  composerSubmitDraft,
  composerSubmitErrorMessage,
} from './ComposerSubmitModel.js';
import type { ComposerProps, ModelOption, PermissionMode } from './ComposerTypes.js';
import { createComposerVoiceState } from './ComposerVoiceState.js';

export function createComposerController(props: ComposerProps) {
  const [text, setText] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [stopping, setStopping] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const history = createComposerHistory({
    historyKey: () => `clio.input-history.${props.draftKey ?? '__no_session'}`,
    currentText: text,
  });

  // Reset stopping state when streaming actually ends.
  createEffect(() => {
    if (!props.streaming) setStopping(false);
  });

  async function handleStop() {
    if (stopping() || !props.onStop) return;
    setStopping(true);
    try {
      await props.onStop();
    } finally {
      // Leave setStopping(true) — the createEffect above will flip it
      // back to false once the streaming signal drops.
    }
  }

  // Pasted blobs that have been compressed into `[pasted N lines]`
  // placeholders. Keyed by a synthetic id embedded in the placeholder
  // text so submit can expand them before posting.
  const [pasteStash, setPasteStash] = createSignal<Record<string, string>>({});

  createComposerDraftPersistence({
    draftKey: () => props.draftKey,
    draftReloadTick: () => props.draftReloadTick,
    text,
    setText,
  });

  // Picker state — controlled when parent provides a value, else local.
  const [localPerm, setLocalPerm] = createSignal<PermissionMode>('ask');
  const permMode = () => props.permMode ?? localPerm();
  function setPerm(m: PermissionMode) {
    setLocalPerm(m);
    void props.onPickPermMode?.(m);
  }

  const [localModelId, setLocalModelId] = createSignal<string>('');
  const selectedModelId = () => props.selectedModelId ?? localModelId();
  const selectedModel = () => selectedModelForId(props.models, selectedModelId());

  const modelItems = createMemo(() => buildModelItems(props.models));
  const permItems = createMemo(() => buildPermissionItems());

  const voice = createComposerVoiceState({
    transcribeVoice: () => props.onTranscribeVoice,
    appendText: (txt) => setText((prev) => (prev ? `${prev} ${txt}` : txt)),
  });

  const attachments = createComposerAttachmentState({
    uploadFile: () => props.onUploadFile,
    imageAttachCapable: () => props.imageAttachCapable,
    setText,
  });

  async function submit() {
    const draft = composerSubmitDraft({
      text: text(),
      busy: busy(),
      disabled: props.disabled,
      pasteStash: pasteStash(),
    });
    if (!draft) return;
    setError(null);
    history.push(draft.trimmedText);
    history.exit();
    if (!props.onSubmit) {
      setText('');
      return;
    }
    setBusy(true);
    setText('');
    // Uploaded files are already registered as context files server-side
    // (the upload fired when they were picked/dropped), and @-mentions are
    // parsed from the text by clio — so the message body is sent as-is and
    // the chips are cleared (the Context inspector is the source of truth).
    attachments.uploads.clearAttachments();
    try {
      await props.onSubmit(draft.expandedText);
      // Clear the stash on successful send.
      setPasteStash({});
    } catch (e) {
      setError(composerSubmitErrorMessage(e));
      setText(draft.trimmedText);
    } finally {
      setBusy(false);
    }
  }

  function pickModel(item: { id: string; value: ModelOption }) {
    setLocalModelId(item.id);
    void props.onPickModel?.(item.value);
  }

  return {
    text,
    setText,
    busy,
    error,
    history,
    pasteStash,
    setPasteStash,
    permMode,
    permItems,
    setPerm,
    selectedModelId,
    selectedModel,
    modelItems,
    pickModel,
    voice,
    attachments,
    submit,
    stopping,
    handleStop,
  };
}
