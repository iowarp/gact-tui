/**
 * Discovery surface: Blueprint Sections component. Key export `BlueprintInstallPanelProps`.
 */
import { Show } from 'solid-js';
import type { AgentBlueprintsResult } from '@clio/core';
import { Icon } from '../../components/Icon.js';

type BlueprintRow = AgentBlueprintsResult['blueprints'][number];

export interface BlueprintInstallPanelProps {
  pathText: string;
  refText: string;
  scope: 'workspace' | 'global';
  workspaceId?: string;
  busy: boolean;
  onPathText: (value: string) => void;
  onRefText: (value: string) => void;
  onScope: (value: 'workspace' | 'global') => void;
  onClose: () => void;
  onSubmit: (event: SubmitEvent) => void;
}

export function BlueprintInstallPanel(props: BlueprintInstallPanelProps) {
  return (
    <form class="rmp__install" onSubmit={props.onSubmit}>
      <label class="rmp__install-label" for="bp-install">
        Blueprint source
      </label>
      <input
        id="bp-install"
        class="rmp__editor"
        type="text"
        placeholder="src/clio_agent/agent_blueprints/builtin/data-exploration · or https://github.com/org/bp.git"
        value={props.pathText}
        onInput={(e) => props.onPathText(e.currentTarget.value)}
        data-testid="blueprint-install-input"
      />
      <label class="rmp__install-label" for="bp-install-ref">
        Ref
      </label>
      <input
        id="bp-install-ref"
        class="rmp__editor"
        type="text"
        placeholder="main, develop, tag, or commit (optional)"
        value={props.refText}
        onInput={(e) => props.onRefText(e.currentTarget.value)}
        data-testid="blueprint-install-ref"
      />
      <label class="rmp__install-label" for="bp-scope">
        Scope
      </label>
      <select
        id="bp-scope"
        class="rmp__editor"
        value={props.scope}
        onChange={(e) => props.onScope(e.currentTarget.value as 'workspace' | 'global')}
        data-testid="blueprint-install-scope"
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
          Cancel
        </button>
        <button
          type="submit"
          class="ws-form__btn ws-form__btn--primary"
          disabled={props.busy || !props.pathText.trim()}
          data-testid="blueprint-install-submit"
        >
          {props.busy ? 'Validating…' : 'Validate + install'}
        </button>
      </div>
    </form>
  );
}

export interface BlueprintCardProps {
  blueprint: BlueprintRow;
  onUninstall: (id: string, name: string, scope?: string) => void;
}

export function BlueprintCard(props: BlueprintCardProps) {
  const blueprint = () => props.blueprint;

  return (
    <article class="dp__card rmp__blueprint-card" data-testid={`blueprint-${blueprint().id}`}>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="agents" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{blueprint().name ?? blueprint().id}</h3>
            <div class="dp__card-sub">{blueprint().id}</div>
          </div>
        </div>
      </header>
      <Show when={blueprint().description}>
        <p class="dp__card-body">{blueprint().description}</p>
      </Show>
      <div class="dp__card-actions">
        <button
          type="button"
          class="dp__card-btn dp__card-btn--danger"
          onClick={() =>
            props.onUninstall(
              blueprint().id,
              blueprint().name ?? blueprint().id,
              (blueprint() as { scope?: string }).scope,
            )
          }
          data-testid={`blueprint-uninstall-${blueprint().id}`}
        >
          Uninstall
        </button>
      </div>
    </article>
  );
}
