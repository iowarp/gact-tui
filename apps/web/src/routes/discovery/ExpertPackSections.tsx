/**
 * Discovery surface: Expert Pack Sections component. Key export `ExpertPackInstallPanelProps`.
 */
import { Show } from 'solid-js';
import type { ExpertPacksResult } from '@clio/core';
import { Icon } from '../../components/Icon.js';

type ExpertPackRow = ExpertPacksResult['packs'][number];

export interface ExpertPackInstallPanelProps {
  sourceText: string;
  scope: 'workspace' | 'global';
  workspaceId?: string;
  busy: boolean;
  onSourceText: (value: string) => void;
  onScope: (value: 'workspace' | 'global') => void;
  onClose: () => void;
  onValidate: () => void;
  onSubmit: (event: SubmitEvent) => void;
}

export function ExpertPackInstallPanel(props: ExpertPackInstallPanelProps) {
  return (
    <form class="rmp__install" onSubmit={props.onSubmit}>
      <label class="rmp__install-label" for="ep-validate">
        Expert pack source
      </label>
      <input
        id="ep-validate"
        class="rmp__editor"
        type="text"
        placeholder="local path, git URL, archive URL, or marketplace source"
        value={props.sourceText}
        onInput={(e) => props.onSourceText(e.currentTarget.value)}
        data-testid="expertpack-validate-input"
      />
      <label class="rmp__install-label" for="ep-scope">
        Scope
      </label>
      <select
        id="ep-scope"
        class="rmp__editor"
        value={props.scope}
        onChange={(e) => props.onScope(e.currentTarget.value as 'workspace' | 'global')}
        data-testid="expertpack-validate-scope"
      >
        <option value="workspace" disabled={!props.workspaceId}>
          workspace
        </option>
        <option value="global">global</option>
      </select>
      <div class="rmp__editor-actions">
        <button
          type="button"
          class="ws-form__btn"
          onClick={props.onClose}
          disabled={props.busy}
        >
          Close
        </button>
        <button
          type="button"
          class="ws-form__btn"
          onClick={props.onValidate}
          disabled={props.busy || !props.sourceText.trim()}
          data-testid="expertpack-validate-submit"
        >
          {props.busy ? 'Working...' : 'Validate'}
        </button>
        <button
          type="submit"
          class="ws-form__btn ws-form__btn--primary"
          disabled={props.busy || !props.sourceText.trim()}
          data-testid="expertpack-install-submit"
        >
          {props.busy ? 'Working...' : 'Install'}
        </button>
      </div>
    </form>
  );
}

export interface ExpertPackCardProps {
  pack: ExpertPackRow;
  busy: boolean;
  onUpdate: (packId: string) => void;
  onDelete: (packId: string) => void;
}

export function ExpertPackCard(props: ExpertPackCardProps) {
  const pack = () => props.pack;

  return (
    <article class="dp__card rmp__pack-card" data-testid={`expertpack-${pack().id}`}>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="sparkle" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{pack().name ?? pack().id}</h3>
            <div class="dp__card-sub">{pack().id}</div>
          </div>
        </div>
        <Show when={pack().runtime_scope}>
          <span class="dp__tag">{pack().runtime_scope}</span>
        </Show>
        <Show when={pack().kind}>
          <span class="dp__tag">{pack().kind}</span>
        </Show>
        <Show when={pack().scope}>
          <span class="dp__tag">{pack().scope}</span>
        </Show>
      </header>
      <Show when={pack().description}>
        <p class="dp__card-body">{pack().description}</p>
      </Show>
      <div class="rmp__editor-actions">
        <button
          type="button"
          class="ws-form__btn"
          onClick={() => props.onUpdate(pack().id)}
          disabled={props.busy}
          data-testid={`expertpack-update-${pack().id}`}
        >
          Update
        </button>
        <button
          type="button"
          class="ws-form__btn"
          onClick={() => props.onDelete(pack().id)}
          disabled={props.busy}
          data-testid={`expertpack-delete-${pack().id}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
