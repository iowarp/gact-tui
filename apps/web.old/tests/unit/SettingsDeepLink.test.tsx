/**
 * Task B2 §1 — total settings deep-linking.
 *
 *  - The ?section= param parses to the right SettingsSection (and rejects
 *    unknown values).
 *  - writeSectionParam syncs the URL so a refresh re-opens the same panel;
 *    clearSectionParam strips it on exit.
 *  - SettingsShell mounts the section named by ?section= on cold load AND
 *    writes the active section back to the URL when the user navigates,
 *    so the panel survives a refresh.
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearSectionParam,
  isSettingsSection,
  readSectionParam,
  writeSectionParam,
} from '../../src/routes/settings-deeplink.js';
import { SettingsShell } from '../../src/routes/SettingsShell.js';
import {
  BackendRegistryProvider,
  createBackendRegistry,
} from '../../src/registry.js';
import { InMemoryPersistence } from '@clio/core';
import { ToastProvider } from '../../src/components/Toast.js';

function setUrl(search: string) {
  window.history.replaceState({}, '', `/${search}`);
}

beforeEach(() => setUrl(''));
afterEach(() => {
  cleanup();
  setUrl('');
});

describe('settings-deeplink helpers', () => {
  it('isSettingsSection accepts known ids and rejects junk', () => {
    expect(isSettingsSection('providers')).toBe(true);
    expect(isSettingsSection('models')).toBe(true);
    expect(isSettingsSection('about')).toBe(true);
    expect(isSettingsSection('not-a-section')).toBe(false);
    expect(isSettingsSection(null)).toBe(false);
  });

  it('readSectionParam parses ?section= from a url', () => {
    expect(readSectionParam('http://x/?section=providers')).toBe('providers');
    expect(readSectionParam('http://x/?section=bogus')).toBeUndefined();
    expect(readSectionParam('http://x/')).toBeUndefined();
  });

  it('writeSectionParam syncs the URL (survives refresh)', () => {
    writeSectionParam('memory');
    const url = new URL(window.location.href);
    expect(url.searchParams.get('route')).toBe('settings');
    expect(url.searchParams.get('section')).toBe('memory');
    // Re-reading the live URL yields the same section.
    expect(readSectionParam()).toBe('memory');
  });

  it('writeSectionParam includes the optional sub-view', () => {
    writeSectionParam('providers', 'argonne_sophia');
    expect(new URL(window.location.href).searchParams.get('sub')).toBe(
      'argonne_sophia',
    );
  });

  it('clearSectionParam strips the deep-link params', () => {
    writeSectionParam('models', 'x');
    clearSectionParam();
    const url = new URL(window.location.href);
    expect(url.searchParams.get('section')).toBeNull();
    expect(url.searchParams.get('sub')).toBeNull();
    expect(url.searchParams.get('route')).toBeNull();
  });
});

function harness() {
  const persistence = new InMemoryPersistence({ backends: [], currentId: null });
  return createBackendRegistry({ persistence });
}

function renderShell() {
  const registry = harness();
  return render(() => (
    <BackendRegistryProvider registry={registry}>
      <ToastProvider>
        <SettingsShell onAddRemote={() => undefined} onBack={() => undefined} />
      </ToastProvider>
    </BackendRegistryProvider>
  ));
}

describe('SettingsShell deep-linking', () => {
  it('mounts the section named by ?section= on cold load', async () => {
    setUrl('?section=appearance');
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId('settings-appearance')).toBeTruthy(),
    );
    // The nav button for that section is marked active.
    expect(
      screen.getByTestId('settings-nav-appearance').classList.contains('is-active'),
    ).toBe(true);
  });

  it('writes the active section back to the URL when navigating', async () => {
    setUrl('?section=about');
    renderShell();
    await waitFor(() => expect(screen.getByTestId('settings-about')).toBeTruthy());

    // Navigate to Appearance via the nav rail.
    fireEvent.click(screen.getByTestId('settings-nav-appearance'));
    await waitFor(() =>
      expect(screen.getByTestId('settings-appearance')).toBeTruthy(),
    );

    // The URL now reflects the new panel — a refresh would re-open it.
    expect(readSectionParam()).toBe('appearance');
  });
});
