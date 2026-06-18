import { createEffect, createMemo, createSignal, For, Show, untrack, type JSX } from 'solid-js';
import { brand } from '@brand';
import { Icon } from './Icon.js';
import type { Client } from '@clio/core';
import { AtMentionPicker, DEFAULT_ITEMS, type MentionItem } from './AtMentionPicker.js';
import { Dropdown, type DropdownItem } from './Dropdown.js';
import { Spinner } from './ui/Spinner.js';
import './composer.css';

export type PermissionMode = 'ask' | 'auto-edits' | 'plan' | 'auto' | 'bypass';

const PERM_DESCRIPTIONS: Record<PermissionMode, string> = {
  ask: 'Prompt me before every tool call',
  'auto-edits': 'Auto-approve safe file edits; ask for the rest',
  plan: 'Read-only — plan changes, never apply',
  auto: 'Auto-approve every action (use with care)',
  bypass: 'Skip permissions entirely',
};

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  /** 'upload' = real bytes sent to the backend; refs ride the @-mention path. */
  kind?: 'upload';
  /** Backend-returned workspace path once the upload lands. */
  path?: string;
  /** Upload in flight. */
  pending?: boolean;
  /** Upload failed; message for the chip tooltip. */
  error?: string;
}

export interface ModelOption {
  /** Globally-unique id used by the dropdown ("<provider>:<model>"). */
  id: string;
  providerId: string;
  modelId: string;
  providerLabel: string;
  description?: string;
}

export interface ComposerProps {
  backendLabel?: string;
  disabled?: boolean;
  /** When provided, replaces the static backend chip in the picker row. */
  backendSlot?: JSX.Element;
  streaming?: boolean;
  onStop?: () => void | Promise<void>;
  mentionItems?: MentionItem[];
  onSubmit?: (text: string) => Promise<void> | void;

  /**
   * Upload a file's bytes to the backend (POST /attachments). Returns the
   * registered context-file path. When absent or `attachmentsCapable` is
   * false, the Upload menu item is hidden — references still work via @.
   */
  onUploadFile?: (file: File) => Promise<{ path?: string } | void>;
  /** Backend advertises capabilities.attachments_upload. */
  attachmentsCapable?: boolean;
  /**
   * A2 — backend advertises capabilities.multimodal_image_parts (or a
   * vision-capable provider). When false the dedicated "Attach image…"
   * affordance is disabled with an explanatory tooltip; generic file
   * upload and text are unaffected. Defaults to true (capability absent
   * is treated as "allowed" — only an explicit `false` gates).
   */
  imageAttachCapable?: boolean;

  /** Live model options pulled from /v1/providers. */
  models?: ModelOption[];
  /** Currently-selected model id. */
  selectedModelId?: string;
  onPickModel?: (m: ModelOption) => void | Promise<void>;

  /** Selected permission mode. */
  permMode?: PermissionMode;
  onPickPermMode?: (m: PermissionMode) => void | Promise<void>;

  /**
   * Fires when the user types `/` as the first character into an
   * otherwise empty composer. ChatScreen wires it to open the slash
   * command palette.
   */
  onSlashTyped?: () => void;

  /** Explicit command-menu affordance rendered beside the attach button. */
  onOpenCommandPalette?: () => void;

  /**
   * Identifier that scopes a per-session localStorage draft. When the
   * key changes (user switches sessions), the current draft is
   * flushed under the old key and the new one is loaded into the
   * textarea. Drafts are cleared on successful submit.
   */
  draftKey?: string;

  /**
   * Bump to force the composer to re-hydrate its draft from
   * localStorage. ChatScreen wires this to the compose modal closing
   * so edits made there land back in the inline textarea immediately.
   */
  draftReloadTick?: number;

  /** Optional override for the textarea placeholder. */
  placeholder?: string;

  /** Live workspace `@`-picker — when both are set the picker also
   * shows files from `/v1/workspaces/{id}/files` underneath the
   * mentionItems entries. */
  workspaceClient?: Client;
  workspaceId?: string;

