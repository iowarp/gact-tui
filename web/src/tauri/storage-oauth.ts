import type { ClioRepository } from '@clio/core/v3';
import { invoke } from '@tauri-apps/api/core';
import { openExternalUrl } from './external-url';

/** Receive provider consent on this Desktop and complete it only on the initiating CLIO. */
export async function signInToStorage(
  repository: Pick<ClioRepository, 'startSourceSignIn' | 'completeSourceSignIn'>,
  workspaceId: string,
  sourceId: string,
  provider: string,
  signal: AbortSignal,
): Promise<void> {
  const receiver = await invoke<{ id: string; redirect_uri: string }>('storage_oauth_listen', {
    provider,
  });
  const cancel = () => {
    void invoke('storage_oauth_cancel', { id: receiver.id }).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    const flow = await repository.startSourceSignIn(workspaceId, sourceId, receiver.redirect_uri);
    signal.throwIfAborted();
    const state = new URL(flow.authorization_url).searchParams.get('state');
    if (!state) throw new Error('The sign-in service did not return a state');
    await openExternalUrl(flow.authorization_url);
    const callback = await invoke<string>('storage_oauth_receive', {
      id: receiver.id,
      expectedState: state,
    });
    signal.throwIfAborted();
    await repository.completeSourceSignIn(workspaceId, sourceId, flow.flow_id, callback);
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
  }
}
