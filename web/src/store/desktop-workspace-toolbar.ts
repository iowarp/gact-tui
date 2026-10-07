import { create } from 'zustand';

/** DOM destination owned by the title bar; portals retain their sidebar and route context. */
export const useDesktopWorkspaceToolbar = create<{
  host: HTMLDivElement | null;
  navigationHost: HTMLDivElement | null;
  setHost: (host: HTMLDivElement | null) => void;
  setNavigationHost: (navigationHost: HTMLDivElement | null) => void;
}>((set) => ({
  host: null,
  navigationHost: null,
  setHost: (host) => set({ host }),
  setNavigationHost: (navigationHost) => set({ navigationHost }),
}));
