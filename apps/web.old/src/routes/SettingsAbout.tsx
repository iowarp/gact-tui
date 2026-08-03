/**
 * About settings section (build/version info) plus the no-backend notice.
 * Exports {@link AboutSection} and {@link NoBackend}.
 */
import { For, Show } from 'solid-js';
import { brand } from '@brand';
import { Icon } from '../components/Icon.js';
import { EmptyState, Pill, SectionHeading } from '../components/SettingsPrimitives.js';
import { useBackendRegistry } from '../registry.js';
import { inTauri } from '../tauri.js';

export function AboutSection() {
  const reg = useBackendRegistry();
  const cur = () => reg.current();
  const appName = () => (inTauri() ? `${brand.name} Desktop` : `${brand.name} Web`);
  const shellLabel = () => (inTauri() ? 'desktop frontend' : 'web frontend');
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
            <div class="dp__stat-value" style="font-size:18px">
              {appName()}
            </div>
            <div class="dp__stat-sub">{shellLabel()}</div>
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
            <div class="dp__stat-sub">{cur()?.capabilities?.backend?.version ?? ''}</div>
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
                  <For each={disabledCapabilities()}>{([k]) => <Pill tone="warn">{k}</Pill>}</For>
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
            <span class="settings-shell__link-detail">web, desktop, and TUI clients</span>
          </li>
          <Show when={brand.backendRepository}>
            {(repo) => (
              <li>
                <a href={repo().url} target="_blank" rel="noreferrer">
                  {repo().label}
                </a>
                <span class="settings-shell__link-detail">{repo().detail}</span>
              </li>
            )}
          </Show>
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

export function NoBackend() {
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
