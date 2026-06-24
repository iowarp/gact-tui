/**
 * Discovery surface: Prompt Card Summary component. Key export `promptProfileCount`.
 */
import { For, Show } from 'solid-js';
import type { PromptDef } from '@clio/core';
import { Icon } from '../../components/Icon.js';

export function promptProfileCount(prompt: PromptDef): number {
  const profiles = prompt.profiles;
  if (!profiles) return 0;
  return Object.keys(profiles).length;
}

export function promptHasValidationErrors(prompt: PromptDef): boolean {
  return (prompt.validation_errors ?? []).length > 0;
}

export function PromptCardSummary(props: { prompt: PromptDef }) {
  return (
    <>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="sparkle" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.prompt.title || props.prompt.id}</h3>
            <div class="dp__card-sub">{props.prompt.id}</div>
          </div>
        </div>
        <Show when={props.prompt.scope}>
          <span class={'dp__tag prompts__scope--' + props.prompt.scope}>
            {props.prompt.scope}
          </span>
        </Show>
      </header>
      <Show when={props.prompt.description}>
        <p class="dp__card-body">{props.prompt.description}</p>
      </Show>
      <dl class="dp__card-kv">
        <Show when={props.prompt.default_profile}>
          <dt>default</dt>
          <dd>{props.prompt.default_profile}</dd>
        </Show>
        <Show when={promptProfileCount(props.prompt) > 0}>
          <dt>profiles</dt>
          <dd>{promptProfileCount(props.prompt)}</dd>
        </Show>
        <Show when={props.prompt.source_path}>
          <dt>source</dt>
          <dd title={props.prompt.source_path}>{props.prompt.source_path}</dd>
        </Show>
        <Show when={props.prompt.enabled === false}>
          <dt>state</dt>
          <dd>
            <span class="dp__tag dp__tag--warn">disabled</span>
          </dd>
        </Show>
      </dl>
      <Show when={promptHasValidationErrors(props.prompt)}>
        <div class="prompts__errors" data-testid={`prompt-errors-${props.prompt.id}`}>
          <Icon name="alert" size={12} />
          <span>
            {props.prompt.validation_errors!.length} validation error
            {props.prompt.validation_errors!.length === 1 ? '' : 's'}
          </span>
          <ul class="prompts__errors-list">
            <For each={props.prompt.validation_errors!.slice(0, 3)}>
              {(err) => <li>{err}</li>}
            </For>
          </ul>
        </div>
      </Show>
    </>
  );
}
