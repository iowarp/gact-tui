import { invoke } from '@tauri-apps/api/core';
import { openExternalUrl } from './external-url';

/** Share Desktop browser returns across storage and MCP; only the initiating service exchanges codes. */
export async function receiveBrowserSignIn<T extends { authorization_url: string }>(options: {
  provider: string;
  start: (redirectUri: string) => Promise<T>;
  complete: (flow: T, callbackUrl: string) => Promise<void>;
  signal: AbortSignal;
}): Promise<void> {
  const receiver = await invoke<{ id: string; redirect_uri: string }>('storage_oauth_listen', {
    provider: options.provider,
  });
  const cancel = () => {
    void invoke('storage_oauth_cancel', { id: receiver.id }).catch(() => undefined);
  };
  options.signal.addEventListener('abort', cancel, { once: true });
  try {
    options.signal.throwIfAborted();
    const flow = await options.start(receiver.redirect_uri);
    options.signal.throwIfAborted();
    if (!flow.authorization_url) return;
    const state = new URL(flow.authorization_url).searchParams.get('state');
    if (!state) throw new Error('The sign-in service did not return a state');
    await openExternalUrl(flow.authorization_url);
    const callback = await invoke<string>('storage_oauth_receive', {
      id: receiver.id,
      expectedState: state,
    });
    options.signal.throwIfAborted();
    await options.complete(flow, callback);
  } finally {
    options.signal.removeEventListener('abort', cancel);
    cancel();
  }
}
