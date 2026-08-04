import type { BackendRegistryState } from '@clio/core';
import { normalizeBackendUrl } from '../backend/connection';

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
  const candidates: ProbeCandidate[] = [];
  const current =
    state.backends.find((backend) => backend.id === state.currentId) ?? state.backends[0];

  if (current) {
    candidates.push({ url: current.url, token: current.bearerToken ?? '' });
  }
  for (const backend of state.backends) {
    if (backend.id === current?.id) continue;
    candidates.push({ url: backend.url, token: backend.bearerToken ?? '' });
  }
  candidates.push(
    { url: `http://127.0.0.1:${attachPort}`, token: '' },
    { url: `http://localhost:${attachPort}`, token: '' },
  );

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const normalizedUrl =
      normalizeBackendUrl(candidate.url) ?? candidate.url.trim().replace(/\/+$/, '');
    const key = `${normalizedUrl}\n${candidate.token}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
