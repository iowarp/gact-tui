/**
 * Discovery surface: Prompt Card Preview component. Key export `PromptCardPreviewProps`.
 */
import { Show } from 'solid-js';
import type { PromptDef } from '@clio/core';
import type { PromptScopeContext } from './PromptScope.js';

export interface PromptCardPreviewProps {
  prompt: PromptDef;
  clientPresent: boolean;
  context?: PromptScopeContext;
  preview: string | null;
  previewError: string | null;
  loading: boolean;
  draft: string;
  scope: 'global' | 'workspace' | 'session';
  saving: boolean;
  validating: boolean;
  result: { ok: boolean; msg: string } | null;
  onDraft: (value: string) => void;
  onScope: (value: 'global' | 'workspace' | 'session') => void;
  onValidate: () => void;
  onSave: () => void;
}

export function PromptCardPreview(props: PromptCardPreviewProps) {
  return (
    <div class="prompts__preview" onClick={(e) => e.stopPropagation()}>
      <div class="prompts__preview-label">
        Default profile{' '}
        <Show when={props.prompt.default_profile}>
          <span>(<code>{props.prompt.default_profile}</code>)</span>
        </Show>
      </div>
      <Show when={props.loading}>
        <div class="prompts__preview-loading">Loading…</div>
      </Show>
      <Show when={props.previewError}>
        <div class="prompts__preview-error">{props.previewError}</div>
      </Show>
      <Show when={props.preview != null && !props.loading && !props.previewError}>
        <Show
          when={props.clientPresent}
          fallback={<pre class="prompts__preview-body">{props.preview}</pre>}
        >
          <textarea
            class="rmp__editor prompts__edit"
            value={props.draft}
            onInput={(e) => props.onDraft(e.currentTarget.value)}
            rows={7}
            data-testid="prompt-edit-text"
          />
          <div class="prompts__edit-actions">
            <select
              class="rmp__form-select"
              value={props.scope}
              onChange={(e) =>
                props.onScope(e.currentTarget.value as 'global' | 'workspace' | 'session')
              }
              data-testid="prompt-save-scope"
            >
              <option value="global">global</option>
              <option value="workspace" disabled={!props.context?.workspaceId}>
                workspace
              </option>
              <option value="session" disabled={!props.context?.sessionId}>
                session
              </option>
            </select>
            <button
              type="button"
              class="ws-form__btn"
              onClick={props.onValidate}
              disabled={props.validating || props.saving}
              data-testid="prompt-validate"
            >
              {props.validating ? 'Validating…' : 'Validate'}
            </button>
            <button
              type="button"
              class="ws-form__btn ws-form__btn--primary"
              onClick={props.onSave}
              disabled={props.saving || props.validating}
              data-testid="prompt-save"
            >
              {props.saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <Show when={props.result}>
            <p
              class={'rmp__form-err ' + (props.result!.ok ? 'rmp__form-ok' : '')}
              data-testid="prompt-save-result"
            >
              {props.result!.ok ? '✓ ' : '✗ '}
              {props.result!.msg}
            </p>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
