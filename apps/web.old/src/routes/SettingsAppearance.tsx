/**
 * Appearance settings section: theme, density and locale preferences.
 * Exports {@link AppearanceSection}.
 */
import { createSignal } from 'solid-js';
import { brand } from '@brand';
import { Icon } from '../components/Icon.js';
import { loadLocale, saveLocale, type LocaleTag } from '../locale.js';
import { SettingsThemePanel } from './SettingsThemePanel.js';
import {
  DensityChoices,
  IntroSplashControls,
  LocaleChoices,
  NotificationPreferenceControls,
  PreferenceResetControls,
} from './SettingsAppearanceSections.js';
import {
  applyPresetTokens,
  applyThemeTokens,
  loadThemeMode,
  loadThemeTokens,
  setThemeMode,
  type ThemeMode,
} from '../theme.js';
import {
  appearanceStateForMode,
  appearanceStateForPreset,
  clearClioPreferences,
  loadActivePreset,
  loadIntroSplash,
  persistThemeMode,
  persistThemeTokens,
  saveIntroSplash,
  updateThemeToken,
} from './SettingsAppearanceModel.js';

export function AppearanceSection() {
  const [theme, setTheme] = createSignal<ThemeMode>(loadThemeMode());
  const [density, setDensity] = createSignal<'verbose' | 'normal' | 'summary'>('normal');
  const [tokens, setTokens] = createSignal<Record<string, string>>(loadThemeTokens());
  const [locale, setLocale] = createSignal<LocaleTag>(loadLocale());
  const [intro, setIntro] = createSignal<string>(loadIntroSplash());

  function changeIntro(v: string) {
    setIntro(v);
    saveIntroSplash(v);
  }

  function changeLocale(next: LocaleTag) {
    setLocale(next);
    saveLocale(next);
  }

  function updateToken(key: string, value: string) {
    const next = updateThemeToken(tokens(), key, value);
    setTokens(next);
    persistThemeTokens(next);
    applyThemeTokens(next);
  }

  function resetTokens() {
    const state = appearanceStateForMode(theme());
    setActivePreset(state.presetId);
    setTokens(state.tokens);
    persistThemeTokens(state.tokens);
    applyThemeTokens(state.tokens);
  }

  const [activePreset, setActivePreset] = createSignal<string>(loadActivePreset());

  function applyPreset(id: string) {
    const state = appearanceStateForPreset(id);
    if (!state) return;
    setActivePreset(state.presetId);
    setTokens(state.tokens);
    applyPresetTokens(state.presetId);
    setTheme(state.mode);
    persistThemeMode(state.mode);
  }

  function changeThemeMode(next: ThemeMode) {
    setTheme(next);
    setThemeMode(next);
    const state = appearanceStateForMode(next);
    setActivePreset(state.presetId);
    setTokens(state.tokens);
  }

  function resetPreferences() {
    if (typeof localStorage === 'undefined') return;
    if (!confirm(`Clear all local ${brand.name} preferences? This cannot be undone.`)) return;
    clearClioPreferences(localStorage);
    alert('Local preferences cleared. Reloading…');
    window.location.reload();
  }

  return (
    <section class="dp" data-testid="settings-appearance">
      <header class="dp__head">
        <div class="dp__title-block">
          <div class="dp__icon">
            <Icon name="palette" size={20} />
          </div>
          <div>
            <h1 class="dp__title">Appearance</h1>
            <p class="dp__subtitle">Theme, density, and visual chrome.</p>
          </div>
        </div>
      </header>
      <div class="dp__body">
        <SettingsThemePanel
          theme={theme}
          activePreset={activePreset}
          tokens={tokens}
          onChangeTheme={changeThemeMode}
          onApplyPreset={applyPreset}
          onUpdateToken={updateToken}
          onResetTokens={resetTokens}
        />

        <NotificationPreferenceControls />
        <LocaleChoices locale={locale} onChangeLocale={changeLocale} />
        <DensityChoices density={density} onChangeDensity={setDensity} />
        <IntroSplashControls intro={intro} onChangeIntro={changeIntro} />
        <PreferenceResetControls onResetPreferences={resetPreferences} />
      </div>
    </section>
  );
}
