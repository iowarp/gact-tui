/**
 * Theme-selection panel for the appearance settings. Exports
 * {@link SettingsThemePanel}.
 */
import { For, Show, type Accessor } from 'solid-js';
import { Icon } from '../components/Icon.js';
import { SectionHeading } from '../components/SettingsPrimitives.js';
import { THEME_PRESETS, type ThemeMode } from '../theme.js';

const ACCENT_TOKENS = [
  { key: '--color-accent', label: 'Accent (orange)', defaultColor: '#ea7b2a' },
  { key: '--color-accent-cyan', label: 'Accent (cyan)', defaultColor: '#00d4db' },
  { key: '--color-success', label: 'Success', defaultColor: '#34d399' },
  { key: '--color-warning', label: 'Warning', defaultColor: '#fbbf24' },
  { key: '--color-error', label: 'Error', defaultColor: '#f87171' },
] as const;

export function SettingsThemePanel(props: {
  theme: Accessor<ThemeMode>;
  activePreset: Accessor<string>;
  tokens: Accessor<Record<string, string>>;
  onChangeTheme: (mode: ThemeMode) => void;
  onApplyPreset: (id: string) => void;
  onUpdateToken: (key: string, value: string) => void;
  onResetTokens: () => void;
}) {
  return (
    <>
      <SectionHeading
        title="Theme"
        hint="Choose a fixed palette or follow the operating system."
      />
      <div class="settings-shell__choices">
        <For each={['dark', 'light', 'auto'] as const}>
          {(t) => (
            <button
              type="button"
              class={'settings-shell__choice ' + (props.theme() === t ? 'is-active' : '')}
              onClick={() => props.onChangeTheme(t)}
              data-testid={`settings-theme-${t}`}
            >
              <span class={`settings-shell__choice-swatch swatch--${t}`} />
              <span class="settings-shell__choice-label">{t}</span>
            </button>
          )}
        </For>
      </div>

      <SectionHeading
        title="Presets"
        hint="Apply a full palette, then fine-tune individual colors below."
      />
      <div class="settings-shell__choices" data-testid="settings-theme-presets">
        <For each={Object.entries(THEME_PRESETS)}>
          {([id, preset]) => (
            <button
              type="button"
              class={'settings-shell__choice ' + (props.activePreset() === id ? 'is-active' : '')}
              onClick={() => props.onApplyPreset(id)}
              data-testid={`settings-preset-${id}`}
            >
              <span
                class="settings-shell__choice-swatch"
                style={{
                  background: preset.tokens['--color-bg'] ?? '#0d1320',
                  border: `2px solid ${preset.tokens['--color-heading'] ?? '#e8ecf4'}`,
                }}
              />
              <span class="settings-shell__choice-label">{preset.label}</span>
            </button>
          )}
        </For>
      </div>

      <SectionHeading
        title="Accent palette"
        hint="Local color overrides applied on every reload."
      />
      <div class="theme-tokens">
        <For each={ACCENT_TOKENS}>
          {(t) => {
            const current = () => props.tokens()[t.key] ?? t.defaultColor;
            return (
              <label class="theme-token">
                <span class="theme-token__label">{t.label}</span>
                <input
                  type="color"
                  class="theme-token__picker"
                  value={current()}
                  onInput={(e) => props.onUpdateToken(t.key, e.currentTarget.value)}
                  data-testid={`theme-token-${t.key}`}
                />
                <code class="theme-token__hex">{current()}</code>
                <Show when={props.tokens()[t.key]}>
                  <button
                    type="button"
                    class="theme-token__reset"
                    onClick={() => props.onUpdateToken(t.key, '')}
                    title="Reset to design-system default"
                  >
                    <Icon name="close" size={10} />
                  </button>
                </Show>
              </label>
            );
          }}
        </For>
      </div>
      <Show when={Object.keys(props.tokens()).length > 0}>
        <button
          type="button"
          class="ws-form__btn"
          style="margin-top: 8px"
          onClick={props.onResetTokens}
          data-testid="theme-tokens-reset-all"
        >
          Reset palette to design-system defaults
        </button>
      </Show>
    </>
  );
}
