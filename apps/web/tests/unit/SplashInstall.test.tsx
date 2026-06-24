/**
 * First-run "one swoop" install — Splash state machine (web half).
 *
 * Mounts the SplashScreen with a mocked Tauri bridge that reports
 * `{kind: 'needs_install'}`, and asserts the splash:
 *   1. auto-invokes `installClio()` (no click),
 *   2. renders the `splash-installing` view (log pane + first-run note),
 *   3. appends each `clio:install-progress` line to the log pane,
 *   4. on `clio:install-failed`, falls back to the manual error card with
 *      the install-failed testids + a Retry that re-runs the installer,
 *   5. on `clio:install-done`, re-polls the backend (which then goes ready
 *      and hands off).
 *
 * The Tauri bridge module is mocked wholesale so the jsdom run thinks it's
 * inside the shell — the real `tauri.ts` short-circuits every export to a
 * no-op when `inTauri()` is false, which would make `needs_install`
 * unreachable.
 */
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BackendHandle,
  BackendStatus,
  InstallFailure,
  InstallProgressHandlers,
} from '../../src/tauri.js';

// --- Mock the Tauri bridge -------------------------------------------------
// Mutable handles the tests drive: the next backend status getBackend()
// returns, and the install-progress handlers the splash registered.
const state: {
  status: BackendStatus;
  installClioCalls: number;
  repairClioCalls: number;
  openLogsCalls: number;
  openLogsResult: string | null;
  openLogsReject: string | null;
  progressHandlers: InstallProgressHandlers | null;
  unsubscribed: boolean;
} = {
  status: { kind: 'needs_install' },
  installClioCalls: 0,
  repairClioCalls: 0,
  openLogsCalls: 0,
  openLogsResult: 'C:\\Users\\me\\AppData\\clio\\logs\\clio-boot.log',
  openLogsReject: null,
  progressHandlers: null,
  unsubscribed: false,
};

vi.mock('../../src/tauri.js', () => {
  return {
    inTauri: () => true,
    getBackend: async (): Promise<BackendHandle> => ({
      url: 'http://127.0.0.1:17800',
      bearer_token: '',
      status: state.status,
    }),
    installClio: async () => {
      state.installClioCalls += 1;
    },
    repairClio: async () => {
      state.repairClioCalls += 1;
    },
    openLogs: async () => {
      state.openLogsCalls += 1;
      if (state.openLogsReject) throw new Error(state.openLogsReject);
      return state.openLogsResult;
    },
    onInstallProgress: (handlers: InstallProgressHandlers) => {
      state.progressHandlers = handlers;
      return () => {
        state.unsubscribed = true;
        state.progressHandlers = null;
      };
    },
    // Unused by the install path but imported by the module under test.
    tauriFetch: globalThis.fetch,
  };
});

// @clio/core's Client is only reached on the `ready` handoff path; stub its
// capabilities() so the done→ready transition doesn't hit a real network.
vi.mock('@clio/core', async (orig) => {
  const actual = await orig<typeof import('@clio/core')>();
  return {
    ...actual,
    Client: class {
      async capabilities() {
        return {
          contract_version: '0.2',
          backend: { name: 'test', version: '0.0.0', vendor: 'gact-tui' },
          capabilities: {
            sessions: true,
            mcp: true,
            diffs: true,
            permissions: true,
          },
          transports: { events_sse: true, events_websocket: false },
          auth: { schemes: ['trust_socket'], current: 'trust_socket' },
          extensions: [],
        };
      }
    },
  };
});

// Import AFTER the mocks so the module under test binds to them.
const { SplashScreen } = await import('../../src/routes/SplashScreen.js');

afterEach(cleanup);

beforeEach(() => {
  state.status = { kind: 'needs_install' };
  state.installClioCalls = 0;
  state.repairClioCalls = 0;
  state.openLogsCalls = 0;
  state.openLogsResult = 'C:\\Users\\me\\AppData\\clio\\logs\\clio-boot.log';
  state.openLogsReject = null;
  state.progressHandlers = null;
  state.unsubscribed = false;
});

function mount() {
  const onReady = vi.fn();
  const onWebFallbackNeeded = vi.fn();
  render(() => (
    <SplashScreen onReady={onReady} onWebFallbackNeeded={onWebFallbackNeeded} />
  ));
  return { onReady, onWebFallbackNeeded };
}

