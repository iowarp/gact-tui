/**
 * Wires window online/offline/focus/visibility events to stream resilience
 * (teardown + reconnect on drop, recover on focus). Exports
 * {@link installLiveTranscriptConnectionListeners}, returning an unsubscribe fn.
 */
import type { Setter } from 'solid-js';
import type { LiveConnectionStatus } from './LiveReconnect.js';

export interface LiveTranscriptConnectionListenerOptions {
  isDisposed: () => boolean;
  teardown: () => void;
  setStatus: Setter<LiveConnectionStatus>;
  scheduleReconnect: () => void;
  reconnectNow: () => void;
  onFocus: () => void;
}

export function installLiveTranscriptConnectionListeners(
  options: LiveTranscriptConnectionListenerOptions,
): () => void {
  const onOffline = () => {
    if (options.isDisposed()) return;
    options.teardown();
    options.setStatus('error');
    options.scheduleReconnect();
  };
  const onOnline = () => {
    options.reconnectNow();
  };
  const onFocus = () => {
    if (options.isDisposed()) return;
    options.onFocus();
  };
  const onVisibilityChange = () => {
    if (options.isDisposed() || document.visibilityState !== 'visible') return;
    onFocus();
  };

  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
