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
    expect(await screen.findByText(/sidebar lists every session/u)).toBeInTheDocument();
    expect(screen.getByText('Big screen zoom support (hotfix)')).toBeInTheDocument();
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
});