describe('Splash first-run install (one swoop)', () => {
  it('auto-runs installClio and shows the install view without a click', async () => {
    mount();

    // The needs_install status auto-triggers the installer + install view.
    await waitFor(() => {
      expect(screen.getByTestId('splash-installing')).toBeTruthy();
    });
    expect(state.installClioCalls).toBe(1);
    expect(state.progressHandlers).not.toBeNull();

    // The first-run note + log pane are present.
    const view = screen.getByTestId('splash-installing');
    expect(view.textContent).toContain('Setting up the CLIO agent backend');
    expect(view.textContent).toContain('800');
    expect(screen.getByTestId('splash-install-log')).toBeTruthy();
  });

  it('appends each progress line to the log pane', async () => {
    mount();
    await waitFor(() => expect(state.progressHandlers).not.toBeNull());

    state.progressHandlers!.onLine('Cloning iowarp/clio-agent@develop…');
    state.progressHandlers!.onLine('Creating virtualenv .venv');
    state.progressHandlers!.onLine('Installing 142 packages');

    await waitFor(() => {
      const log = screen.getByTestId('splash-install-log');
      expect(log.textContent).toContain('Cloning iowarp/clio-agent@develop');
      expect(log.textContent).toContain('Creating virtualenv .venv');
      expect(log.textContent).toContain('Installing 142 packages');
    });
  });

  it('falls back to the manual error card on install-failed, with a Retry that re-runs the installer', async () => {
    mount();
    await waitFor(() => expect(state.progressHandlers).not.toBeNull());

    const failure: InstallFailure = {
      code: 1,
      tail: 'ERROR: failed to build wheel for xyz\nsee log above',
    };
    state.progressHandlers!.onFailed(failure);

    await waitFor(() => {
      expect(screen.getByTestId('splash-install-failed')).toBeTruthy();
    });
    const card = screen.getByTestId('splash-install-failed');
    // Tail of the installer output is surfaced for triage.
    expect(card.textContent).toContain('failed to build wheel');
    expect(card.textContent).toContain('exited with code 1');
    // The manual one-liner is still present as the fallback. For the CLIO
    // brand (the Vitest default) the recipe is derived from the resolved
    // backend install config, which points at the clio-agent installer.
    expect(card.textContent).toContain('clio-agent');
    // The recipe is brand-driven: it carries the resolved install ref env.
    expect(card.textContent).toContain('CLIO_REF');

    // Retry re-runs the installer (one more swoop) and returns to the
    // installing view.
    const retry = screen.getByTestId('splash-install-retry');
    retry.click();
    await waitFor(() => {
      expect(screen.getByTestId('splash-installing')).toBeTruthy();
    });
    expect(state.installClioCalls).toBe(2);
  });

  it('re-polls the backend on install-done and hands off when it goes ready', async () => {
    const { onReady } = mount();
    await waitFor(() => expect(state.progressHandlers).not.toBeNull());

    // The installer finished; the next get_backend poll should resolve ready.
    state.status = { kind: 'ready' };
    state.progressHandlers!.onDone();

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });
    expect(onReady.mock.calls[0]![0]).toMatchObject({
      url: 'http://127.0.0.1:17800',
    });
  });

  it('exposes Repair + Open logs buttons on the boot-failure card, distinct from Retry', async () => {
    mount();
    await waitFor(() => expect(state.progressHandlers).not.toBeNull());
    state.progressHandlers!.onFailed({ code: 1, tail: 'broken venv' });

    await waitFor(() => {
      expect(screen.getByTestId('splash-install-failed')).toBeTruthy();
    });
    // All three actions are present and distinct.
    expect(screen.getByTestId('splash-install-retry')).toBeTruthy();
    expect(screen.getByTestId('splash-repair')).toBeTruthy();
    expect(screen.getByTestId('splash-open-logs')).toBeTruthy();
  });

  it('Repair runs repairClio (force), not installClio, and shows the install view', async () => {
    mount();
    await waitFor(() => expect(state.progressHandlers).not.toBeNull());
    state.progressHandlers!.onFailed({ code: 1, tail: 'broken venv' });
    await waitFor(() => expect(screen.getByTestId('splash-repair')).toBeTruthy());

    // installClio was called once already (the auto first-run install).
    const installsBefore = state.installClioCalls;
    screen.getByTestId('splash-repair').click();

    await waitFor(() => {
      expect(screen.getByTestId('splash-installing')).toBeTruthy();
    });
    expect(state.repairClioCalls).toBe(1);
    // Repair must NOT re-trigger the plain installer.
    expect(state.installClioCalls).toBe(installsBefore);
  });

  it('a failed Repair shows a repair-specific message + the manual fallback', async () => {
    mount();
    await waitFor(() => expect(state.progressHandlers).not.toBeNull());
    state.progressHandlers!.onFailed({ code: 1, tail: 'first failure' });
    await waitFor(() => expect(screen.getByTestId('splash-repair')).toBeTruthy());

    screen.getByTestId('splash-repair').click();
    await waitFor(() => expect(screen.getByTestId('splash-installing')).toBeTruthy());

    state.progressHandlers!.onFailed({ code: 2, tail: 'repair blew up too' });
    await waitFor(() => {
      const card = screen.getByTestId('splash-install-failed');
      expect(card.textContent).toContain('repair');
      expect(card.textContent).toContain('repair blew up too');
      // Manual one-liner remains the ultimate fallback.
      expect(card.textContent).toContain('clio-agent');
    });
  });

  it('Open logs invokes openLogs and surfaces the revealed path', async () => {
    mount();
    await waitFor(() => expect(state.progressHandlers).not.toBeNull());
    state.progressHandlers!.onFailed({ code: 1, tail: 'broken' });
    await waitFor(() => expect(screen.getByTestId('splash-open-logs')).toBeTruthy());

    screen.getByTestId('splash-open-logs').click();
    await waitFor(() => {
      expect(state.openLogsCalls).toBe(1);
      const hint = screen.getByTestId('splash-log-hint');
      expect(hint.textContent).toContain('clio-boot.log');
    });
  });

  it('Open logs surfaces a hint (no traceback) when reveal fails', async () => {
    state.openLogsReject = 'boot log not found';
    mount();
    await waitFor(() => expect(state.progressHandlers).not.toBeNull());
    state.progressHandlers!.onFailed({ code: 1, tail: 'broken' });
    await waitFor(() => expect(screen.getByTestId('splash-open-logs')).toBeTruthy());

    screen.getByTestId('splash-open-logs').click();
    await waitFor(() => {
      const hint = screen.getByTestId('splash-log-hint');
      expect(hint.textContent).toContain('Could not open logs');
      expect(hint.textContent).toContain('boot log not found');
    });
  });
});
