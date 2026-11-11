import type { ReactNode } from 'react';
import { ConnectionStateOverride } from '@/hooks/use-connection-indicator-state';

/**
 * Pins the connection indicator to `live`. The app's composer holds sends while the
 * service is unreachable; a unit test has no service, so it states the stream is live.
 */
export function LiveConnection({ children }: { children: ReactNode }) {
  return <ConnectionStateOverride.Provider value="live">{children}</ConnectionStateOverride.Provider>;
}
