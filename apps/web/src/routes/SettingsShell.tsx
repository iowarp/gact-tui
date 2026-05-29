import { createSignal, For, Match, Show, Switch, onCleanup, onMount } from 'solid-js';
import { Icon, type IconName } from '../components/Icon.js';
import { Client } from '@clio/core';
import { DEFAULT_LOCALE, LOCALES, loadLocale, saveLocale, getRequestLocale, type LocaleTag } from '../locale.js';
import { SPLASH_INTRO_KEY } from './SplashScreen.js';
import { inTauri, tauriFetch } from '../tauri.js';
import { useBackendRegistry } from '../registry.js';
import { SettingsBackends } from './SettingsBackends.js';
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
  | 'about';

interface SectionDef {
  id: SettingsSection;
  label: string;
  icon: IconName;
  group: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'backends', label: 'Backends', icon: 'workspaces', group: 'Connection' },
  { id: 'workspaces', label: 'Workspaces', icon: 'workspaces', group: 'Connection' },
  { id: 'providers', label: 'Models & providers', icon: 'sparkle', group: 'Agents' },
  { id: 'agents', label: 'Agents', icon: 'agents', group: 'Agents' },
  { id: 'tools', label: 'Commands', icon: 'tool', group: 'Agents' },
  { id: 'prompts', label: 'Prompts', icon: 'sparkle', group: 'Agents' },
  { id: 'blueprints', label: 'Agent blueprints', icon: 'agents', group: 'Agents' },
  { id: 'expert-packs', label: 'Expert packs', icon: 'sparkle', group: 'Agents' },
  { id: 'mcp', label: 'MCP servers', icon: 'mcp', group: 'Agents' },
  { id: 'hooks', label: 'Hooks', icon: 'tool', group: 'Telemetry' },
  { id: 'policies', label: 'Policies', icon: 'doctor', group: 'Telemetry' },
  { id: 'memory', label: 'Memory', icon: 'memory', group: 'Telemetry' },
  { id: 'metrics', label: 'Metrics', icon: 'metrics', group: 'Telemetry' },
  { id: 'doctor', label: 'Doctor', icon: 'doctor', group: 'Telemetry' },
  { id: 'appearance', label: 'Appearance', icon: 'palette', group: 'App' },
  { id: 'about', label: 'About', icon: 'help', group: 'App' },
];

export interface SettingsShellProps {
  onAddRemote: () => void;
  onBack: () => void;
  /** Initial section to land on (e.g. when arrived via a deep link). */
  initial?: SettingsSection;
}

