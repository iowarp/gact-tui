export type ManagedBackendStatus =
  | { kind: 'starting' }
  | { kind: 'ready' }
  | { kind: 'needs_install' }
  | { kind: 'error'; detail: string };

export interface ManagedBackendHandle {
  url: string;
  bearer_token: string;
  status: ManagedBackendStatus;
}

interface ManagedBackendOptions {
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

export async function waitForManagedBackend(
  options: ManagedBackendOptions = {},
): Promise<ManagedBackendHandle> {
  const pollIntervalMs = options.pollIntervalMs ?? 150;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const deadline = Date.now() + timeoutMs;
  let installStarted = false;

  for (;;) {
    const handle = await getManagedBackend();
    if (handle.status.kind === 'ready') return handle;
    if (handle.status.kind === 'error') {
      throw new Error(handle.status.detail || 'The managed CLIO service could not start.');
    }
    if (handle.status.kind === 'needs_install' && !installStarted) {
      installStarted = true;
      await invokeManagedBackend<void>('install_clio');
    }
    if (Date.now() >= deadline) {
      throw new Error('The managed CLIO service did not become ready in time.');
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, pollIntervalMs);
    });
  }
}
