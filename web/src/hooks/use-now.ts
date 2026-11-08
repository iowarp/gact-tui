import { useSharedNow } from '@/lib/shared-clock';

/** The current time, refreshed by the shared clock once a second while 	icking. */
export function useNow(ticking: boolean): number {
  return useSharedNow(ticking);
}