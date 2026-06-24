/**
 * Empty-state placeholder shown when no session/conversation is selected.
 * Exports {@link EmptyState}.
 */
import { For, Show } from 'solid-js';
import { brand } from '@brand';
import { Icon } from '../components/Icon.js';
import { platformMod } from './chatScreenUtils.js';

export function EmptyState(props: {
  hasSession: boolean;
  previewActive?: boolean;
  onPrompt: (text: string) => void;
}) {
  return (
    <div class={'chat__empty' + (props.previewActive ? ' chat__empty--preview' : '')}>
      <div class="chat__empty-icon">
        <Icon name={props.previewActive ? 'folder' : 'sparkle'} size={32} />
      </div>
      <h2 class="chat__empty-title">
        {props.previewActive
          ? 'Previewing workspace files'
          : props.hasSession
            ? 'Start the conversation'
            : 'Pick a session or start fresh'}
      </h2>
      <p class="chat__empty-body">
        {props.previewActive
          ? 'Use the file rail to inspect workspace artifacts. Ask about a file when you want the session to start.'
          : `${brand.name} is wired into your workspace — ask about your data, propose a change, or kick off a tool. Start with a question, a file, or a task.`}
      </p>
      <Show when={!props.previewActive}>
        <div class="chat__empty-prompts">
          <For each={brand.starterPrompts}>
            {(p) => (
              <button
                type="button"
                class="chat__empty-prompt"
                onClick={() => props.onPrompt(p.label)}
              >
                <div class="chat__empty-prompt-eyebrow">{p.eyebrow}</div>
                {p.label}
              </button>
            )}
          </For>
        </div>
        <p class="chat__empty-tip">
          Tip: press <kbd class="chat__empty-kbd">{platformMod()} + K</kbd> for the command palette,
          or <kbd class="chat__empty-kbd">{platformMod()} + /</kbd> for a keyboard shortcuts
          cheatsheet.
        </p>
      </Show>
    </div>
  );
}
