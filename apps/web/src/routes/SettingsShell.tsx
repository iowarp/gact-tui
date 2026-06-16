import { createEffect, createSignal, For, Match, Show, Switch, onCleanup, onMount } from 'solid-js';
import { brand } from '@brand';
import { Icon, type IconName } from '../components/Icon.js';
import { Client } from '@clio/core';
import { DEFAULT_LOCALE, LOCALES, loadLocale, saveLocale, getRequestLocale, type LocaleTag } from '../locale.js';
import { SPLASH_INTRO_KEY } from './SplashScreen.js';
import { notifPrefs, setNotifPref } from '../notif-prefs.js';
import { downloadSettings, importSettings } from '../settings-export.js';
import {
  THEME_MODE_KEY,
  THEME_PRESETS,
  THEME_PRESET_KEY,
  THEME_TOKENS_KEY,
  applyPresetTokens,
  applyThemeTokens,
  loadThemeMode,
  loadThemeTokens,
  setThemeMode,
  type ThemeMode,
} from '../theme.js';
import { useToast } from '../components/Toast.js';
import {
  EmptyState,
  Pill,
  SectionHeading,
} from '../components/SettingsPrimitives.js';
import { inTauri, tauriFetch } from '../tauri.js';
import { useBackendRegistry } from '../registry.js';
import { SettingsBackends } from './SettingsBackends.js';
import { SettingsModels } from './SettingsModels.js';
import {
  clearSectionParam,
  readSectionParam,
  writeSectionParam,
} from './settings-deeplink.js';
import {
  AgentsPage,
  BlueprintsPage,
  ExpertPacksPage,
  HooksPage,
  McpPage,
  MemoryPage,
  MetricsPage,
  PoliciesPage,
  PromptsPage,
  ProvidersPage,
  ToolsPage,
  WorkspacesPage,
  DoctorPage,
} from './discovery/index.js';
import './settings.css';
import './settings-shell.css';

export type SettingsSection =
  | 'backends'
  | 'workspaces'
  | 'models'
  | 'providers'
  | 'agents'
  | 'tools'
  | 'prompts'
  | 'blueprints'
  | 'expert-packs'
  | 'hooks'
  | 'policies'
  | 'mcp'
  | 'memory'
  | 'metrics'
  | 'doctor'
  | 'appearance'
  | 'data'
  | 'about';

interface SectionDef {
  id: SettingsSection;
  label: string;
  icon: IconName;
  group: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'backends', label: 'Backends', icon: 'mcp', group: 'Connection' },
  { id: 'workspaces', label: 'Workspaces', icon: 'workspaces', group: 'Connection' },
  { id: 'models', label: 'Models', icon: 'sparkle', group: 'Agents' },
  { id: 'providers', label: 'Providers (advanced)', icon: 'plug', group: 'Agents' },
  { id: 'agents', label: 'Agents', icon: 'agents', group: 'Agents' },
  { id: 'tools', label: 'Commands', icon: 'tool', group: 'Agents' },
  { id: 'prompts', label: 'Prompts', icon: 'book', group: 'Agents' },
  { id: 'blueprints', label: 'Agent blueprints', icon: 'catalog', group: 'Agents' },
  { id: 'expert-packs', label: 'Expert packs', icon: 'sparkle', group: 'Agents' },
  { id: 'mcp', label: 'MCP servers', icon: 'mcp', group: 'Agents' },
  { id: 'hooks', label: 'Hooks', icon: 'tool', group: 'Telemetry' },
  { id: 'policies', label: 'Policies', icon: 'shield', group: 'Telemetry' },
  { id: 'memory', label: 'Memory', icon: 'memory', group: 'Telemetry' },
  { id: 'metrics', label: 'Metrics', icon: 'metrics', group: 'Telemetry' },
  { id: 'doctor', label: 'Doctor', icon: 'doctor', group: 'Telemetry' },
  { id: 'appearance', label: 'Appearance', icon: 'palette', group: 'App' },
  { id: 'data', label: 'Data & backups', icon: 'share', group: 'App' },
  { id: 'about', label: 'About', icon: 'help', group: 'App' },
];

