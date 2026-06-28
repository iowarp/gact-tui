/**
 * Modal for choosing a session's semantic blueprint/expert pack. Exports
 * {@link SessionSemanticsModal}.
 */
import { createEffect, createSignal, For, onMount, Show } from 'solid-js';
import { Icon } from '../components/Icon.js';
import { registerWindowKeydown } from '../domListeners.js';
import { trapFocusRef } from '../focus-trap.js';
import {
  loadSessionSemanticsDefaults,
  saveSessionSemanticsDefaults,
  sanitizeSessionSemantics,
  type SessionSemanticOption,
  type SessionSemanticsSelection,
} from '../session-semantics.js';
import {
  buildSessionSemanticsSelection,
  selectedSessionSemanticDescription,
} from './SessionSemanticsModalModel.js';
import './session-semantics-modal.css';

export function SessionSemanticsModal(props: {
  open: boolean;
  loading?: boolean;
  blueprints: SessionSemanticOption[];
  expertPacks: SessionSemanticOption[];
  onStart: (selection: SessionSemanticsSelection, title: string) => Promise<void> | void;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const [title, setTitle] = createSignal('New session');
  const [blueprintId, setBlueprintId] = createSignal('');
  const [expertPackId, setExpertPackId] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [saveAsDefault, setSaveAsDefault] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    const defaults = sanitizeSessionSemantics(
      loadSessionSemanticsDefaults(),
      props.blueprints,
      props.expertPacks,
    );
    setBlueprintId(defaults.blueprintId);
    setExpertPackId(defaults.expertPackId);
    setTitle('New session');
    setSaveAsDefault(false);
  });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    };
    registerWindowKeydown(onKey, true);
  });

  const selection = (): SessionSemanticsSelection =>
    buildSessionSemanticsSelection(blueprintId(), expertPackId());
  const blueprintDescription = () =>
    selectedSessionSemanticDescription(props.blueprints, blueprintId());
  const expertPackDescription = () =>
    selectedSessionSemanticDescription(props.expertPacks, expertPackId());

  async function start() {
    if (busy()) return;
    setBusy(true);
    try {
      const next = selection();
      if (saveAsDefault()) saveSessionSemanticsDefaults(next);
      await props.onStart(next, title().trim() || 'New session');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Show when={props.open}>
      <div class="semantics__backdrop" onClick={props.onClose} />
      <div
        class="semantics"
        role="dialog"
        aria-modal="true"
        aria-label="Session semantics"
        ref={trapFocusRef}
        data-testid="session-semantics-modal"
      >
        <header class="semantics__head">
          <div>
            <span class="eyebrow">New session</span>
            <h2>Session semantics</h2>
          </div>
          <button
            type="button"
            class="cmp__close"
            onClick={props.onClose}
            aria-label="Close session semantics"
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div class="semantics__body">
          <label class="semantics__field">
            <span>Session name</span>
            <input
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              data-testid="session-semantics-title"
            />
          </label>

          <label class="semantics__field">
            <span>Agent blueprint</span>
            <select
              value={blueprintId()}
              onChange={(e) => setBlueprintId(e.currentTarget.value)}
              data-testid="session-semantics-blueprint"
            >
              <option value="">Default agent</option>
              <For each={props.blueprints}>{(bp) => <option value={bp.id}>{bp.label}</option>}</For>
            </select>
          </label>
          <Show when={blueprintDescription()}>
            {(desc) => <p class="semantics__desc">{desc()}</p>}
          </Show>

          <label class="semantics__field">
            <span>Expert pack</span>
            <select
              value={expertPackId()}
              onChange={(e) => setExpertPackId(e.currentTarget.value)}
              data-testid="session-semantics-expert-pack"
            >
              <option value="">No expert pack</option>
              <For each={props.expertPacks}>
                {(pack) => <option value={pack.id}>{pack.label}</option>}
              </For>
            </select>
          </label>
          <Show when={expertPackDescription()}>
            {(desc) => <p class="semantics__desc">{desc()}</p>}
          </Show>

          <label class="semantics__check">
            <input
              type="checkbox"
              checked={saveAsDefault()}
              onChange={(e) => setSaveAsDefault(e.currentTarget.checked)}
              data-testid="session-semantics-save-default"
            />
            <span>Use this for future sessions</span>
          </label>

          <Show when={props.loading}>
            <p class="semantics__desc">Refreshing available blueprints and packs…</p>
          </Show>
        </div>

        <footer class="semantics__foot">
          <button
            type="button"
            class="btn btn--secondary"
            onClick={props.onOpenSettings}
            data-testid="session-semantics-settings"
          >
            Manage blueprints
          </button>
          <button
            type="button"
            class="btn btn--primary"
            onClick={() => void start()}
            disabled={busy()}
            data-testid="session-semantics-start"
          >
            {busy() ? 'Starting…' : 'Start session'}
          </button>
        </footer>
      </div>
    </Show>
  );
}
