import { useLiveStore } from '@/store/live-store';

/** Returns a scalar count so text deltas do not invalidate the workspace route. */
export function useSessionMessageCount(sessionId: string): number {
  return useLiveStore((state) => {
    let count = 0;
    for (const message of Object.values(state.entities.messages)) {
      if (message.session_id === sessionId) count += 1;
    }
    return count;
  });
}
