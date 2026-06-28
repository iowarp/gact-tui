/**
 * Single dynamic-import seam for the `@tauri-apps/api` surface used by the
 * desktop bridge modules (`tauri_http.ts`, `tauri_install.ts`, `tauri_ssh.ts`,
 * `tauri_sse.ts`, `tauri.ts`).
 *
 * Every Tauri call is reached through this module so the imports of
 * `@tauri-apps/api/core` and `@tauri-apps/api/event` live in exactly one place
 * instead of being copy-pasted inline across the seam. The dynamic `import()`
 * keeps those packages out of the pure-web entry bundle when tree-shaking can
 * prove `inTauri()` is false, and avoids a hard parse-error in Node-side tests
 * that never enter the Tauri code path.
 */

/** Invoke a Rust-side Tauri command. Thin wrapper over `@tauri-apps/api/core`. */
export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** Construct a Tauri `Channel` for streamed command responses. */
export async function createChannel<T>(): Promise<import('@tauri-apps/api/core').Channel<T>> {
  const { Channel } = await import('@tauri-apps/api/core');
  return new Channel<T>();
}

/** Tauri event payload envelope: only the `payload` field is used by the seam. */
export interface TauriEvent<T> {
  payload: T;
}

/** Unsubscribe function returned by {@link listen}/{@link listenTauriEvent}. */
export type UnlistenFn = () => void;

/** Attach a raw listener to a Tauri event. Thin wrapper over `@tauri-apps/api/event`. */
export async function listen<T>(
  event: string,
  handler: (event: TauriEvent<T>) => void,
): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(event, handler);
}

/**
 * Subscribe to a Tauri event with synchronous cancellation semantics.
 *
 * `listen()` is async (the Rust side must register the channel), so a caller
 * may have torn down before the listener attaches. This helper bridges that
 * gap: it returns a synchronous unsubscribe immediately, detaches the real
 * listener once it resolves, and — if cancellation already happened — detaches
 * it on arrival so no event is ever delivered after cleanup.
 *
 * Both `onMenuAction` and `onInstallProgress` previously open-coded this exact
 * dynamic-import + listen + unlistener-accumulation dance; they now share it.
 */
export function listenTauriEvent<T>(
  event: string,
  handler: (payload: T) => void,
): UnlistenFn {
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  void listen<T>(event, (e) => handler(e.payload)).then((un) => {
    // The subscriber may have cleaned up before listen() resolved.
    if (cancelled) un();
    else unlisten = un;
  });
  return () => {
    cancelled = true;
    unlisten?.();
    unlisten = null;
  };
}