export function SettingsShell(props: SettingsShellProps) {
  const [section, setSection] = createSignal<SettingsSection>(
    props.initial ?? 'backends',
  );

  // Esc returns to chat — matches the behavior of every other overlay
  // in the chrome.
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onBack();
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
          onClick={props.onBack}
          data-testid="settings-back"
        >
          <Icon name="chevron-right" size={14} class="settings-shell__back-icon" />
          <span>Back to CLIO</span>
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
                      onClick={() => setSection(s.id)}
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
                onBack={props.onBack}
              />
            </Match>
            <Match when={client() && section() === 'workspaces'}>
              <WorkspacesPage client={client()!} />
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

const THEME_TOKENS_KEY = 'clio.theme.tokens.v1';

function loadThemeTokens(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(THEME_TOKENS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch {
    /* ignore */
  }
  return {};
}

function applyThemeTokens(tokens: Record<string, string>) {
  if (typeof document === 'undefined') return;
  let style = document.getElementById('clio-theme-override');
  if (!style) {
    style = document.createElement('style');
    style.id = 'clio-theme-override';
    document.head.appendChild(style);
  }
  const css = Object.entries(tokens)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `  ${k}: ${v} !important;`)
    .join('\n');
  style.textContent = css ? `:root {\n${css}\n}\n` : '';
}

// Apply on module load so persisted tokens survive a hard reload.
if (typeof document !== 'undefined') {
  applyThemeTokens(loadThemeTokens());
}

function AppearanceSection() {
  const [theme, setTheme] = createSignal<'dark' | 'light' | 'auto'>('dark');
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
        <div class="dp__section-title">Theme</div>
        <div class="settings-shell__choices">
          <For each={['dark', 'light', 'auto'] as const}>
            {(t) => (
              <button
                type="button"
                class={
                  'settings-shell__choice ' +
                  (theme() === t ? 'is-active' : '')
                }
                onClick={() => setTheme(t)}
                data-testid={`settings-theme-${t}`}
              >
                <span class={`settings-shell__choice-swatch swatch--${t}`} />
                <span class="settings-shell__choice-label">{t}</span>
              </button>
            )}
          </For>
        </div>
        <p class="settings-shell__hint">
          Light + Auto themes land in v1.0 alongside the design-system
          token refresh; today only Dark is wired.
        </p>

        <div class="dp__section-title">Accent palette</div>
        <p class="settings-shell__hint">
          Overrides the design system's accent tokens at the web
          layer. Saved to <code>localStorage.{THEME_TOKENS_KEY}</code>
          and applied on every reload.
        </p>
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

        <div class="dp__section-title">Locale</div>
        <p class="settings-shell__hint">
          Forwarded to clio as <code>Accept-Language</code> so backend
          copy (errors, hints, slash command titles) can answer in your
          preferred language. UI chrome strings stay English until
          frontend i18n lands.
        </p>
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

        <div class="dp__section-title">Default transcript density</div>
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

        <div class="dp__section-title">Custom intro splash</div>
        <p class="settings-shell__hint">
          Mirrors the TUI's <code>intro_file</code> config — drop a short
          banner here and it'll render on the Splash/Connect screen while
          CLIO boots. Plain text only (no ANSI escapes).
        </p>
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

        <div class="dp__section-title">Reset</div>
        <p class="settings-shell__hint">
          Clears all <code>clio.*</code> keys from localStorage —
          drafts, pins, inspector tab, density, active session. Backend
          credentials live in the registry and are not affected.
        </p>
        <button
          type="button"
          class="ws-form__btn ws-form__btn--primary"
          style="margin-top: 8px"
          onClick={() => {
            if (typeof localStorage === 'undefined') return;
            if (!confirm('Clear all local CLIO preferences? This cannot be undone.')) return;
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

function AboutSection() {
  const reg = useBackendRegistry();
  const cur = () => reg.current();
  return (
    <section class="dp" data-testid="settings-about">
      <header class="dp__head">
        <div class="dp__title-block">
          <div class="dp__icon">
            <Icon name="help" size={20} />
          </div>
          <div>
            <h1 class="dp__title">About CLIO Desktop</h1>
            <p class="dp__subtitle">Build identity and connected backend.</p>
          </div>
        </div>
      </header>
      <div class="dp__body">
        <div class="dp__stats">
          <div class="dp__stat">
            <div class="dp__stat-label">app</div>
            <div class="dp__stat-value" style="font-size:18px">CLIO Desktop</div>
            <div class="dp__stat-sub">v0.9.1 polish wave</div>
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
          <div class="dp__section-title">Capability flags</div>
          <div class="dp__card-tags settings-shell__caps">
            <For
              each={Object.entries(cur()!.capabilities!.capabilities)
                .filter(([, v]) => typeof v === 'boolean')
                .sort()}
            >
              {([k, v]) => (
                <span class={'dp__tag ' + (v ? 'dp__tag--ok' : 'dp__tag--err')}>
                  {k}
                </span>
              )}
            </For>
          </div>
        </Show>

        <div class="dp__section-title">Links</div>
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
    <div class="dp__empty">
      <div class="dp__empty-icon">
        <Icon name="workspaces" size={28} />
      </div>
      <h2 class="dp__empty-title">No backend connected</h2>
      <p class="dp__empty-body">
        Add a backend under <strong>Settings → Backends</strong> first.
      </p>
    </div>
  );
}
