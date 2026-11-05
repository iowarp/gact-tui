import { create } from 'zustand';

/**
 * The task a link asked Work to show (a background script's launch row, its notify
 * message). The task's row opens and scrolls into view when it renders, then clears
 * the request, so a later render of the list leaves the reader where they are.
 */
interface WorkTaskFocus {
  handle?: string;
  focus: (handle: string) => void;
  clear: (handle: string) => void;
}

export const useWorkTaskFocus = create<WorkTaskFocus>((set) => ({
  handle: undefined,
  focus: (handle) => set({ handle }),
  clear: (handle) => set((state) => (state.handle === handle ? { handle: undefined } : state)),
}));

/** Show the task `handle` in Work: ask for its row, then open Work. */
export function showTaskInWork(handle: string, openWork: () => void): void {
  useWorkTaskFocus.getState().focus(handle);
  openWork();
}
