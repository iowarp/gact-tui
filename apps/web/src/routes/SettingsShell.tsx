/**
 * Settings shell: nav + content frame hosting the settings sections.
 * Exports {@link SettingsShell}.
 */
import { createEffect, createSignal, Show, onMount } from 'solid-js';
import { brand } from '@brand';
import { Icon } from '../components/Icon.js';
import { registerWindowKeydown } from '../domListeners.js';
import { useBackendRegistry } from '../registry.js';
import { createSettingsShellController } from './settingsShellController.js';
import { SettingsShellContent } from './SettingsShellContent.js';
import { SettingsShellNav } from './SettingsShellNav.js';
import { clearSectionParam, readSectionParam, writeSectionParam } from './settings-deeplink.js';
import type { SettingsSection } from './settingsSections.js';
import './settings.css';
import './settings-shell.css';

export type { SettingsSection } from './settingsSections.js';
export { SessionDefaultsSection } from './SettingsSessionDefaults.js';

export interface SettingsShellProps {
  onAddRemote: () => void;
  onBack: () => void;
  /** Initial section to land on (e.g. when arrived via a deep link). */
  initial?: SettingsSection;
  context?: SettingsContext;
}

export interface SettingsContext {
  sessionId?: string;
  workspaceId?: string;
}

export function SettingsShell(props: SettingsShellProps) {
  // Initial section precedence: an explicit prop (e.g. a palette deep-link)
  // wins, then the ?section= URL param (so a refresh re-opens the same panel),
  // then the default. Total deep-linking (task B2 §1).
  const [section, setSection] = createSignal<SettingsSection>(
    props.initial ?? readSectionParam() ?? 'backends',
  );

  // Keep the URL in sync with the active panel so a refresh lands here and
  // "copy link" points at this exact section.
  createEffect(() => {
    writeSectionParam(section());
  });

  function back() {
    clearSectionParam();
    props.onBack();
  }

  // Esc returns to chat — matches the behavior of every other overlay
  // in the chrome.
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        back();
      }
    };
    registerWindowKeydown(onKey, true);
  });
  // Lazy-construct a Client pointed at the current backend so the
  // discovery-style sections (Workspaces / Agents / etc.) work inside
  // Settings without us re-plumbing a separate client per section.
  const { client } = createSettingsShellController(useBackendRegistry());

  return (
    <div class="settings-shell" data-testid="settings-shell">
      <header class="settings-shell__top">
        <button
          type="button"
          class="settings-shell__back"
          onClick={back}
          data-testid="settings-back"
        >
          <Icon name="chevron-right" size={14} class="settings-shell__back-icon" />
          <span>Back to {brand.name}</span>
        </button>
        <h1 class="settings-shell__title">Settings</h1>
        <div class="settings-shell__actions">
          <Show when={section() === 'backends'}>
            <button
              type="button"
              class="btn btn--primary"
              onClick={props.onAddRemote}
              data-testid="settings-add-remote"
            >
              Add remote
            </button>
          </Show>
        </div>
      </header>
      <div class="settings-shell__body">
        <SettingsShellNav activeSection={section()} onPickSection={setSection} />
        <SettingsShellContent
          section={section()}
          client={client()}
          context={props.context}
          onAddRemote={props.onAddRemote}
          onBack={back}
        />
      </div>
    </div>
  );
}
