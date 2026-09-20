import { MANAGED_BACKEND_POLL_MS, MANAGED_BACKEND_READY_TIMEOUT_MS } from '@/lib/runtime-limits';
import { vocab } from '@/lib/brand-vocabulary';

export type ManagedBackendStatus =
  | {
      kind: 'starting';
      detail: 'checking_existing' | 'installing_runtime' | 'starting_service';
    }
  | { kind: 'ready' }
  | { kind: 'needs_install' }
  | { kind: 'error'; detail: string };

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

async function invokeManagedBackend<T>(command: string): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command);
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

export async function waitForManagedBackend(
  options: ManagedBackendOptions = {},
): Promise<ManagedBackendHandle> {
  const pollIntervalMs = options.pollIntervalMs ?? MANAGED_BACKEND_POLL_MS;
  const timeoutMs = options.timeoutMs ?? MANAGED_BACKEND_READY_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
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
    if (handle.status.kind === 'needs_install' && !installStarted) {
      installStarted = true;
      await invokeManagedBackend<void>('install_clio');
    }
    if (Date.now() >= deadline) {
      throw new Error(`The managed ${vocab.agent} service did not become ready in time.`);
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, pollIntervalMs);
    });
  }
}
