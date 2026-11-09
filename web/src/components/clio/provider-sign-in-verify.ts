import type { LanguageModelPreset, ProviderHandshake } from '@clio/core/v3';

/** How often a just-signed-in provider is read again while it gets ready. */
export const SIGN_IN_VERIFY_POLL_MS = 2000;
/** How often the wait asks the provider itself (a live handshake) instead of only reading. */
export const SIGN_IN_VERIFY_CHECK_MS = 10_000;
/**
 * How long a completed sign-in waits for the provider to report ready. The
 * agent may first install the provider's client and run its handshake
 * (GitHub Copilot takes about two minutes on a fresh machine).
 */
export const SIGN_IN_VERIFY_TIMEOUT_MS = 5 * 60_000;

/**
 * Whether the agent reports a provider signed in AND usable. A signed-in
 * provider with no model chosen yet (`configured: false` on the
 * configuration) is ready: choosing a model is the next step, not signing in.
 */
export function signedInProviderReady(preset: LanguageModelPreset | undefined): boolean {
  return Boolean(preset?.is_authenticated) && (!preset?.status || preset.status === 'ready');
}

function handshakePassed(result: ProviderHandshake | undefined): boolean {
  return result?.connectivity === 'ok' && result.auth === 'ok';
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export interface SignInVerification {
  ready: boolean;
  /** The latest live handshake, when one ran. */
  check?: ProviderHandshake;
}

interface VerifySignedInProviderInput {
  /** A fresh read of the provider's preset (`GET /v1/providers/lm`). */
  read: () => Promise<LanguageModelPreset | undefined>;
  /** A live handshake with `refresh=true`. */
  check: () => Promise<ProviderHandshake>;
  signal: AbortSignal;
  pollMs?: number;
  checkEveryMs?: number;
  timeoutMs?: number;
}

/**
 * Waits after a sign-in completes until the agent reports the provider
 * ready. The auth flow's `complete` only means the credential was accepted;
 * the agent may still be installing the provider's client and verifying its
 * models, and reports the provider signed out meanwhile. Reads are retried
 * through transient failures; a live handshake runs on the first round and
 * then at most every `checkEveryMs`, so readiness never depends on someone
 * refreshing by hand.
 */
export async function verifySignedInProvider({
  read,
  check,
  signal,
  pollMs = SIGN_IN_VERIFY_POLL_MS,
  checkEveryMs = SIGN_IN_VERIFY_CHECK_MS,
  timeoutMs = SIGN_IN_VERIFY_TIMEOUT_MS,
}: VerifySignedInProviderInput): Promise<SignInVerification> {
  const deadline = Date.now() + timeoutMs;
  let latestCheck: ProviderHandshake | undefined;
  let checkedAt = Number.NEGATIVE_INFINITY;
  while (!signal.aborted) {
    const preset = await Promise.resolve()
      .then(read)
      .catch(() => undefined);
    if (signedInProviderReady(preset)) return { ready: true, check: latestCheck };
    if (preset?.is_authenticated && handshakePassed(latestCheck)) {
      return { ready: true, check: latestCheck };
    }
    if (Date.now() >= deadline) break;
    if (Date.now() - checkedAt >= checkEveryMs) {
      checkedAt = Date.now();
      latestCheck =
        (await Promise.resolve()
          .then(check)
          .catch(() => undefined)) ?? latestCheck;
      if (signal.aborted) break;
      continue;
    }
    await pause(pollMs, signal);
  }
  return { ready: false, check: latestCheck };
}
