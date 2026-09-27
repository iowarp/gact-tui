import { MANAGED_BACKEND_POLL_MS, MANAGED_BACKEND_READY_TIMEOUT_MS } from '@/lib/runtime-limits';
import { vocab } from '@/lib/brand-vocabulary';

export type ManagedBackendStatus =
  | {
      kind: 'starting';
      detail: 'checking_existing' | 'installing_runtime' | 'starting_service';
    }
  | { kind: 'ready' }
  | { kind: 'needs_install' }
  | { kind: 'error'; detail: string }
  /**
   * An agent already running on the attach port answered, but the desktop
   * can't obtain the bearer token it enforces (clio-agent#1478). `detail` is
   * the plain-language reason.
   */
  | { kind: 'auth_unavailable'; detail: string };

export interface ManagedBackendHandle {
  url: string;
  bearer_token: string;
  status: ManagedBackendStatus;
}

interface ManagedBackendOptions {
  onStatus?: (status: ManagedBackendStatus) => void;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

async function invokeManagedBackend<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return args ? invoke<T>(command, args) : invoke<T>(command);
}

export async function getManagedBackend(): Promise<ManagedBackendHandle> {
  return invokeManagedBackend<ManagedBackendHandle>('get_backend');
}

/** Re-run the owned backend spawn pipeline after a typed startup failure. */
export async function retryManagedBackend(): Promise<void> {
  await invokeManagedBackend<void>('retry_backend');
}

/**
 * Relaunch the whole app — not just the managed backend child. Used by the
 * Infrastructure > Agent "Restart CLIO" button once a sandbox setup run
 * reports `sandbox_fence_pending_restart`: an MCP tool fleet already spawned
 * before the just-activated fence isn't covered by it until the backend
 * restarts.
 *
 * A backend-only respawn isn't enough: the fresh child boots on a new port
 * with a new bearer token, and this webview's connection handshake only
 * runs once, at mount (`connection-provider.tsx`) — it would never learn
 * the new coordinates and every request after that "restart" would fail.
 * The native `restart_clio` command instead tears down through the same
 * owned-process guard as quitting and calls Tauri's whole-app restart, so
 * the webview reloads from scratch and redoes that handshake against
 * whatever the fresh backend boots with. Tauri-only; callers check
 * `inTauri()` first.
 */
export async function restartClio(): Promise<void> {
  await invokeManagedBackend<void>('restart_clio');
}

interface InstallFailure {
  code?: number;
  tail?: string;
}

/**
 * Run one native install command and settle on its terminal event.
 *
 * The native installers (`install_clio`, `update_clio`) run on a worker thread
 * and report only through events: `clio:install-done` after verification, or
 * `clio:install-failed` with the installer's last output lines. Listeners are
 * attached BEFORE the command is invoked so a fast failure is never missed, and
 * the installer process itself bounds the wait (it always ends in one of the
 * two events), so no clock is layered on top.
 */
async function runNativeInstall(
  command: string,
  args: Record<string, unknown> | undefined,
  failureMessage: (tail: string | undefined) => string,
  onProgress?: (line: string) => void,
): Promise<void> {
  const { listen } = await import('@tauri-apps/api/event');
  let removeDone: (() => void) | undefined;
  let removeFailed: (() => void) | undefined;
  let removeProgress: (() => void) | undefined;
  let resolveInstall!: () => void;
  let rejectInstall!: (error: Error) => void;
  const completed = new Promise<void>((resolve, reject) => {
    resolveInstall = resolve;
    rejectInstall = reject;
  });
  try {
    removeDone = await listen('clio:install-done', () => resolveInstall());
    removeFailed = await listen<InstallFailure>('clio:install-failed', (event) => {
      rejectInstall(new Error(failureMessage(event.payload.tail || undefined)));
    });
    if (onProgress) {
      removeProgress = await listen<{ line: string }>('clio:install-progress', (event) => {
        onProgress(event.payload.line);
      });
    }
    await invokeManagedBackend<void>(command, args);
    await completed;
  } finally {
    removeDone?.();
    removeFailed?.();
    removeProgress?.();
  }
}

/** Update the desktop-owned CLIO runtime and resolve only after verification succeeds. */
export async function updateManagedClio(
  targetVersion: string,
  options: {
    restartApp: boolean;
    /**
     * Forwards every `clio:install-progress` line the Rust installer streams
     * (see `supervisor_installer.rs::stream_lines`) — the real signal for
     * this path, since a pip-based agent install has no byte count to show a
     * percentage from. Optional so callers that only need the settled
     * outcome (existing behavior) are unaffected.
     */
    onProgress?: (line: string) => void;
  },
): Promise<void> {
  await runNativeInstall(
    'update_clio',
    { targetVersion, restartApp: options.restartApp },
    (tail) => tail || `${vocab.agent} update failed.`,
    options.onProgress,
  );
}

export async function waitForManagedBackend(
  options: ManagedBackendOptions = {},
): Promise<ManagedBackendHandle> {
  const pollIntervalMs = options.pollIntervalMs ?? MANAGED_BACKEND_POLL_MS;
  const timeoutMs = options.timeoutMs ?? MANAGED_BACKEND_READY_TIMEOUT_MS;
  let deadline = Date.now() + timeoutMs;
  let installStarted = false;

  for (;;) {
    const handle = await getManagedBackend();
    options.onStatus?.(handle.status);
    if (handle.status.kind === 'ready') return handle;
    if (handle.status.kind === 'error') {
      throw new Error(
        handle.status.detail || `The managed ${vocab.agent} service could not start.`,
      );
    }
    if (handle.status.kind === 'auth_unavailable') {
      throw new Error(managedAuthUnavailableMessage(handle.url, handle.status.detail));
    }
    if (handle.status.kind === 'needs_install' && !installStarted) {
      installStarted = true;
      // A first-use install settles on its own terminal event, not on this
      // readiness clock: a failed install surfaces the installer's own output
      // (a lite build with no bundled runtime used to report only "did not
      // become ready in time", #1412), and a slow but working install is not
      // cut off. The readiness window restarts once the install has settled.
      await runNativeInstall('install_clio', undefined, (tail) =>
        tail
          ? `The ${vocab.agent} service could not be installed: ${tail}`
          : `The ${vocab.agent} service could not be installed.`,
      );
      deadline = Date.now() + timeoutMs;
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(`The managed ${vocab.agent} service did not become ready in time.`);
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, pollIntervalMs);
    });
  }
}

/**
 * Said up front when the desktop attached to an agent it can't authenticate
 * to, instead of letting a later remote deploy fail at the SSH transport.
 */
export function managedAuthUnavailableMessage(url: string, reason: string): string {
  return `${vocab.agent} is already running at ${url}, but this app can't sign in to it: ${reason}. Stop that ${vocab.agent} or restart it with this version, then reopen the app.`;
}