export interface SettingsShellProps {
  onAddRemote: () => void;
  onBack: () => void;
  /** Initial section to land on (e.g. when arrived via a deep link). */
  initial?: SettingsSection;
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
    window.addEventListener('keydown', onKey, true);
    onCleanup(() => window.removeEventListener('keydown', onKey, true));
  });
  const reg = useBackendRegistry();

  // Lazy-construct a Client pointed at the current backend so the
  // discovery-style sections (Workspaces / Agents / etc.) work inside
  // Settings without us re-plumbing a separate client per section.
  const client = () => {
    const cur = reg.current();
    if (!cur) return null;
    return new Client({
      baseUrl: cur.url,
      bearerToken: cur.bearerToken,
      fetch: inTauri() ? tauriFetch : undefined,
      getLocale: getRequestLocale,
    });
  };

  // Group sections by `group` field, preserving declaration order.
  const grouped = () => {
    const out: { group: string; items: SectionDef[] }[] = [];
    for (const s of SECTIONS) {
      let g = out.find((g) => g.group === s.group);
      if (!g) {
        g = { group: s.group, items: [] };
        out.push(g);
      }
      g.items.push(s);
    }
    return out;
  };

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
        <div />
      </header>
      <div class="settings-shell__body">
        <nav class="settings-shell__nav" aria-label="Settings sections">
          <For each={grouped()}>
            {(g) => (
              <>
                <div class="settings-shell__nav-group">{g.group}</div>
                <For each={g.items}>
                  {(s) => (
                    <button
                      type="button"
                      class={
                        'settings-shell__nav-btn ' +
                        (s.id === section() ? 'is-active' : '')
                      }
                      onClick={(e) => {
                        setSection(s.id);
                        // Drop focus so the just-clicked item doesn't retain a
                        // gray focus background that reads like a second active
                        // item (only the cyan .is-active state should persist).
                        e.currentTarget.blur();
                      }}
                      data-testid={`settings-nav-${s.id}`}
                    >
                      <Icon name={s.icon} size={14} />
                      <span>{s.label}</span>
                    </button>
                  )}
                </For>
              </>
            )}
          </For>
        </nav>
        <main class="settings-shell__content">
          <Switch>
            <Match when={section() === 'backends'}>
              <SettingsBackends
                onAddRemote={props.onAddRemote}
                onBack={back}
              />
            </Match>
            <Match when={client() && section() === 'workspaces'}>
              <WorkspacesPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'models'}>
              <SettingsModels client={client()!} />
            </Match>
            <Match when={client() && section() === 'providers'}>
              <ProvidersPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'agents'}>
              <AgentsPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'tools'}>
              <ToolsPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'prompts'}>
              <PromptsPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'blueprints'}>
              <BlueprintsPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'expert-packs'}>
              <ExpertPacksPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'hooks'}>
              <HooksPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'policies'}>
              <PoliciesPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'mcp'}>
              <McpPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'memory'}>
              <MemoryPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'metrics'}>
              <MetricsPage client={client()!} />
            </Match>
            <Match when={client() && section() === 'doctor'}>
              <DoctorPage client={client()!} />
            </Match>
            <Match when={section() === 'appearance'}>
              <AppearanceSection />
            </Match>
            <Match when={section() === 'data'}>
              <DataSection />
            </Match>
            <Match when={section() === 'about'}>
              <AboutSection />
            </Match>
            <Match when={!client() && section() !== 'backends'}>
              <NoBackend />
            </Match>
          </Switch>
        </main>
      </div>
    </div>
  );
}

const ACCENT_TOKENS = [
  { key: '--color-accent', label: 'Accent (orange)', defaultColor: '#ea7b2a' },
  { key: '--color-accent-cyan', label: 'Accent (cyan)', defaultColor: '#00d4db' },
  { key: '--color-success', label: 'Success', defaultColor: '#34d399' },
  { key: '--color-warning', label: 'Warning', defaultColor: '#fbbf24' },
  { key: '--color-error', label: 'Error', defaultColor: '#f87171' },
] as const;

// Theming moved to ../theme.ts (1.0 item 1 — light theme + auto mode).
// Importing it also runs its module-load init (re-applies persisted
// tokens / re-arms the auto-mode OS listener on reload).

