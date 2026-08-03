/**
 * Builds the grouped sections (models, providers, actions) shown inside the
 * transcript regenerate menu.
 */
import { For, Show } from 'solid-js';
import type { Message } from '@clio/core';
import type { ModelOption } from './ComposerTypes.js';
import { Icon } from './Icon.js';

export type RegenMenuMode = 'menu' | 'notes' | 'models';

export function RegenMenuChoices(props: {
  msg: Message;
  canUseNotes: boolean;
  canUseModels: boolean;
  onPlain: () => void;
  onNotes: () => void;
  onModels: () => void;
}) {
  return (
    <>
      <button
        type="button"
        class="trx-regen__item"
        role="menuitem"
        data-testid={`regen-plain-${props.msg.id}`}
        onClick={props.onPlain}
      >
        <Icon name="regenerate" size={12} />
        <span>Regenerate</span>
      </button>
      <Show when={props.canUseNotes}>
        <button
          type="button"
          class="trx-regen__item"
          role="menuitem"
          data-testid={`regen-notes-${props.msg.id}`}
          onClick={props.onNotes}
        >
          <Icon name="edit" size={12} />
          <span>Regenerate with notes…</span>
        </button>
      </Show>
      <Show when={props.canUseModels}>
        <button
          type="button"
          class="trx-regen__item"
          role="menuitem"
          data-testid={`regen-model-${props.msg.id}`}
          onClick={props.onModels}
        >
          <Icon name="bot" size={12} />
          <span>Regenerate with model</span>
          <Icon name="chevron-right" size={10} />
        </button>
      </Show>
    </>
  );
}

export function RegenNotesForm(props: {
  msg: Message;
  notes: string;
  onNotes: (notes: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div class="trx-regen__notes">
      <textarea
        class="trx-regen__textarea"
        rows={3}
        placeholder="Guidance for the retry — e.g. “shorter”, “use Python”, “cite sources”"
        value={props.notes}
        data-testid={`regen-notes-input-${props.msg.id}`}
        onInput={(e) => props.onNotes(e.currentTarget.value)}
      />
      <div class="trx-regen__row">
        <button type="button" class="trx-regen__btn" onClick={props.onBack}>
          Back
        </button>
        <button
          type="button"
          class="trx-regen__btn trx-regen__btn--primary"
          data-testid={`regen-notes-submit-${props.msg.id}`}
          disabled={!props.notes.trim()}
          onClick={props.onSubmit}
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}

export function RegenModelChoices(props: {
  msg: Message;
  models: readonly ModelOption[];
  onBack: () => void;
  onPick: (model: ModelOption) => void;
}) {
  return (
    <div class="trx-regen__models">
      <button
        type="button"
        class="trx-regen__item trx-regen__item--back"
        onClick={props.onBack}
      >
        ← Back
      </button>
      <For each={props.models}>
        {(m) => (
          <button
            type="button"
            class="trx-regen__item"
            role="menuitem"
            data-testid={`regen-pick-${m.id}-${props.msg.id}`}
            onClick={() => props.onPick(m)}
          >
            <span class="trx-regen__model-id">{m.modelId}</span>
            <span class="trx-regen__model-provider">{m.providerLabel}</span>
          </button>
        )}
      </For>
    </div>
  );
}
