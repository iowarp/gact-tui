import type { BackendRegistryState } from '@clio/core';

/** One backend the splash will try: a URL plus the token saved for it. */
export interface ProbeCandidate {
  url: string;
  token: string;
}

/**
 * Ordered probe list for the boot splash (P5 slice F, ported from
 * web.old/src/routes/splashBackend.ts): the current saved backend first, then
 * the other saved backends, then the brand default on both host forms —
 * deduplicated on url+token.
 */
export function probeCandidates(state: BackendRegistryState, attachPort: number): ProbeCandidate[] {
  void state;
  void attachPort;
  throw new Error('unimplemented: slice F (gact-tui#322) — contract in tests/unit/splash-boot.test.tsx');
}
