/**
 * Reusable appearance controls (notification prefs, locale, density choices)
 * composed into the appearance settings section.
 */
import { For, Show, type Accessor } from 'solid-js';
import { brand } from '@brand';
import { DEFAULT_LOCALE, LOCALES, type LocaleTag } from '../locale.js';
import { notifPrefs, setNotifPref } from '../notif-prefs.js';
import { SectionHeading } from '../components/SettingsPrimitives.js';

export interface LocaleChoicesProps {
  locale: Accessor<LocaleTag>;
  onChangeLocale: (locale: LocaleTag) => void;
}

export interface DensityChoicesProps {
  density: Accessor<'verbose' | 'normal' | 'summary'>;
  onChangeDensity: (density: 'verbose' | 'normal' | 'summary') => void;
}

export interface IntroSplashControlsProps {
  intro: Accessor<string>;
  onChangeIntro: (value: string) => void;
}

export interface PreferenceResetControlsProps {
  onResetPreferences: () => void;
}

export function NotificationPreferenceControls() {
  const prefs = notifPrefs;

  return (
    <>
      <SectionHeading title="Notifications" hint="Choose which non-error events surface as toasts." />
      <div class="settings-shell__toggles" data-testid="settings-notif-prefs">
        <label class="settings-shell__toggle">
          <input
            type="checkbox"
            checked={prefs().turnCompletions}
            onChange={(event) => setNotifPref('turnCompletions', event.currentTarget.checked)}
            data-testid="notif-pref-turn-completions"
          />
          <span>Turn completions — “{brand.name} responded” after each finished turn</span>
        </label>
        <label class="settings-shell__toggle">
          <input
            type="checkbox"
            checked={prefs().connectionStatus}
            onChange={(event) => setNotifPref('connectionStatus', event.currentTarget.checked)}
            data-testid="notif-pref-connection-status"
          />
          <span>Connection status — SSE disconnect / reconnect notices</span>
        </label>
      </div>
    </>
  );
}

export function LocaleChoices(props: LocaleChoicesProps) {
  return (
    <>
      <SectionHeading title="Locale" hint="Forwarded to the backend as Accept-Language." />
      <div class="settings-shell__choices" data-testid="settings-locale-choices">
        <For each={LOCALES}>
          {(locale) => (
            <button
              type="button"
              class={'settings-shell__choice ' + (props.locale() === locale.tag ? 'is-active' : '')}
              onClick={() => props.onChangeLocale(locale.tag)}
              data-testid={`settings-locale-${locale.tag}`}
            >
              <span class="settings-shell__choice-label">{locale.nativeLabel}</span>
              <span class="settings-shell__choice-sub">{locale.label}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={props.locale() !== DEFAULT_LOCALE}>
        <button
          type="button"
          class="ws-form__btn"
          style="margin-top: 8px"
          onClick={() => props.onChangeLocale(DEFAULT_LOCALE)}
          data-testid="settings-locale-reset"
        >
          Reset to English
        </button>
      </Show>
    </>
  );
}

export function DensityChoices(props: DensityChoicesProps) {
  return (
    <>
      <SectionHeading title="Default transcript density" />
      <div class="settings-shell__choices">
        <For each={['verbose', 'normal', 'summary'] as const}>
          {(density) => (
            <button
              type="button"
              class={'settings-shell__choice ' + (props.density() === density ? 'is-active' : '')}
              onClick={() => props.onChangeDensity(density)}
              data-testid={`settings-density-${density}`}
            >
              <span class="settings-shell__choice-label">{density}</span>
            </button>
          )}
        </For>
      </div>
      <p class="settings-shell__hint">
        The chat shell remembers your density per session (Ctrl + O cycles). The default applies to
        new sessions.
      </p>
    </>
  );
}

export function IntroSplashControls(props: IntroSplashControlsProps) {
  return (
    <>
      <SectionHeading title="Custom intro splash" hint={`Plain text shown while ${brand.name} boots.`} />
      <textarea
        class="settings-shell__intro"
        placeholder="e.g. ASCII art, motto, deploy tag, etc."
        rows={5}
        value={props.intro()}
        onInput={(event) => props.onChangeIntro(event.currentTarget.value)}
        data-testid="settings-intro-textarea"
      />
      <Show when={props.intro()}>
        <button
          type="button"
          class="ws-form__btn"
          style="margin-top: 8px"
          onClick={() => props.onChangeIntro('')}
          data-testid="settings-intro-clear"
        >
          Clear intro
        </button>
      </Show>
    </>
  );
}

export function PreferenceResetControls(props: PreferenceResetControlsProps) {
  return (
    <>
      <SectionHeading
        title="Reset"
        hint={`Clears local ${brand.name} preferences. Backend credentials stay in the registry.`}
      />
      <button
        type="button"
        class="ws-form__btn ws-form__btn--primary"
        style="margin-top: 8px"
        onClick={props.onResetPreferences}
        data-testid="settings-reset-prefs"
      >
        Reset all preferences
      </button>
    </>
  );
}
