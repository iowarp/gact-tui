import { createMemo, createSignal, Show, type JSX } from 'solid-js';
import { Icon } from './Icon.js';
import { AtMentionPicker, DEFAULT_ITEMS, type MentionItem } from './AtMentionPicker.js';
import { Dropdown, type DropdownItem } from './Dropdown.js';
import './composer.css';

export type PermissionMode = 'ask' | 'auto-edits' | 'plan' | 'auto' | 'bypass';

const PERM_DESCRIPTIONS: Record<PermissionMode, string> = {
  ask: 'Prompt me before every tool call',
  'auto-edits': 'Auto-approve safe file edits; ask for the rest',
  plan: 'Read-only — plan changes, never apply',
  auto: 'Auto-approve every action (use with care)',
  bypass: 'Skip permissions entirely',
};

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

  /** Live model options pulled from /v1/providers. */
  models?: ModelOption[];
  /** Currently-selected model id. */
  selectedModelId?: string;
  onPickModel?: (m: ModelOption) => void | Promise<void>;

  /** Selected permission mode. */
  permMode?: PermissionMode;
  onPickPermMode?: (m: PermissionMode) => void | Promise<void>;
}

export function Composer(props: ComposerProps = {}) {
  const [text, setText] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [mentionHighlight, setMentionHighlight] = createSignal(0);

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

  async function submit() {
    const t = text().trim();
    if (!t || busy() || props.disabled) return;
    setError(null);
    if (!props.onSubmit) {
      setText('');
      return;
    }
    setBusy(true);
    setText('');
    try {
      await props.onSubmit(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setText(t);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="composer" data-testid="composer">
      <Show when={error()}>
        <div class="composer__error" data-testid="composer-error">
          {error()}
        </div>
      </Show>

      <div class="composer__shell">
        <div class="composer__row">
          <button
            type="button"
            class="composer__attach"
            title="Attach files (drop or paste)"
            aria-label="Attach files"
          >
            <Icon name="attach" size={16} />
          </button>
          <div class="composer__input-wrap">
            <textarea
              class="composer__input"
              placeholder="Ask CLIO anything — type @ for files, agents, tools"
              rows={1}
              value={text()}
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
              class="composer__send composer__send--stop"
              data-testid="composer-stop"
              onClick={() => void props.onStop?.()}
              aria-label="Stop generation"
              title="Stop generation"
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
        <span class="composer__kbd">Ctrl + K</span> palette
      </div>
    </div>
  );
}
