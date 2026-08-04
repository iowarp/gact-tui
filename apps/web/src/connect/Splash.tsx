import { useEffect, useRef, useState, type ReactElement } from 'react';
import { brand } from '@brand';
import {
  connectBackend,
  type ConnectFailure,
  type ConnectResult,
  type ConnectedBackend,
} from '../backend/connection';
import { Lockup } from '../shell/Lockup';
import type { ProbeCandidate } from './candidates';
import './splash.css';

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
  const initial = useRef({
    candidates: props.candidates,
    connect: props.connect ?? connectBackend,
    onReady: props.onReady,
    onFallback: props.onFallback,
  }).current;
  const [probingUrl, setProbingUrl] = useState<string | null>(initial.candidates[0]?.url ?? null);

  useEffect(() => {
    let cancelled = false;
    let cancelActiveProbe: (() => void) | null = null;

    const probe = async (): Promise<void> => {
      if (cancelled) return;
      let lastFailure: ConnectFailure | null = null;

      for (const candidate of initial.candidates) {
        if (cancelled) return;
        setProbingUrl(candidate.url);

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<ConnectFailure>((resolve) => {
          timeoutId = setTimeout(
            () =>
              resolve({
                kind: 'failed',
                url: candidate.url,
                reason: 'unreachable',
                detail: `probe timeout after ${PROBE_TIMEOUT_MS}ms`,
              }),
            PROBE_TIMEOUT_MS,
          );
        });
        const cancellation = new Promise<null>((resolve) => {
          cancelActiveProbe = () => resolve(null);
        });

        let result: ConnectResult | null;
        try {
          result = await Promise.race([
            initial.connect(candidate.url, candidate.token || undefined),
            timeout,
            cancellation,
          ]);
        } catch (error) {
          result = {
            kind: 'failed',
            url: candidate.url,
            reason: 'unreachable',
            detail: error instanceof Error ? error.message : String(error),
          };
        } finally {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          cancelActiveProbe = null;
        }

        if (cancelled || result === null) return;
        if (result.kind === 'failed') {
          lastFailure = result;
          continue;
        }

        initial.onReady(result);
        return;
      }

      if (!cancelled) initial.onFallback(lastFailure);
    };

    // Deferring one microtask prevents React StrictMode's development-only
    // setup/cleanup rehearsal from starting a duplicate network probe.
    void Promise.resolve().then(probe);
    return () => {
      cancelled = true;
      cancelActiveProbe?.();
    };
  }, [initial]);

  return (
    <div className="splash" data-testid="splash-screen">
      <main className="splash__main">
        <Lockup brand={brand} />
        <p className="splash__status" role="status" aria-live="polite">
          Starting your local agent…{probingUrl ? ` probing ${probingUrl}` : ''}
        </p>
      </main>
    </div>
  );
}
