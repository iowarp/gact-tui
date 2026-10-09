import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inTauri: vi.fn(),
  getVersion: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: mocks.inTauri }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: mocks.getVersion }));
vi.mock('../../../../CHANGELOG.md?raw', () => ({
  default: `# Changelog

## Unreleased

## [0.11.2.22] — 2026-09-29

### Big screen zoom support (hotfix)

- Zoom the whole desktop window with Ctrl + mouse wheel.

## [0.11.2.21] — 2026-09-27

### Fixed

- The sidebar lists every session again.
`,
}));

import { WhatsNewDialog } from './whats-new-dialog';

const SEEN = 'clio.whatsNew.desktopVersion';

describe('WhatsNewDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.inTauri.mockReturnValue(true);
    mocks.getVersion.mockReset().mockResolvedValue('0.11.2+22');
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('shows the changes since the version this machine last ran, once', async () => {
    window.localStorage.setItem(SEEN, '0.11.2.21');
    render(<WhatsNewDialog />);

    expect(await screen.findByRole('dialog', { name: "What's new" })).toBeInTheDocument();
    expect(screen.getByText('Big screen zoom support (hotfix)')).toBeInTheDocument();
    expect(screen.getByText(/Version 0\.11\.2\.22/u)).toBeInTheDocument();
    // Only one product has news: no tab bar.
    expect(screen.queryByRole('tablist')).toBeNull();
    // The older release was already installed: not repeated.
    expect(screen.queryByText(/sidebar lists every session/u)).toBeNull();
    expect(window.localStorage.getItem(SEEN)).toBe('0.11.2.22');

    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    cleanup();
    render(<WhatsNewDialog />);
    await waitFor(() => expect(mocks.getVersion).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists every release skipped since an older version', async () => {
    window.localStorage.setItem(SEEN, '0.11.2.20');
    render(<WhatsNewDialog />);
    expect(await screen.findByText('Big screen zoom support (hotfix)')).toBeInTheDocument();
    expect(screen.queryByText(/sidebar lists every session/u)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Version 0\.11\.2\.21/u }));
    expect(await screen.findByText(/sidebar lists every session/u)).toBeInTheDocument();
  });

  it('after an in-app update from a version that recorded nothing, shows this version', async () => {
    window.localStorage.setItem(
      'clio.pending-update',
      JSON.stringify({ action: 'desktop', version: '0.11.2.22', startedAt: 1 }),
    );
    render(<WhatsNewDialog />);
    expect(await screen.findByText('Big screen zoom support (hotfix)')).toBeInTheDocument();
    expect(screen.queryByText(/sidebar lists every session/u)).toBeNull();
  });

  it('stays quiet on a first install and records the version', async () => {
    render(<WhatsNewDialog />);
    await waitFor(() => expect(window.localStorage.getItem(SEEN)).toBe('0.11.2.22'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does nothing in a browser', () => {
    mocks.inTauri.mockReturnValue(false);
    render(<WhatsNewDialog />);
    expect(mocks.getVersion).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  function brandedBuild() {
    vi.stubEnv('VITE_CLIO_WORKSPACE_VERSION', '0.11.2+22');
    vi.stubEnv(
      'VITE_CLIO_DESKTOP_CHANGELOG',
      `# Changelog
## [0.9.5-beta.5.1] - 2026-10-09
### Fixed
- Agent tools reconnect after an update.
### Notes
- Detailed compatibility information.
## [0.9.4] - 2026-07-07
- An unrelated old release.
`,
    );
    mocks.getVersion.mockResolvedValue('0.9.5-5+1');
    window.localStorage.setItem(SEEN, '0.9.5-beta.5');
  }

  it('uses each product version for its own notes, with independent seen markers', async () => {
    brandedBuild();
    window.localStorage.setItem('clio.whatsNew.interfaceVersion', '0.11.2.21');
    render(<WhatsNewDialog />);
    expect(await screen.findByText(/Agent tools reconnect/u)).toBeInTheDocument();
    expect(screen.queryByText(/unrelated old release/u)).toBeNull();
    expect(screen.getByRole('tab', { name: /release.*0\.9\.5-beta\.5\.1/u })).toBeInTheDocument();
    expect(screen.queryByText(/Detailed compatibility/u)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Notes$/u }));
    expect(await screen.findByText(/Detailed compatibility/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Interface.*0\.11\.2\.22/u }));
    expect(await screen.findByText('Big screen zoom support (hotfix)')).toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN)).toBe('0.9.5-beta.5.1');
    expect(window.localStorage.getItem('clio.whatsNew.interfaceVersion')).toBe('0.11.2.22');
  });

  it('migrates older installations by showing only this interface build alongside product notes', async () => {
    brandedBuild();
    render(<WhatsNewDialog />);
    await userEvent.click(await screen.findByRole('tab', { name: /Interface.*0\.11\.2\.22/u }));
    expect(await screen.findByText('Big screen zoom support (hotfix)')).toBeInTheDocument();
    expect(screen.queryByText(/Version 0\.11\.2\.21/u)).toBeNull();
  });

  it('can show a UI-only change while the native product version stays unchanged', async () => {
    brandedBuild();
    window.localStorage.setItem(SEEN, '0.9.5-beta.5.1');
    window.localStorage.setItem('clio.whatsNew.interfaceVersion', '0.11.2.21');
    render(<WhatsNewDialog />);
    expect(await screen.findByText('Big screen zoom support (hotfix)')).toBeInTheDocument();
    expect(screen.queryByText(/Agent tools reconnect/u)).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('does not misread a native product version as a UI version when product notes are absent', async () => {
    vi.stubEnv('VITE_CLIO_WORKSPACE_VERSION', '0.11.2+22');
    mocks.getVersion.mockResolvedValue('0.9.5-5+1');
    window.localStorage.setItem(SEEN, '0.9.5-beta.5');
    render(<WhatsNewDialog />);
    expect(await screen.findByText('Big screen zoom support (hotfix)')).toBeInTheDocument();
    expect(screen.queryByText(/Version 0\.9/u)).toBeNull();
  });

  it('records both identities without showing a first-install popup', async () => {
    brandedBuild();
    window.localStorage.clear();
    render(<WhatsNewDialog />);
    await waitFor(() => expect(window.localStorage.getItem(SEEN)).toBe('0.9.5-beta.5.1'));
    expect(window.localStorage.getItem('clio.whatsNew.interfaceVersion')).toBe('0.11.2.22');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
