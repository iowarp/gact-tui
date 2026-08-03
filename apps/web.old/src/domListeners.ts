/**
 * Typed window/document event-listener registration helpers that return a
 * disposer, for use inside Solid `onCleanup`.
 */
import { onCleanup } from 'solid-js';

type KeydownHandler = (event: KeyboardEvent) => void;

export function registerWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
) {
  window.addEventListener(type, handler as EventListener, options);
  onCleanup(() => window.removeEventListener(type, handler as EventListener, options));
}

export function registerDocumentEvent<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
) {
  document.addEventListener(type, handler as EventListener, options);
  onCleanup(() => document.removeEventListener(type, handler as EventListener, options));
}

export function registerWindowKeydown(
  handler: KeydownHandler,
  options?: boolean | AddEventListenerOptions,
) {
  registerWindowEvent('keydown', handler, options);
}

export function registerDocumentKeydown(
  handler: KeydownHandler,
  options?: boolean | AddEventListenerOptions,
) {
  registerDocumentEvent('keydown', handler, options);
}
