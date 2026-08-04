import type { ReactElement } from 'react';
import type { ConnectFailure, ConnectResult, ConnectedBackend } from '../backend/connection';
import type { ProbeCandidate } from './candidates';

/** Per-candidate probe budget, carried over from the legacy splash. */
export const PROBE_TIMEOUT_MS = 2_500;

export interface SplashProps {
  candidates: ProbeCandidate[];
  /** Injectable connect for tests; defaults to backend/connection's. */
  connect?: (url: string, bearerToken?: string) => Promise<ConnectResult>;
  onReady: (backend: ConnectedBackend) => void;
  /** Every candidate failed; carries the LAST typed failure, or null. */
  onFallback: (failure: ConnectFailure | null) => void;
}

/**
 * Boot splash (P5 slice F): probes candidates sequentially and never shows a
 * URL form — the ConnectScreen is the fallback route, not the default.
 */
export function Splash(props: SplashProps): ReactElement {
  void props;
  throw new Error('unimplemented: slice F (gact-tui#322) — contract in tests/unit/splash-boot.test.tsx');
}
