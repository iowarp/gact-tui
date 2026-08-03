/**
 * Settings deep-linking (task B2 §1).
 *
 * Every settings section — and a couple of meaningful sub-views — is
 * addressable via the URL so:
 *   - "fix it in settings" links and the command palette land EXACTLY on the
 *     right panel, and
 *   - the panel SURVIVES A REFRESH (the param is written back to the URL when
 *     the user navigates within the shell).
 *
 * Scheme:  ?route=settings&section=<id>[&sub=<subview>]
 *
 * `route=settings` is what flips App into the settings shell on cold load;
 * `section` selects the panel; `sub` is an optional within-panel target a
 * section can read for its own deep-links (e.g. a specific provider).
 */
import type { SettingsSection } from './SettingsShell.js';

export const SETTINGS_SECTION_IDS: SettingsSection[] = [
  'backends',
  'workspaces',
  'session-defaults',
  'models',
  'providers',
  'agents',
  'tools',
  'prompts',
  'blueprints',
  'expert-packs',
  'hooks',
  'policies',
  'mcp',
  'memory',
  'metrics',
  'doctor',
  'appearance',
  'data',
  'about',
];

export function isSettingsSection(v: string | null | undefined): v is SettingsSection {
  return !!v && (SETTINGS_SECTION_IDS as string[]).includes(v);
}

/** Parse the active settings section from a URL (or the live location). */
export function readSectionParam(
  href: string = typeof window !== 'undefined' ? window.location.href : 'http://x/',
): SettingsSection | undefined {
  try {
    const p = new URL(href).searchParams.get('section');
    return isSettingsSection(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

/** Parse the optional within-section sub-view target. */
export function readSubParam(
  href: string = typeof window !== 'undefined' ? window.location.href : 'http://x/',
): string | undefined {
  try {
    return new URL(href).searchParams.get('sub') ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write the active section (and optional sub-view) back to the URL without a
 * navigation, so a refresh re-opens the same panel. Safe to call in non-DOM
 * test environments (it no-ops when history is unavailable).
 */
export function writeSectionParam(section: SettingsSection, sub?: string): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('route', 'settings');
    url.searchParams.set('section', section);
    if (sub) url.searchParams.set('sub', sub);
    else url.searchParams.delete('sub');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* ignore — deep-link sync is best-effort */
  }
}

/** Strip the settings deep-link params (used when leaving the shell). */
export function clearSectionParam(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('section');
    url.searchParams.delete('sub');
    if (url.searchParams.get('route') === 'settings') {
      url.searchParams.delete('route');
    }
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* ignore */
  }
}
