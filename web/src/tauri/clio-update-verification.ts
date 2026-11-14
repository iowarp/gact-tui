import { compareReleaseVersions, displayReleaseVersion } from '@/lib/release-version';
import { t, ph } from '@lingui/core/macro';
import { vocab } from '@/lib/brand-vocabulary';
import type { PendingUpdateMarker } from '@/store/update-flow-store';
import { getManagedBackend } from './managed-backend';
import { MANAGED_BACKEND_READY_TIMEOUT_MS, MANAGED_BACKEND_POLL_MS } from '@/lib/runtime-limits';

const { agent } = vocab;

/** Observe startup without using the currently selected remote connection or installing anything. */
async function waitForUpdatedRuntime(signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + MANAGED_BACKEND_READY_TIMEOUT_MS;
  for (;;) {
    signal?.throwIfAborted();
    const handle = await getManagedBackend();
    if (handle.status.kind === 'ready') return;
    if (handle.status.kind !== 'starting') {
      throw new Error(
        t`The updated local service could not start: ${ph({ detail: 'detail' in handle.status ? handle.status.detail : handle.status.kind })}`,
      );
    }
    if (Date.now() >= deadline)
      throw new Error(t`The updated local service did not become ready in time.`);
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, MANAGED_BACKEND_POLL_MS);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
}

/** Read the Desktop-owned service, never whichever remote connection is selected. */
export async function managedClioVersion(signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const handle = await getManagedBackend();
  if (handle.status.kind !== 'ready')
    throw new Error(t`The updated local ${agent} service is not ready.`);
  const { createRepository } = await import('@/lib/connection');
  const capabilities = await createRepository({
    endpoint: handle.url,
    token: handle.bearer_token,
  }).capabilities(signal);
  const version = displayReleaseVersion(capabilities.service?.version);
  if (!version)
    throw new Error(t`The local ${agent} service did not report its running version.`);
  return version;
}

/** A reconnect is insufficient: compare every updated component with the saved release. */
export async function verifyClioUpdate(
  marker: PendingUpdateMarker,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const target = displayReleaseVersion(marker.version);
  if (!target || !/^\d+\.\d+\.\d+(?:[.-][\da-z.-]+)?$/iu.test(target))
    throw new Error(
      t`The update target was not retained. Check ${agent} versions before retrying.`,
    );
  {
    const { getVersion } = await import('@tauri-apps/api/app');
    const desktop = displayReleaseVersion(await getVersion());
    if (!desktop || compareReleaseVersions(desktop, target) !== 0) {
      throw new Error(
        t`${agent} update is incomplete: the app is ${ph({ installed: desktop ?? t`unknown` })}, expected ${target}.`,
      );
    }
  }
  if (marker.action !== 'desktop') {
    await waitForUpdatedRuntime(signal);
    const runtime = await managedClioVersion(signal);
    if (compareReleaseVersions(runtime, target) !== 0) {
      throw new Error(
        t`${agent} update is incomplete: the runtime is ${runtime}, expected ${target}.`,
      );
    }
  }
}