  /**
   * When a paste is at least this many lines, replace it with a
   * `[pasted N lines · click to expand]` chip. Defaults to 3.
   * Set to 0 to disable.
   */
  pasteCompressThreshold?: number;

  /** When set, renders a voice → text button next to the attach
   * affordance. ChatScreen wires this to
   * `client.transcribeVoice(activeId, audioBlob)`. */
  onTranscribeVoice?: (audio: Blob, filename: string) => Promise<string>;
}

export function Composer(props: ComposerProps = {}) {
  const [text, setText] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [stopping, setStopping] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [mentionHighlight, setMentionHighlight] = createSignal(0);

  // Composer input history — matches the TUI's Ctrl+Up/Down walk
  // through prior sent messages. Per-session ring persisted to
  // localStorage so it survives reloads.
  const HISTORY_CAP = 100;
  const histKey = () => `clio.input-history.${props.draftKey ?? '__no_session'}`;
  function readHistory(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(histKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
    } catch {
      return [];
    }
  }
  function pushHistory(t: string) {
    if (!t.trim()) return;
    const h = readHistory();
    if (h.length > 0 && h[h.length - 1] === t) return;
    h.push(t);
    while (h.length > HISTORY_CAP) h.shift();
    try {
      localStorage.setItem(histKey(), JSON.stringify(h));
    } catch {
      // ignore quota
    }
  }
  let historyCursor = -1;
  let historyDraft = '';
  function historyPrev(): string | null {
    const h = readHistory();
    if (h.length === 0) return null;
    if (historyCursor < 0) {
      historyDraft = text();
      historyCursor = h.length;
    }
    if (historyCursor > 0) historyCursor--;
    if (historyCursor >= h.length) historyCursor = h.length - 1;
    return h[historyCursor] ?? null;
  }
  function historyNext(): string | null {
    if (historyCursor < 0) return null;
    const h = readHistory();
    historyCursor++;
    if (historyCursor >= h.length) {
      const draft = historyDraft;
      historyCursor = -1;
      historyDraft = '';
      return draft;
    }
    return h[historyCursor] ?? null;
  }
  function exitHistory() {
    historyCursor = -1;
    historyDraft = '';
  }

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
  const PASTE_RE = /\[pasted (\d+) lines? · click to expand · #([a-z0-9]+)\]/g;

  function expandPastes(t: string): string {
    const stash = pasteStash();
    return t.replace(PASTE_RE, (whole, _lines, id) => stash[id] ?? whole);
  }

  // Per-session draft persistence. On draftKey change, save the
  // outgoing draft and load the incoming one. Survives reloads and
  // session switches.
  let lastKey: string | undefined;
  const storageKey = (k: string) => `clio.draft.${k}`;
  createEffect(() => {
    // Only react to draftKey changes. text() reads inside are wrapped
    // in untrack so this effect doesn't re-fire on every keystroke —
    // an earlier version did, which made it read stale localStorage
    // and reset the textarea mid-typing, eating the second character.
    const key = props.draftKey;
    if (typeof window === 'undefined') return;
    untrack(() => {
      if (lastKey && lastKey !== key) {
        const outgoing = text();
        if (outgoing) {
          try { localStorage.setItem(storageKey(lastKey), outgoing); }
          catch { /* ignore */ }
        } else {
          try { localStorage.removeItem(storageKey(lastKey)); }
          catch { /* ignore */ }
        }
      }
      if (key) {
        try {
          const restored = localStorage.getItem(storageKey(key)) ?? '';
          const current = text();
          // If the user was typing into the empty-state composer
          // ('__new') and a real session just became active, carry
          // the draft forward instead of wiping it.
          if (!restored && current && lastKey === '__new') {
            try { localStorage.setItem(storageKey(key), current); }
            catch { /* ignore */ }
          } else if (restored !== current) {
            setText(restored);
          }
        } catch {
          setText('');
        }
      } else if (!lastKey) {
        // First mount without a key — leave whatever is in the box.
      } else if (text() !== '') {
        setText('');
      }
      lastKey = key;
    });
  });

  // External-trigger reload — bumped when the compose modal closes so
  // whatever text the user typed there flows into the inline textarea.
  // The Solid effect tracks `props.draftReloadTick` and re-reads the
  // current draftKey from localStorage when it changes. Skip the
  // initial firing — otherwise mounting the composer instantly
  // wipes whatever the user starts typing before Solid's first
  // effect batch settles.
  let lastReloadTick: number | undefined;
  createEffect(() => {
    const tick = props.draftReloadTick;
    if (tick === undefined) return;
    if (lastReloadTick === undefined) {
      lastReloadTick = tick;
      return;
    }
    if (tick === lastReloadTick) return;
    lastReloadTick = tick;
    const key = props.draftKey;
    if (!key || typeof window === 'undefined') return;
    try {
      const restored = localStorage.getItem(storageKey(key)) ?? '';
      setText(restored);
    } catch {
      /* ignore */
    }
  });

  // Live persist every keystroke so a crash/reload doesn't lose text.
  // Throttle is unnecessary — localStorage writes <1KB are cheap.
  createEffect(() => {
    const key = props.draftKey;
    const cur = text();
    if (typeof window === 'undefined' || !key) return;
    try {
      if (cur) localStorage.setItem(storageKey(key), cur);
      else localStorage.removeItem(storageKey(key));
    } catch {
      /* ignore */
    }
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
  const selectedModel = () =>
    (props.models ?? []).find((m) => m.id === selectedModelId());

  const modelItems = createMemo<DropdownItem<ModelOption>[]>(() =>
    (props.models ?? []).map((m) => ({
      id: m.id,
      label: m.modelId,
      detail: m.providerLabel,
      description: m.description,
      group: m.providerLabel,
      value: m,
    })),
  );
  const permItems = createMemo<DropdownItem<PermissionMode>[]>(() =>
    (['ask', 'auto-edits', 'plan', 'auto', 'bypass'] as PermissionMode[]).map((p) => ({
      id: p,
      label: p,
      description: PERM_DESCRIPTIONS[p],
      value: p,
    })),
  );

  const mentionQuery = createMemo(() => {
    const t = text();
    const at = t.lastIndexOf('@');
    if (at === -1) return null;
    const tail = t.slice(at + 1);
    if (/\s/.test(tail)) return null;
    return tail;
  });
  const mentionOpen = () => mentionQuery() !== null;

  function pickMention(item: MentionItem) {
    const t = text();
    const at = t.lastIndexOf('@');
    const next = (at === -1 ? t : t.slice(0, at)) + '@' + item.label + ' ';
    setText(next);
    setMentionHighlight(0);
  }

  // Attachment state + file picker wiring.
  const [attachments, setAttachments] = createSignal<AttachedFile[]>([]);
  const [voiceBusy, setVoiceBusy] = createSignal(false);
  const [recording, setRecording] = createSignal(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = createSignal(0);
  let voiceInputRef: HTMLInputElement | undefined;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let recordingTimer: ReturnType<typeof setInterval> | undefined;

  async function onVoicePicked(ev: Event) {
    const inp = ev.currentTarget as HTMLInputElement;
    const file = inp.files?.[0];
    inp.value = '';
    if (!file || !props.onTranscribeVoice) return;
    setVoiceBusy(true);
    try {
      const txt = await props.onTranscribeVoice(file, file.name);
      setText((prev) => (prev ? `${prev} ${txt}` : txt));
    } catch {
      // surfaced via toast upstream — composer stays usable
    } finally {
      setVoiceBusy(false);
    }
  }

  /**
   * Toggle browser-side mic recording via MediaRecorder. On stop, hand
   * the resulting webm/opus blob to the transcribe callback so the
   * backend gets a chance to turn it into text. No fancy waveform —
   * just a record dot while the stream is hot.
   */
  async function toggleMicRecording() {
    if (!props.onTranscribeVoice) return;
    if (recording()) {
      mediaRecorder?.stop();
      return;
    }
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      const rec = new MediaRecorder(stream);
      mediaRecorder = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      rec.onstop = () => {
        setRecording(false);
        if (recordingTimer) {
          clearInterval(recordingTimer);
          recordingTimer = undefined;
        }
        setRecordingElapsedMs(0);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        recordedChunks = [];
        if (!props.onTranscribeVoice || blob.size === 0) return;
        setVoiceBusy(true);
        void props
          .onTranscribeVoice(blob, 'mic.webm')
          .then((txt) => setText((prev) => (prev ? `${prev} ${txt}` : txt)))
          .catch(() => {
            /* surfaced upstream */
          })
          .finally(() => setVoiceBusy(false));
      };
      rec.start();
      setRecording(true);
      const startedAt = Date.now();
      recordingTimer = setInterval(() => {
        setRecordingElapsedMs(Date.now() - startedAt);
      }, 250);
    } catch {
      setRecording(false);
    }
  }
  let fileInputRef: HTMLInputElement | undefined;
  let imageInputRef: HTMLInputElement | undefined;
  let inputTextareaRef: HTMLTextAreaElement | undefined;
  const [attachMenuOpen, setAttachMenuOpen] = createSignal(false);

  // Auto-grow the composer to fit its content even when `text()` is set
  // programmatically (fixtures, history walk, paste-expand) — the onInput
  // handler only fires for keystrokes, so a pre-filled multiline draft would
  // otherwise stay clamped to one row and clip.
  createEffect(() => {
    const value = text();
    const ta = inputTextareaRef;
    if (!ta) return;
    queueMicrotask(() => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
      void value;
    });
  });

  // A2: only an explicit `false` gates image attachment; absent → allowed.
  const imageAttachAllowed = () => props.imageAttachCapable !== false;

  function openUpload() {
    setAttachMenuOpen(false);
    fileInputRef?.click();
  }

  function openImageUpload() {
    if (!imageAttachAllowed()) return;
    setAttachMenuOpen(false);
    imageInputRef?.click();
  }

  function mentionWorkspaceFile() {
    // References ride the @-mention path: clio parses `@path` in the
    // message into a context attachment and strips the marker, so the
    // agent reads the file by reference (no bytes move). Dropping an `@`
    // in opens the existing AtMentionPicker over the live workspace files.
    setAttachMenuOpen(false);
    setText((t) => (t === '' || t.endsWith(' ') || t.endsWith('@') ? t + '@' : t + ' @'));
  }

  function onFilesPicked(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    void addUploadedFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  // Original File objects keyed by chip id so a failed upload can be
  // retried in place (actionable error states) — not reactive on purpose.
  const uploadSources = new Map<string, File>();

  /** Run (or re-run) the upload for one chip id. */
  async function uploadOne(id: string, f: File) {
    if (!props.onUploadFile) return;
    setAttachments((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, pending: true, error: undefined } : a,
      ),
    );
    try {
      const res = await props.onUploadFile(f);
      const path = res && typeof res === 'object' ? res.path : undefined;
      uploadSources.delete(id); // landed — no retry needed
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, pending: false, ...(path ? { path } : {}) } : a,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, pending: false, error: msg } : a)),
      );
    }
  }

  /** Re-attempt a failed upload from its chip's Retry button. */
  function retryUpload(id: string) {
    const f = uploadSources.get(id);
    if (f) void uploadOne(id, f);
  }

  /**
   * Upload real bytes for each file (base64 → POST /attachments). A chip
   * appears immediately in `pending` state, then resolves to the
   * backend-returned path or an error — never a fake text header (the old
   * behaviour embedded "[attached N files]" and sent NO bytes).
   */
  async function addUploadedFiles(files: File[]) {
    if (files.length === 0 || !props.onUploadFile) return;
    for (const f of files) {
      const id = cryptoRandomId();
      uploadSources.set(id, f);
      setAttachments((prev) => [
        ...prev,
        {
          id,
          name: f.name,
          size: f.size,
          mimeType: f.type || 'application/octet-stream',
          kind: 'upload',
          pending: true,
        },
      ]);
      await uploadOne(id, f);
    }
  }

  const [dragging, setDragging] = createSignal(false);
  function onDragOver(e: DragEvent) {
    const types = Array.from(e.dataTransfer?.types ?? []);
    if (types.includes('Files') || types.includes('application/x-gact-path')) {
      e.preventDefault();
      setDragging(true);
    }
  }
  function onDragLeave(_: DragEvent) {
    setDragging(false);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    // In-app drag of a workspace file → reference via @-mention (no bytes
    // move; the agent already sees it). OS file drop → real upload.
    const refPath = e.dataTransfer?.getData('application/x-gact-path');
    if (refPath) {
      setText((t) => (t === '' || t.endsWith(' ') ? t : t + ' ') + '@' + refPath + ' ');
      return;
    }
    void addUploadedFiles(Array.from(e.dataTransfer?.files ?? []));
  }

  function removeAttachment(id: string) {
    uploadSources.delete(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function submit() {
    const t = text().trim();
    if (!t || busy() || props.disabled) return;
    setError(null);
    pushHistory(t);
    exitHistory();
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
    setAttachments([]);
    try {
      await props.onSubmit(expandPastes(t));
      // Clear the stash on successful send.
      setPasteStash({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setText(t);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      class={'composer ' + (dragging() ? 'composer--dragging' : '')}
      data-testid="composer"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Show when={dragging()}>
        <div class="composer__droptarget" aria-hidden>
          <Icon name="attach" size={24} />
          <span>Drop files to attach</span>
        </div>
      </Show>
      <Show when={error()}>
        <div class="composer__error" data-testid="composer-error">
          {error()}
        </div>
      </Show>

      <div class="composer__shell">
        <Show when={attachments().length > 0}>
          <div class="composer__chips" data-testid="composer-attachments">
            <For each={attachments()}>
              {(a) => (
                <span
                  class="composer__chip"
                  classList={{
                    'composer__chip--pending': !!a.pending,
                    'composer__chip--error': !!a.error,
                  }}
                  data-testid={`composer-attachment-${a.id}`}
                  title={a.error ? `Upload failed: ${a.error}` : (a.path ?? a.name)}
                >
                  <Show
                    when={a.pending}
                    fallback={<Icon name={a.error ? 'close' : 'attach'} size={11} />}
                  >
                    <Spinner class="composer__chip-spin" label="uploading" />
                  </Show>
                  <span class="composer__chip-name">{a.name}</span>
                  <Show
                    when={a.error}
                    fallback={
                      <span class="composer__chip-size">
                        {a.pending ? 'uploading…' : humanSize(a.size)}
                      </span>
                    }
                  >
                    <span class="composer__chip-size composer__chip-size--error">failed</span>
                    <button
                      type="button"
                      class="composer__chip-retry"
                      onClick={() => retryUpload(a.id)}
                      data-testid={`composer-attachment-retry-${a.id}`}
                      aria-label={`Retry upload of ${a.name}`}
                    >
                      Retry
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="composer__chip-x"
                    onClick={() => removeAttachment(a.id)}
                    aria-label={`Remove ${a.name}`}
                  >
                    <Icon name="close" size={10} />
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={onFilesPicked}
          data-testid="composer-file-input"
        />

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onFilesPicked}
          data-testid="composer-image-input"
        />

        <input
          ref={voiceInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={onVoicePicked}
          data-testid="composer-voice-input"
        />

        <div class="composer__row">
          <div class="composer__row-lead">
            <button
              type="button"
              class="composer__attach composer__command"
              title="Commands"
              aria-label="Open command menu"
              data-testid="composer-command"
              onClick={() => props.onOpenCommandPalette?.()}
            >
              <span class="composer__slash-icon" aria-hidden>/</span>
            </button>
            <div class="composer__attach-wrap">
              <button
                type="button"
                class="composer__attach"
                title="Add context"
                aria-label="Add context"
                aria-haspopup="menu"
                aria-expanded={attachMenuOpen()}
                data-testid="composer-attach"
                onClick={() => setAttachMenuOpen((v) => !v)}
              >
                <Icon name="attach" size={16} />
              </button>
              <Show when={attachMenuOpen()}>
                <div
                  class="composer__attach-backdrop"
                  onClick={() => setAttachMenuOpen(false)}
                  aria-hidden
                />
                <div
                  class="composer__attach-menu"
                  role="menu"
                  data-testid="composer-attach-menu"
                >
                  <div class="composer__attach-menu-group">From your computer</div>
                  <Show
                    when={props.attachmentsCapable && props.onUploadFile}
                    fallback={
                      <div
                        class="composer__attach-menuitem is-disabled"
                        data-testid="composer-attach-upload-disabled"
                      >
                        <Icon name="file" size={13} />
                        <span class="composer__attach-menuitem-label">
                          Upload from computer…
                        </span>
                        <span class="composer__attach-menuitem-sub">
                          backend has no upload
                        </span>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      role="menuitem"
                      class="composer__attach-menuitem"
                      data-testid="composer-attach-upload"
                      onClick={openUpload}
                    >
                      <Icon name="file" size={13} />
                      <span class="composer__attach-menuitem-label">
                        Upload from computer…
                      </span>
                      <span class="composer__attach-menuitem-sub">
                        sends file bytes
                      </span>
                    </button>
                  </Show>
                  {/* A2: image attach is gated on multimodal_image_parts. When
                    the backend/model can't accept images we still render the
                    row, but disabled with an explanatory tooltip — generic
                    file upload above and text are unaffected. */}
                  <Show
                    when={
                      props.attachmentsCapable &&
                      props.onUploadFile &&
                      imageAttachAllowed()
                    }
                    fallback={
                      <Show when={props.attachmentsCapable && props.onUploadFile}>
                        <div
                          class="composer__attach-menuitem is-disabled"
                          data-testid="composer-attach-image-disabled"
                          title="This model/backend doesn't accept images"
                        >
                          <Icon name="image" size={13} />
                          <span class="composer__attach-menuitem-label">
                            Attach image…
                          </span>
                          <span class="composer__attach-menuitem-sub">
                            no image support
                          </span>
                        </div>
                      </Show>
                    }
                  >
                    <button
                      type="button"
                      role="menuitem"
                      class="composer__attach-menuitem"
                      data-testid="composer-attach-image"
                      onClick={openImageUpload}
                    >
                      <Icon name="image" size={13} />
                      <span class="composer__attach-menuitem-label">
                        Attach image…
                      </span>
                      <span class="composer__attach-menuitem-sub">
                        sends image bytes
                      </span>
                    </button>
                  </Show>
                  <div class="composer__attach-menu-group">In this workspace</div>
                  <button
                    type="button"
                    role="menuitem"
                    class="composer__attach-menuitem"
                    data-testid="composer-attach-mention"
                    onClick={mentionWorkspaceFile}
                  >
                    <Icon name="mention" size={13} />
                    <span class="composer__attach-menuitem-label">
                      Reference a workspace file
                    </span>
                    <span class="composer__attach-menuitem-sub">
                      @ — agent reads by path
                    </span>
                  </button>
                </div>
              </Show>
            </div>
            <Show when={props.onTranscribeVoice}>
              <button
                type="button"
                class={'composer__attach ' + (recording() ? 'is-recording' : '')}
                title={
                  recording()
                    ? `Recording ${Math.floor(recordingElapsedMs() / 1000)}s — click to stop`
                    : voiceBusy()
                      ? 'Transcribing…'
                      : 'Record voice — click again to stop'
                }
                aria-label="Record voice"
                data-testid="composer-mic"
                onClick={() => void toggleMicRecording()}
                disabled={voiceBusy() && !recording()}
              >
                <Icon name={recording() ? 'stop' : 'mic'} size={16} />
              </button>
              <Show when={recording()}>
                <span
                  class="composer__mic-elapsed"
                  data-testid="composer-mic-elapsed"
                  aria-live="polite"
                >
                  {Math.floor(recordingElapsedMs() / 1000)}s
                </span>
              </Show>
              <button
                type="button"
                class="composer__attach"
                title="Upload audio file for transcription"
                aria-label="Upload audio file"
                data-testid="composer-voice"
                onClick={() => voiceInputRef?.click()}
                disabled={voiceBusy() || recording()}
              >
                <Icon name="audio" size={14} />
              </button>
            </Show>
          </div>
          <div class="composer__input-wrap">
            <textarea
              ref={(el) => {
                inputTextareaRef = el;
              }}
              class="composer__input"
              placeholder={
                props.placeholder ??
                `Ask ${brand.name} anything — type @ for files, agents, tools`
              }
              rows={1}
              value={text()}
              onPaste={(e) => {
                const threshold = props.pasteCompressThreshold ?? 3;
                if (threshold <= 0) return;
                const clip = e.clipboardData?.getData('text');
                if (!clip) return;
                const lines = clip.split(/\r?\n/).length;
                if (lines < threshold) return;
                e.preventDefault();
                const id = Math.random().toString(36).slice(2, 8);
                setPasteStash((s) => ({ ...s, [id]: clip }));
                const ta = e.currentTarget;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const placeholder = `[pasted ${lines} lines · click to expand · #${id}]`;
                const before = ta.value.slice(0, start);
                const after = ta.value.slice(end);
                const next = before + placeholder + after;
                setText(next);
                // Move caret to just after the inserted placeholder on
                // the next tick so the user can keep typing.
                queueMicrotask(() => {
                  ta.value = next;
                  const pos = (before + placeholder).length;
                  ta.setSelectionRange(pos, pos);
                  ta.style.height = 'auto';
                  ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
                });
              }}
              onInput={(e) => {
                setText(e.currentTarget.value);
                // auto-resize
                e.currentTarget.style.height = 'auto';
                e.currentTarget.style.height =
                  Math.min(200, e.currentTarget.scrollHeight) + 'px';
              }}
              onKeyDown={(e) => {
                if (mentionOpen()) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionHighlight((h) => h + 1);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionHighlight((h) => Math.max(0, h - 1));
                    return;
                  }
                }
                // `/` on an empty composer opens the slash palette
                // (matches Claude / Cursor / VSCode convention).
                if (e.key === '/' && text().length === 0 && props.onSlashTyped) {
                  e.preventDefault();
                  props.onSlashTyped();
                  return;
                }
                // TUI parity: ArrowUp / ArrowDown walk the per-session
                // input history when the caret is at the very top /
                // very bottom of the textarea. Don't steal from line
                // navigation in multi-line drafts.
                if (e.key === 'ArrowUp' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  const ta = e.currentTarget as HTMLTextAreaElement;
                  if (ta.selectionStart === 0 && ta.selectionEnd === 0) {
                    const prev = historyPrev();
                    if (prev !== null) {
                      e.preventDefault();
                      setText(prev);
                      queueMicrotask(() => {
                        ta.value = prev;
                        ta.setSelectionRange(prev.length, prev.length);
                      });
                      return;
                    }
                  }
                }
                if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  const ta = e.currentTarget as HTMLTextAreaElement;
                  if (ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length) {
                    const next = historyNext();
                    if (next !== null) {
                      e.preventDefault();
                      setText(next);
                      queueMicrotask(() => {
                        ta.value = next;
                        ta.setSelectionRange(next.length, next.length);
                      });
                      return;
                    }
                  }
                }
                // Any other navigation key exits history mode so the
                // user's edit doesn't stomp the cursor walk.
                if (
                  e.key !== 'ArrowUp' &&
                  e.key !== 'ArrowDown' &&
                  e.key !== 'Shift' &&
                  e.key !== 'Control' &&
                  e.key !== 'Meta' &&
                  e.key !== 'Alt'
                ) {
                  exitHistory();
                }
                // Ctrl/Cmd+P expands the most recent compressed paste
                // back into the textarea in place.
                if (
                  (e.metaKey || e.ctrlKey) &&
                  e.key.toLowerCase() === 'p' &&
                  !e.shiftKey
                ) {
                  const ids = Object.keys(pasteStash());
                  if (ids.length === 0) return;
                  e.preventDefault();
                  const ta = e.currentTarget;
                  const current = ta.value;
                  // Replace the last occurrence of any placeholder.
                  let nextText = current;
                  let lastIdx = -1;
                  let lastId = '';
                  let lastWhole = '';
                  let m: RegExpExecArray | null;
                  const re = new RegExp(PASTE_RE.source, 'g');
                  while ((m = re.exec(current)) !== null) {
                    if (m.index > lastIdx) {
                      lastIdx = m.index;
                      lastId = m[2] ?? '';
                      lastWhole = m[0];
                    }
                  }
                  if (lastIdx < 0 || !lastId) return;
                  const stash = pasteStash();
                  const expansion = stash[lastId] ?? '';
                  nextText =
                    current.slice(0, lastIdx) +
                    expansion +
                    current.slice(lastIdx + lastWhole.length);
                  setText(nextText);
                  setPasteStash((s) => {
                    const copy = { ...s };
                    delete copy[lastId];
                    return copy;
                  });
                  queueMicrotask(() => {
                    ta.value = nextText;
                    ta.style.height = 'auto';
                    ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
                  });
                  return;
                }
                // Cmd/Ctrl+Enter forces a submit even when Shift is
                // held (covers users who switch between Discord-style
                // newline-by-Enter conventions and this one).
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              data-testid="composer-input"
            />
            <AtMentionPicker
              open={mentionOpen()}
              query={mentionQuery() ?? ''}
              items={props.mentionItems ?? DEFAULT_ITEMS}
              highlight={mentionHighlight()}
              client={props.workspaceClient}
              workspaceId={props.workspaceId}
              onPick={pickMention}
              onClose={() => setMentionHighlight(0)}
            />
          </div>
          <Show
            when={props.streaming}
            fallback={
              <button
                type="button"
                class="composer__send"
                disabled={!text().trim() || busy() || props.disabled}
                data-testid="composer-send"
                onClick={() => void submit()}
                aria-label="Send message"
              >
                <Icon name="send" size={16} />
              </button>
            }
          >
            <button
              type="button"
              class={
                'composer__send composer__send--stop ' +
                (stopping() ? 'composer__send--stopping' : '')
              }
              data-testid="composer-stop"
              onClick={() => void handleStop()}
              disabled={stopping()}
              aria-label={stopping() ? 'Stopping…' : 'Stop generation'}
              title={stopping() ? 'Stopping…' : 'Stop generation'}
            >
              <Icon name="stop" size={14} />
            </button>
          </Show>
        </div>

        <div class="composer__pickers">
          <Show
            when={props.backendSlot}
            fallback={
              <button
                type="button"
                class="composer__picker"
                data-testid="composer-backend"
              >
                <span class="sx__pip sx__pip--idle" style="width:6px;height:6px" />
                {props.backendLabel ?? 'localhost'}
                <Icon name="chevron-down" size={10} />
              </button>
            }
          >
            {props.backendSlot}
          </Show>
          <Dropdown
            testid="composer-perm"
            label={permMode()}
            icon="circle"
            items={permItems()}
            selectedId={permMode()}
            onPick={(it) => setPerm(it.value)}
          />
          <Dropdown
            testid="composer-model"
            label={selectedModel()?.modelId ?? 'pick model'}
            icon="sparkle"
            items={modelItems()}
            selectedId={selectedModelId()}
            emptyHint="No providers configured"
            onPick={(it) => {
              setLocalModelId(it.id);
              void props.onPickModel?.(it.value);
            }}
          />
        </div>
      </div>

      <div class="composer__hint">
        <span class="composer__kbd">Enter</span> to send ·{' '}
        <span class="composer__kbd">Shift + Enter</span> for newline ·{' '}
        <span class="composer__kbd">@</span> mention ·{' '}
        <span class="composer__kbd">/</span> commands
      </div>
    </div>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(6);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2, 12);
}
