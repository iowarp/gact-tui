import { useEffect, useRef, useSyncExternalStore } from 'react';
import menuSpec from './menu-actions.json';
import { inTauri } from '@/lib/transport/tauri-runtime';

export type MenuAction = (typeof menuSpec.actions)[number];
export const MENU_ACTION_EVENT = 'clio:menu-action';
const knownActions = new Set<string>(menuSpec.actions);

const mounted = new Map<MenuAction, number>();
const mountedListeners = new Set<() => void>();

function setMounted(action: MenuAction, delta: 1 | -1): void {
  const count = (mounted.get(action) ?? 0) + delta;
  if (count > 0) mounted.set(action, count);
  else mounted.delete(action);
  for (const listener of mountedListeners) listener();
}

function subscribeMounted(listener: () => void): () => void {
  mountedListeners.add(listener);
  return () => mountedListeners.delete(listener);
}

/** Dispatch an application action from product-owned desktop chrome. */
export function dispatchMenuAction(action: MenuAction): void {
  window.dispatchEvent(new CustomEvent<MenuAction>(MENU_ACTION_EVENT, { detail: action }));
}

/** Bridges the native desktop menu into one browser-neutral product event. */
export function useNativeMenuBridge(): void {
  useEffect(() => {
    if (!inTauri()) return;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      unlisten = await listen<{ action?: unknown }>('clio:menu', ({ payload }) => {
        if (typeof payload.action !== 'string' || !knownActions.has(payload.action)) return;
        dispatchMenuAction(payload.action as MenuAction);
      });
    });
    return () => unlisten?.();
  }, []);
}

/**
 * Registers a feature workflow for a menu action. The latest `handler` runs, so
 * an inline function doesn't re-register on every render.
 */
export function useMenuAction(action: MenuAction, handler: () => void, enabled = true): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: Event) => {
      if ((event as CustomEvent<MenuAction>).detail === action) handlerRef.current();
    };
    window.addEventListener(MENU_ACTION_EVENT, listener);
    setMounted(action, 1);
    return () => {
      window.removeEventListener(MENU_ACTION_EVENT, listener);
      setMounted(action, -1);
    };
  }, [action, enabled]);
}

/** Whether a mounted workflow handles `action`, so a menu can disable it on other pages. */
export function useMenuActionAvailable(action: MenuAction): boolean {
  return useSyncExternalStore(
    subscribeMounted,
    () => mounted.has(action),
    () => false,
  );
}
