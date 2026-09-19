import { MANAGED_BACKEND_POLL_MS, MANAGED_BACKEND_READY_TIMEOUT_MS } from '@/lib/runtime-limits';
import { vocab } from '@/lib/brand-vocabulary';

export type ManagedBackendStatus =
  | { kind: 'starting'; detail: 'checking_existing' | 'starting_service' }
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

/**
 * Restart the managed backend process — reap the current child, re-spawn it.
 * Used by the Infrastructure > Agent "Restart CLIO" button once a sandbox
 * setup run reports `sandbox_fence_pending_restart`: an MCP tool fleet
 * already spawned before the just-activated fence isn't covered by it until
 * the backend restarts. Tauri-only; callers check `inTauri()` first.
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
      throw new Error(handle.status.detail || `The managed ${vocab.agent} service could not start.`);
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
