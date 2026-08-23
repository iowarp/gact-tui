import { useEffect } from 'react';
import menuSpec from './menu-actions.json';
import { inTauri } from '@/lib/transport/tauri-runtime';

export type MenuAction = (typeof menuSpec.actions)[number];
export const MENU_ACTION_EVENT = 'clio:menu-action';
const knownActions = new Set<string>(menuSpec.actions);

/** Bridges the native desktop menu into one browser-neutral product event. */
export function useNativeMenuBridge(): void {
  useEffect(() => {
    if (!inTauri()) return;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      unlisten = await listen<{ action?: unknown }>('clio:menu', ({ payload }) => {
        if (typeof payload.action !== 'string' || !knownActions.has(payload.action)) return;
        window.dispatchEvent(
          new CustomEvent<MenuAction>(MENU_ACTION_EVENT, { detail: payload.action }),
        );
      });
    });
    return () => unlisten?.();
  }, []);
}

/** Registers a feature workflow for a native menu action. */
export function useMenuAction(action: MenuAction, handler: () => void): void {
  useEffect(() => {
    const listener = (event: Event) => {
      if ((event as CustomEvent<MenuAction>).detail === action) handler();
    };
    window.addEventListener(MENU_ACTION_EVENT, listener);
    return () => window.removeEventListener(MENU_ACTION_EVENT, listener);
  }, [action, handler]);
}