function AppearanceSection() {
  const [theme, setTheme] = createSignal<ThemeMode>(loadThemeMode());
  const [density, setDensity] = createSignal<'verbose' | 'normal' | 'summary'>(
    'normal',
  );
  const [tokens, setTokens] = createSignal<Record<string, string>>(loadThemeTokens());
  const [locale, setLocale] = createSignal<LocaleTag>(loadLocale());
  const [intro, setIntro] = createSignal<string>(
    typeof localStorage !== 'undefined'
      ? (localStorage.getItem(SPLASH_INTRO_KEY) ?? '')
      : '',
  );

  function changeIntro(v: string) {
    setIntro(v);
    try {
      if (v) localStorage.setItem(SPLASH_INTRO_KEY, v);
      else localStorage.removeItem(SPLASH_INTRO_KEY);
    } catch {
      /* quota — ignore */
    }
  }

  function changeLocale(next: LocaleTag) {
    setLocale(next);
    saveLocale(next);
  }

  function updateToken(key: string, value: string) {
    const next = { ...tokens() };
    if (value) next[key] = value;
    else delete next[key];
    setTokens(next);
    try { localStorage.setItem(THEME_TOKENS_KEY, JSON.stringify(next)); }
    catch { /* ignore */ }
    applyThemeTokens(next);
  }

  function resetTokens() {
    setTokens({});
    try { localStorage.removeItem(THEME_TOKENS_KEY); }
    catch { /* ignore */ }
    applyThemeTokens({});
  }

  // ---- Theme presets (settings depth + a11y high-contrast) ----
  const [activePreset, setActivePreset] = createSignal<string>(
    typeof localStorage !== 'undefined'
      ? (localStorage.getItem(THEME_PRESET_KEY) ?? 'default')
      : 'default',
  );

  function applyPreset(id: string) {
    const preset = THEME_PRESETS[id];
    if (!preset) return;
    setActivePreset(id);
    setTokens(preset.tokens);
    applyPresetTokens(id);
    // Keep the theme-mode buttons coherent: the Light preset IS light mode;
    // every other preset is dark-based.
    const mode: ThemeMode = id === 'light' ? 'light' : 'dark';
    setTheme(mode);
    try {
      localStorage.setItem(THEME_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  /** Theme mode buttons (1.0 item 1): dark / light / auto. Light applies the
   * Light preset; auto follows the OS scheme live. Keeps the preset row in
   * sync since both write the same token store. */
  function changeThemeMode(next: ThemeMode) {
    setTheme(next);
    setThemeMode(next);
    const presetId = next === 'light' ? 'light' : 'default';
    setActivePreset(presetId);
    setTokens(THEME_PRESETS[presetId]?.tokens ?? {});
  }

  // ---- Notification preferences (settings depth) ----
  const prefs = notifPrefs;
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
        <SectionHeading
          title="Theme"
          hint={
            <>
              <strong>Dark</strong> is the {brand.name} default. <strong>Light</strong>{' '}
              applies the full light palette. <strong>Auto</strong> follows your
              OS appearance setting and switches live.
            </>
          }
        />
        <div class="settings-shell__choices">
          <For each={['dark', 'light', 'auto'] as const}>
            {(t) => (
              <button
                type="button"
                class={
                  'settings-shell__choice ' +
                  (theme() === t ? 'is-active' : '')
                }
                onClick={() => changeThemeMode(t)}
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
          hint={
            <>
              One-click token sets. <strong>High contrast</strong> maximizes
              text/background separation for low-vision use; <strong>Dim</strong>{' '}
              softens the palette for late-night sessions. Presets write the same
              overrides as the per-color editor below, so you can fine-tune after
              applying one.
            </>
          }
        />
        <div class="settings-shell__choices" data-testid="settings-theme-presets">
          <For each={Object.entries(THEME_PRESETS)}>
            {([id, preset]) => (
              <button
                type="button"
                class={
                  'settings-shell__choice ' +
                  (activePreset() === id ? 'is-active' : '')
                }
                onClick={() => applyPreset(id)}
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
          title="Notifications"
          hint="Which events surface as toasts. Errors always show — they carry recovery actions."
        />
        <div class="settings-shell__toggles" data-testid="settings-notif-prefs">
          <label class="settings-shell__toggle">
            <input
              type="checkbox"
              checked={prefs().turnCompletions}
              onChange={(e) => setNotifPref('turnCompletions', e.currentTarget.checked)}
              data-testid="notif-pref-turn-completions"
            />
            <span>Turn completions — “{brand.name} responded” after each finished turn</span>
          </label>
          <label class="settings-shell__toggle">
            <input
              type="checkbox"
              checked={prefs().connectionStatus}
              onChange={(e) => setNotifPref('connectionStatus', e.currentTarget.checked)}
              data-testid="notif-pref-connection-status"
            />
            <span>Connection status — SSE disconnect / reconnect notices</span>
          </label>
        </div>

        <SectionHeading
          title="Accent palette"
          hint={
            <>
              Overrides the design system's accent tokens at the web layer. Saved
              to <code>localStorage.{THEME_TOKENS_KEY}</code> and applied on every
              reload.
            </>
          }
        />
        <div class="theme-tokens">
          <For each={ACCENT_TOKENS}>
            {(t) => {
              const current = () => tokens()[t.key] ?? t.defaultColor;
              return (
                <label class="theme-token">
                  <span class="theme-token__label">{t.label}</span>
                  <input
                    type="color"
                    class="theme-token__picker"
                    value={current()}
                    onInput={(e) => updateToken(t.key, e.currentTarget.value)}
                    data-testid={`theme-token-${t.key}`}
                  />
                  <code class="theme-token__hex">{current()}</code>
                  <Show when={tokens()[t.key]}>
                    <button
                      type="button"
                      class="theme-token__reset"
                      onClick={() => updateToken(t.key, '')}
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
        <Show when={Object.keys(tokens()).length > 0}>
          <button
            type="button"
            class="ws-form__btn"
            style="margin-top: 8px"
            onClick={resetTokens}
            data-testid="theme-tokens-reset-all"
          >
            Reset palette to design-system defaults
          </button>
        </Show>

        <SectionHeading
          title="Locale"
          hint={
            <>
              Forwarded to clio as <code>Accept-Language</code> so backend copy
              (errors, hints, slash command titles) can answer in your preferred
              language. UI chrome strings stay English until frontend i18n lands.
            </>
          }
        />
        <div class="settings-shell__choices" data-testid="settings-locale-choices">
          <For each={LOCALES}>
            {(l) => (
              <button
                type="button"
                class={
                  'settings-shell__choice ' +
                  (locale() === l.tag ? 'is-active' : '')
                }
                onClick={() => changeLocale(l.tag)}
                data-testid={`settings-locale-${l.tag}`}
              >
                <span class="settings-shell__choice-label">{l.nativeLabel}</span>
                <span class="settings-shell__choice-sub">{l.label}</span>
              </button>
            )}
          </For>
        </div>
        <Show when={locale() !== DEFAULT_LOCALE}>
          <button
            type="button"
            class="ws-form__btn"
            style="margin-top: 8px"
            onClick={() => changeLocale(DEFAULT_LOCALE)}
            data-testid="settings-locale-reset"
          >
            Reset to English
          </button>
        </Show>

        <SectionHeading title="Default transcript density" />
        <div class="settings-shell__choices">
          <For each={['verbose', 'normal', 'summary'] as const}>
            {(d) => (
              <button
                type="button"
                class={
                  'settings-shell__choice ' +
                  (density() === d ? 'is-active' : '')
                }
                onClick={() => setDensity(d)}
                data-testid={`settings-density-${d}`}
              >
                <span class="settings-shell__choice-label">{d}</span>
              </button>
            )}
          </For>
        </div>
        <p class="settings-shell__hint">
          The chat shell remembers your density per session (Ctrl + O cycles).
          The default applies to new sessions.
        </p>

        <SectionHeading
          title="Custom intro splash"
          hint={
            <>
              Mirrors the TUI's <code>intro_file</code> config — drop a short
              banner here and it'll render on the Splash/Connect screen while
              {' '}{brand.name} boots. Plain text only (no ANSI escapes).
            </>
          }
        />
        <textarea
          class="settings-shell__intro"
          placeholder="e.g. ASCII art, motto, deploy tag, etc."
          rows={5}
          value={intro()}
          onInput={(e) => changeIntro(e.currentTarget.value)}
          data-testid="settings-intro-textarea"
        />
        <Show when={intro()}>
          <button
            type="button"
            class="ws-form__btn"
            style="margin-top: 8px"
            onClick={() => changeIntro('')}
            data-testid="settings-intro-clear"
          >
            Clear intro
          </button>
        </Show>

        <SectionHeading
          title="Reset"
          hint={
            <>
              Clears all <code>clio.*</code> keys from localStorage — drafts, pins,
              inspector tab, density, active session. Backend credentials live in
              the registry and are not affected.
            </>
          }
        />
        <button
          type="button"
          class="ws-form__btn ws-form__btn--primary"
          style="margin-top: 8px"
          onClick={() => {
            if (typeof localStorage === 'undefined') return;
            if (!confirm(`Clear all local ${brand.name} preferences? This cannot be undone.`)) return;
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const k = localStorage.key(i);
              if (k && k.startsWith('clio.')) localStorage.removeItem(k);
            }
            alert('Local preferences cleared. Reloading…');
            window.location.reload();
          }}
          data-testid="settings-reset-prefs"
        >
          Reset all preferences
        </button>
      </div>
    </section>
  );
}

/** 1.0 item 7 — Settings export/import ("Data & backups"). */
function DataSection() {
  const toast = useToast();
  const [importMsg, setImportMsg] = createSignal('');
  let fileInput: HTMLInputElement | undefined;

  function onExport() {
    const name = downloadSettings();
    toast.push({
      tone: 'success',
      title: 'Settings exported',
      body: name,
      duration: 3500,
    });
  }

  async function onImportFile(file: File) {
    try {
      const text = await file.text();
      const res = importSettings(text);
      setImportMsg(
        `Imported ${res.applied} preference${res.applied === 1 ? '' : 's'}` +
          (res.skipped ? ` (${res.skipped} skipped)` : '') +
          ' — reloading…',
      );
      toast.push({
        tone: 'success',
        title: 'Settings imported',
        body: `${res.applied} preferences applied`,
        duration: 2500,
      });
      // Reload so every signal re-reads its persisted value.
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setImportMsg('');
      toast.push({
        tone: 'error',
        title: 'Import failed',
        body: e instanceof Error ? e.message : String(e),
        duration: 6000,
      });
    }
  }

  return (
    <section class="dp" data-testid="settings-data">
      <header class="dp__head">
        <div class="dp__title-block">
          <div class="dp__icon">
            <Icon name="share" size={20} />
          </div>
          <div>
            <h1 class="dp__title">Data &amp; backups</h1>
            <p class="dp__subtitle">Export and restore your local preferences.</p>
          </div>
        </div>
      </header>
      <div class="dp__body">
        <SectionHeading
          title="Export"
          hint={
            <>
              Downloads every local preference — theme, density, notification
              prefs, command history, pins, drafts — as a JSON file. Backend
              connections and their credentials are <strong>never</strong>{' '}
              included.
            </>
          }
        />
        <button
          type="button"
          class="ws-form__btn ws-form__btn--primary"
          style="margin-top: 8px"
          onClick={onExport}
          data-testid="settings-export-btn"
        >
          Export settings…
        </button>

        <SectionHeading
          title="Import"
          hint="Restores preferences from a previously exported file. Matching keys are overwritten; everything else keeps its current value. The app reloads after a successful import."
        />
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          data-testid="settings-import-file"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void onImportFile(f);
            e.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          class="ws-form__btn"
          style="margin-top: 8px"
          onClick={() => fileInput?.click()}
          data-testid="settings-import-btn"
        >
          Import from file…
        </button>
        <Show when={importMsg()}>
          <p class="settings-shell__hint" data-testid="settings-import-result">
            {importMsg()}
          </p>
        </Show>
      </div>
    </section>
  );
}

function AboutSection() {
  const reg = useBackendRegistry();
  const cur = () => reg.current();
  const appName = () => (inTauri() ? `${brand.name} Desktop` : `${brand.name} Web`);
  const capabilityEntries = () =>
    Object.entries(cur()?.capabilities?.capabilities ?? {})
      .filter(([, v]) => typeof v === 'boolean')
      .sort(([a], [b]) => a.localeCompare(b)) as Array<[string, boolean]>;
  const enabledCapabilities = () => capabilityEntries().filter(([, v]) => v);
  const disabledCapabilities = () => capabilityEntries().filter(([, v]) => !v);
  return (
    <section class="dp" data-testid="settings-about">
      <header class="dp__head">
        <div class="dp__title-block">
          <div class="dp__icon">
            <Icon name="help" size={20} />
          </div>
          <div>
            <h1 class="dp__title">About {appName()}</h1>
            <p class="dp__subtitle">Build identity and connected backend.</p>
          </div>
        </div>
      </header>
      <div class="dp__body">
        <div class="dp__stats">
          <div class="dp__stat">
            <div class="dp__stat-label">app</div>
            <div class="dp__stat-value" style="font-size:18px">{appName()}</div>
            <div class="dp__stat-sub">web + desktop frontend</div>
          </div>
          <div class="dp__stat">
            <div class="dp__stat-label">contract</div>
            <div class="dp__stat-value" style="font-size:18px">
              {cur()?.capabilities?.contract_version ?? 'unknown'}
            </div>
            <div class="dp__stat-sub">GACT</div>
          </div>
          <div class="dp__stat">
            <div class="dp__stat-label">backend</div>
            <div class="dp__stat-value" style="font-size:16px">
              {cur()?.capabilities?.backend?.name ?? '—'}
            </div>
            <div class="dp__stat-sub">
              {cur()?.capabilities?.backend?.version ?? ''}
            </div>
          </div>
          <div class="dp__stat">
            <div class="dp__stat-label">auth</div>
            <div class="dp__stat-value" style="font-size:16px">
              {cur()?.capabilities?.auth?.current ?? '—'}
            </div>
          </div>
        </div>

        <Show when={cur()?.capabilities?.capabilities}>
          <SectionHeading title="Capabilities" />
          <div class="settings-shell__cap-summary" data-testid="settings-cap-summary">
            <div class="settings-shell__cap-counts">
              <Pill tone="ok" testid="settings-cap-enabled">
                {enabledCapabilities().length} enabled
              </Pill>
              <Pill
                tone={disabledCapabilities().length > 0 ? 'warn' : 'neutral'}
                testid="settings-cap-disabled"
              >
                {disabledCapabilities().length} disabled
              </Pill>
            </div>
            <Show when={disabledCapabilities().length > 0}>
              <div class="settings-shell__cap-disabled">
                <span class="settings-shell__cap-label">Needs backend support</span>
                <div class="dp__card-tags settings-shell__caps">
                  <For each={disabledCapabilities()}>
                    {([k]) => <Pill tone="warn">{k}</Pill>}
                  </For>
                </div>
              </div>
            </Show>
            <details class="settings-shell__cap-details">
              <summary>Show all capability flags</summary>
              <div class="dp__card-tags settings-shell__caps">
                <For each={capabilityEntries()}>
                  {([k, v]) => <Pill tone={v ? 'ok' : 'err'}>{k}</Pill>}
                </For>
              </div>
            </details>
          </div>
        </Show>

        <SectionHeading title="Links" />
        <ul class="settings-shell__links">
          <li>
            <a href="https://github.com/iowarp/gact-tui" target="_blank" rel="noreferrer">
              github.com/iowarp/gact-tui
            </a>
            <span class="settings-shell__link-detail">desktop + emulator + TUI</span>
          </li>
          <li>
            <a href="https://github.com/iowarp/clio-agent" target="_blank" rel="noreferrer">
              github.com/iowarp/clio-agent
            </a>
            <span class="settings-shell__link-detail">GACT v0.2 backend</span>
          </li>
          <li>
            <a
              href="https://github.com/iowarp/gact-tui/blob/main/contract/SPEC.md"
              target="_blank"
              rel="noreferrer"
            >
              GACT v0.2 protocol spec
            </a>
            <span class="settings-shell__link-detail">canonical wire contract</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

function NoBackend() {
  return (
    <EmptyState
      icon="workspaces"
      title="No backend connected"
      body={
        <>
          Add a backend under <strong>Settings → Backends</strong> first.
        </>
      }
      testid="settings-no-backend"
    />
  );
}
